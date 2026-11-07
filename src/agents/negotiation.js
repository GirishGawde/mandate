import { validateNegotiationMessage } from './messageSchema.js';
import { generateBuyerTurn } from './buyerAgent.js';
import { generateMerchantTurn } from './merchantAgent.js';
import { getItem } from '../data/merchants.js';
import { createLlm, LlmUnavailableError } from './llm.js';
import { normalDealTranscript } from './scripted/normalDeal.js';
import { attackDealTranscript } from './scripted/attackDeal.js';

/**
 * Runs a scripted negotiation by feeding canned messages through the exact same
 * code-enforced guardrails (schema validation, floorPrice clamp, accept check).
 */
async function runScriptedValidationLoop({
  item,
  cannedList,
  maxRounds,
  transcript,
  logs,
  onMessage,
  notice,
}) {
  let lastMerchantOffer = null;
  let lastBuyerOffer = null;
  let round = 0;
  let cannedIdx = 0;

  while (round < maxRounds && cannedIdx < cannedList.length) {
    round++;

    // 1. Next Buyer Turn in transcript
    const rawBuyerMsg = cannedList[cannedIdx++];
    if (!rawBuyerMsg) break;

    const buyerVal = validateNegotiationMessage(rawBuyerMsg);
    if (!buyerVal.success) {
      throw new Error(`Invalid scripted buyer message: ${buyerVal.error}`);
    }
    const buyerMsg = buyerVal.data;

    // Buyer Accept Check
    if (buyerMsg.action === 'accept') {
      const matchesPrice = lastMerchantOffer && buyerMsg.unitPrice === lastMerchantOffer.unitPrice;
      const matchesQty = lastMerchantOffer && buyerMsg.quantity === lastMerchantOffer.quantity;

      if (!matchesPrice || !matchesQty) {
        logs.push({
          type: 'invalid_buyer_accept',
          reason: 'price_or_quantity_mismatch',
          attempted: { unitPrice: buyerMsg.unitPrice, quantity: buyerMsg.quantity },
          expected: lastMerchantOffer,
          round,
        });
        transcript.push(buyerMsg);
        onMessage?.(buyerMsg);
        return {
          status: 'no_deal',
          reason: 'invalid_accept_unoffered_price',
          transcript,
          logs,
          rounds: round,
          ...(notice ? { notice } : {}),
        };
      }

      transcript.push(buyerMsg);
      onMessage?.(buyerMsg);
      const deal = {
        item,
        unitPrice: buyerMsg.unitPrice,
        quantity: buyerMsg.quantity,
        total: Number((buyerMsg.unitPrice * buyerMsg.quantity).toFixed(2)),
        agreedBy: 'buyer',
        rounds: round,
      };
      return {
        status: 'deal',
        deal,
        transcript,
        logs,
        rounds: round,
        ...(notice ? { notice } : {}),
      };
    }

    if (buyerMsg.action === 'reject') {
      transcript.push(buyerMsg);
      onMessage?.(buyerMsg);
      return {
        status: 'no_deal',
        reason: 'buyer_rejected',
        transcript,
        logs,
        rounds: round,
        ...(notice ? { notice } : {}),
      };
    }

    lastBuyerOffer = { unitPrice: buyerMsg.unitPrice, quantity: buyerMsg.quantity };
    transcript.push(buyerMsg);
    onMessage?.(buyerMsg);

    if (cannedIdx >= cannedList.length) break;

    // 2. Next Merchant Turn in transcript
    const rawMerchantMsg = cannedList[cannedIdx++];
    if (!rawMerchantMsg) break;

    const merchantVal = validateNegotiationMessage(rawMerchantMsg);
    if (!merchantVal.success) {
      throw new Error(`Invalid scripted merchant message: ${merchantVal.error}`);
    }
    const merchantMsg = merchantVal.data;

    // Merchant Floor Price Rule
    if (merchantMsg.unitPrice < item.floorPrice) {
      const originalPrice = merchantMsg.unitPrice;
      merchantMsg.unitPrice = item.floorPrice;
      logs.push({
        type: 'floor_price_clamped',
        original: originalPrice,
        clamped: item.floorPrice,
        floorPrice: item.floorPrice,
        round,
      });
    }

    // Merchant Accept Check
    if (merchantMsg.action === 'accept') {
      if (!lastBuyerOffer || lastBuyerOffer.unitPrice < item.floorPrice) {
        logs.push({
          type: 'invalid_merchant_accept_below_floor',
          buyerOffer: lastBuyerOffer?.unitPrice,
          floorPrice: item.floorPrice,
          round,
        });
        transcript.push(merchantMsg);
        onMessage?.(merchantMsg);
        return {
          status: 'no_deal',
          reason: 'merchant_accept_below_floor_blocked',
          transcript,
          logs,
          rounds: round,
          ...(notice ? { notice } : {}),
        };
      }

      transcript.push(merchantMsg);
      onMessage?.(merchantMsg);
      const deal = {
        item,
        unitPrice: merchantMsg.unitPrice,
        quantity: merchantMsg.quantity,
        total: Number((merchantMsg.unitPrice * merchantMsg.quantity).toFixed(2)),
        agreedBy: 'merchant',
        rounds: round,
      };
      return {
        status: 'deal',
        deal,
        transcript,
        logs,
        rounds: round,
        ...(notice ? { notice } : {}),
      };
    }

    if (merchantMsg.action === 'reject') {
      transcript.push(merchantMsg);
      onMessage?.(merchantMsg);
      return {
        status: 'no_deal',
        reason: 'merchant_rejected',
        transcript,
        logs,
        rounds: round,
        ...(notice ? { notice } : {}),
      };
    }

    lastMerchantOffer = { unitPrice: merchantMsg.unitPrice, quantity: merchantMsg.quantity };
    transcript.push(merchantMsg);
    onMessage?.(merchantMsg);
  }

  return {
    status: 'no_deal',
    reason: 'round_limit_reached',
    transcript,
    logs,
    rounds: round,
    ...(notice ? { notice } : {}),
  };
}

/**
 * Orchestrates a bounded negotiation loop (max 6 rounds) between buyer and merchant agents.
 * All guardrail rules are enforced in deterministic code, never delegated to LLM prompts:
 * 1. Merchant unit price can NEVER go below item floorPrice (clamped and logged).
 * 2. Buyer accept is valid ONLY if price and quantity match merchant's last offer.
 * 3. Max 6 rounds; terminates on deal, reject, or round limit.
 * 4. Resilient to LLM outages: catches LLM_UNAVAILABLE and replays scripted transcript
 *    through the exact same validation path with a visible notice (never silent fallback).
 *
 * @param {object} params
 * @param {object|string} params.item - Catalog item object or item ID
 * @param {string} [params.goal] - User shopping goal
 * @param {object} [params.mandate] - Active mandate rules (read-only for planning)
 * @param {object} [params.buyerLlm] - Injected buyer LLM
 * @param {object} [params.merchantLlm] - Injected merchant LLM
 * @param {'honest'|'shady'} [params.persona] - Merchant persona
 * @param {boolean} [params.attack] - Whether this is an attack scenario
 * @param {'live'|'scripted'} [params.mode]
 * @param {Array<object>} [params.scriptedTranscript] - Custom canned transcript
 * @param {number} [params.maxRounds] - Max negotiation rounds (default 6)
 * @param {Function} [params.onMessage] - Callback emitted on each validated turn
 * @returns {Promise<{ status: 'deal'|'no_deal', deal?: object, reason?: string, transcript: Array<object>, logs: Array<object>, rounds: number, notice?: string }>}
 */
export async function negotiate({
  item: itemOrId,
  goal = 'Find the best deal',
  mandate,
  buyerLlm = createLlm(),
  merchantLlm = createLlm(),
  persona = 'honest',
  attack = false,
  mode = process.env.NEGOTIATION_MODE ?? 'live',
  scriptedTranscript,
  maxRounds = 6,
  onMessage,
}) {
  const item = typeof itemOrId === 'string' ? getItem(itemOrId) : itemOrId;
  if (!item) {
    throw new Error('negotiate requires a valid catalog item or item ID');
  }

  const isScripted =
    mode === 'scripted' ||
    buyerLlm.mode === 'scripted' ||
    merchantLlm.mode === 'scripted' ||
    Boolean(scriptedTranscript);

  const cannedList =
    scriptedTranscript ||
    (persona === 'shady' || attack ? attackDealTranscript : normalDealTranscript);

  const transcript = [];
  const logs = [];

  // If in scripted mode from the start, run the scripted validation loop
  if (isScripted) {
    return await runScriptedValidationLoop({
      item,
      cannedList,
      maxRounds,
      transcript,
      logs,
      onMessage,
    });
  }

  // Live negotiation loop with fallback handling
  let lastMerchantOffer = null;
  let lastBuyerOffer = null;
  let round = 0;

  try {
    while (round < maxRounds) {
      round++;

      // STEP 1: Buyer Turn
      const rawBuyerMsg = await generateBuyerTurn({
        goal,
        mandate,
        item,
        history: transcript,
        llm: buyerLlm,
      });

      const buyerValidation = validateNegotiationMessage(rawBuyerMsg);
      if (!buyerValidation.success) {
        throw new Error(`Invalid buyer negotiation message: ${buyerValidation.error}`);
      }
      const buyerMsg = buyerValidation.data;

      if (buyerMsg.action === 'accept') {
        const matchesPrice = lastMerchantOffer && buyerMsg.unitPrice === lastMerchantOffer.unitPrice;
        const matchesQty = lastMerchantOffer && buyerMsg.quantity === lastMerchantOffer.quantity;

        if (!matchesPrice || !matchesQty) {
          logs.push({
            type: 'invalid_buyer_accept',
            reason: 'price_or_quantity_mismatch',
            attempted: { unitPrice: buyerMsg.unitPrice, quantity: buyerMsg.quantity },
            expected: lastMerchantOffer,
            round,
          });
          transcript.push(buyerMsg);
          onMessage?.(buyerMsg);
          return {
            status: 'no_deal',
            reason: 'invalid_accept_unoffered_price',
            transcript,
            logs,
            rounds: round,
          };
        }

        transcript.push(buyerMsg);
        onMessage?.(buyerMsg);
        const deal = {
          item,
          unitPrice: buyerMsg.unitPrice,
          quantity: buyerMsg.quantity,
          total: Number((buyerMsg.unitPrice * buyerMsg.quantity).toFixed(2)),
          agreedBy: 'buyer',
          rounds: round,
        };
        return {
          status: 'deal',
          deal,
          transcript,
          logs,
          rounds: round,
        };
      }

      if (buyerMsg.action === 'reject') {
        transcript.push(buyerMsg);
        onMessage?.(buyerMsg);
        return {
          status: 'no_deal',
          reason: 'buyer_rejected',
          transcript,
          logs,
          rounds: round,
        };
      }

      lastBuyerOffer = { unitPrice: buyerMsg.unitPrice, quantity: buyerMsg.quantity };
      transcript.push(buyerMsg);
      onMessage?.(buyerMsg);

      // STEP 2: Merchant Turn
      const rawMerchantMsg = await generateMerchantTurn({
        item,
        history: transcript,
        persona,
        attack,
        llm: merchantLlm,
      });

      const merchantValidation = validateNegotiationMessage(rawMerchantMsg);
      if (!merchantValidation.success) {
        throw new Error(`Invalid merchant negotiation message: ${merchantValidation.error}`);
      }
      const merchantMsg = merchantValidation.data;

      if (merchantMsg.unitPrice < item.floorPrice) {
        const originalPrice = merchantMsg.unitPrice;
        merchantMsg.unitPrice = item.floorPrice;
        logs.push({
          type: 'floor_price_clamped',
          original: originalPrice,
          clamped: item.floorPrice,
          floorPrice: item.floorPrice,
          round,
        });
      }

      if (merchantMsg.action === 'accept') {
        if (!lastBuyerOffer || lastBuyerOffer.unitPrice < item.floorPrice) {
          logs.push({
            type: 'invalid_merchant_accept_below_floor',
            buyerOffer: lastBuyerOffer?.unitPrice,
            floorPrice: item.floorPrice,
            round,
          });
          transcript.push(merchantMsg);
          onMessage?.(merchantMsg);
          return {
            status: 'no_deal',
            reason: 'merchant_accept_below_floor_blocked',
            transcript,
            logs,
            rounds: round,
          };
        }

        transcript.push(merchantMsg);
        onMessage?.(merchantMsg);
        const deal = {
          item,
          unitPrice: merchantMsg.unitPrice,
          quantity: merchantMsg.quantity,
          total: Number((merchantMsg.unitPrice * merchantMsg.quantity).toFixed(2)),
          agreedBy: 'merchant',
          rounds: round,
        };
        return {
          status: 'deal',
          deal,
          transcript,
          logs,
          rounds: round,
        };
      }

      if (merchantMsg.action === 'reject') {
        transcript.push(merchantMsg);
        onMessage?.(merchantMsg);
        return {
          status: 'no_deal',
          reason: 'merchant_rejected',
          transcript,
          logs,
          rounds: round,
        };
      }

      lastMerchantOffer = { unitPrice: merchantMsg.unitPrice, quantity: merchantMsg.quantity };
      transcript.push(merchantMsg);
      onMessage?.(merchantMsg);
    }

    return {
      status: 'no_deal',
      reason: 'round_limit_reached',
      transcript,
      logs,
      rounds: round,
    };
  } catch (err) {
    // If live call fails with LLM_UNAVAILABLE: fall back to scripted replay with visible notice
    const isLlmUnavailable =
      err?.name === 'LLM_UNAVAILABLE' ||
      err?.code === 'LLM_UNAVAILABLE' ||
      err instanceof LlmUnavailableError;

    if (isLlmUnavailable) {
      const noticeText = 'Live AI unavailable, replaying scripted negotiation.';
      logs.push({
        type: 'llm_unavailable_fallback',
        error: err.message,
        round,
      });

      // Discard partial live messages so transcript is never mixed with live + scripted
      transcript.length = 0;

      // Notice message must have no price or quantity fields
      const noticeMsg = {
        from: 'system',
        action: 'notice',
        text: noticeText,
      };
      transcript.push(noticeMsg);
      onMessage?.(noticeMsg);

      // Replay scripted transcript through the same validation code path
      return await runScriptedValidationLoop({
        item,
        cannedList,
        maxRounds,
        transcript,
        logs,
        onMessage,
        notice: noticeText,
      });
    }

    throw err;
  }
}

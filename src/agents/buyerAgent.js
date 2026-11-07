import { z } from 'zod';
import { generateObject as aiGenerateObject } from 'ai';
import { NegotiationActionSchema, NegotiationMessageSchema } from './messageSchema.js';
import { buildBuyerPrompt } from './prompts/buyer.js';
import { createLlm } from './llm.js';
import { searchCatalog } from '../data/merchants.js';
import { normalDealTranscript } from './scripted/normalDeal.js';
import { attackDealTranscript } from './scripted/attackDeal.js';

const BuyerTurnSchema = z
  .object({
    action: NegotiationActionSchema,
    unitPrice: z.number().finite().positive().max(1_000_000),
    quantity: z.number().int().min(1).max(10_000),
    text: z.string().trim().max(280),
  })
  .strict();

/**
 * Generates the buyer agent's turn in a negotiation.
 *
 * @param {object} params
 * @param {string} [params.goal]
 * @param {object} [params.mandate]
 * @param {object} params.item - Catalog item being negotiated
 * @param {Array<object>} [params.history] - Prior messages in this negotiation
 * @param {object} [params.llm] - Injected LLM interface
 * @param {Array<object>} [params.scriptedMessages] - Optional explicit canned transcript to pull from
 * @param {boolean} [params.attack] - Whether this is an attack scenario in scripted mode
 * @returns {Promise<import('zod').infer<typeof NegotiationMessageSchema>>}
 */
export async function generateBuyerTurn({
  goal = 'Find the best deal',
  mandate,
  item,
  history = [],
  llm = createLlm(),
  scriptedMessages,
  attack = false,
}) {
  if (llm.mode === 'scripted' || scriptedMessages) {
    const transcript = scriptedMessages || (attack ? attackDealTranscript : normalDealTranscript);
    const buyerMessages = transcript.filter((m) => m.from === 'buyer');
    const buyerTurnIndex = history.filter((m) => m.from === 'buyer').length;
    const canned = buyerMessages[buyerTurnIndex] || buyerMessages[buyerMessages.length - 1];
    return NegotiationMessageSchema.parse({
      from: 'buyer',
      action: canned.action,
      source: 'scripted',
      unitPrice: canned.unitPrice,
      quantity: canned.quantity,
      text: canned.text,
    });
  }

  // Live LLM turn - strictly sanitize item so merchant floorPrice is never exposed
  const buyerItem = {
    id: item.id,
    name: item.name,
    category: item.category,
    listPrice: item.listPrice,
  };
  const system = buildBuyerPrompt({ goal, mandate, item: buyerItem });
  const prompt = [
    `Conversation history so far:`,
    history.length === 0
      ? '(No prior messages; this is your opening offer)'
      : history.map((m) => `${m.from.toUpperCase()}: [${m.action} $${m.unitPrice} x${m.quantity}] "${m.text}"`).join('\n'),
    `\nRespond with your next negotiation turn.`,
  ].join('\n');

  let raw;
  if (typeof llm.generateObject === 'function') {
    const res = await llm.generateObject({
      schema: BuyerTurnSchema,
      system,
      prompt,
      schemaName: 'BuyerTurn',
      maxOutputTokens: 250,
      providerOptions: {
        google: {
          thinkingConfig: { thinkingBudget: 0 },
        },
      },
    });
    raw = res.object ?? res;
  } else {
    const res = await aiGenerateObject({
      model: llm,
      schema: BuyerTurnSchema,
      system,
      prompt,
      schemaName: 'BuyerTurn',
      maxOutputTokens: 250,
      providerOptions: {
        google: {
          thinkingConfig: { thinkingBudget: 0 },
        },
      },
    });
    raw = res.object;
  }

  return NegotiationMessageSchema.parse({
    from: 'buyer',
    action: raw.action,
    source: 'live',
    unitPrice: raw.unitPrice,
    quantity: raw.quantity,
    text: raw.text,
  });
}

// Export read-only searchCatalog so the buyer agent has tool access without payments
export { searchCatalog };

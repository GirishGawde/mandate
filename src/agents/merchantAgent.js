import { z } from 'zod';
import { generateObject as aiGenerateObject } from 'ai';
import { NegotiationActionSchema, NegotiationMessageSchema } from './messageSchema.js';
import { buildMerchantPrompt } from './prompts/merchant.js';
import { createLlm } from './llm.js';
import { normalDealTranscript } from './scripted/normalDeal.js';
import { attackDealTranscript } from './scripted/attackDeal.js';

const MerchantTurnSchema = z
  .object({
    action: NegotiationActionSchema,
    unitPrice: z.number().finite().positive().max(1_000_000),
    quantity: z.number().int().min(1).max(10_000),
    text: z.string().trim().max(280),
  })
  .strict();

/**
 * Generates the merchant agent's turn in a negotiation.
 *
 * @param {object} params
 * @param {object} params.item - Catalog item being negotiated
 * @param {Array<object>} [params.history] - Prior messages
 * @param {'honest'|'shady'} [params.persona]
 * @param {boolean} [params.attack]
 * @param {object} [params.llm]
 * @param {Array<object>} [params.scriptedMessages]
 * @returns {Promise<import('zod').infer<typeof NegotiationMessageSchema>>}
 */
export async function generateMerchantTurn({
  item,
  history = [],
  persona = 'honest',
  attack = false,
  llm = createLlm(),
  scriptedMessages,
}) {
  if (llm.mode === 'scripted' || scriptedMessages) {
    const isShady = persona === 'shady' || attack;
    const transcript = scriptedMessages || (isShady ? attackDealTranscript : normalDealTranscript);
    const merchantMessages = transcript.filter((m) => m.from === 'merchant');
    const merchantTurnIndex = history.filter((m) => m.from === 'merchant').length;
    const canned = merchantMessages[merchantTurnIndex] || merchantMessages[merchantMessages.length - 1];
    return NegotiationMessageSchema.parse({
      from: 'merchant',
      action: canned.action,
      source: 'scripted',
      unitPrice: canned.unitPrice,
      quantity: canned.quantity,
      text: canned.text,
    });
  }

  const system = buildMerchantPrompt({ item, persona, attack });
  const prompt = [
    `Conversation history so far:`,
    history.map((m) => `${m.from.toUpperCase()}: [${m.action} $${m.unitPrice} x${m.quantity}] "${m.text}"`).join('\n'),
    `\nRespond with your next negotiation turn.`,
  ].join('\n');

  let raw;
  if (typeof llm.generateObject === 'function') {
    const res = await llm.generateObject({
      schema: MerchantTurnSchema,
      system,
      prompt,
      schemaName: 'MerchantTurn',
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
      schema: MerchantTurnSchema,
      system,
      prompt,
      schemaName: 'MerchantTurn',
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
    from: 'merchant',
    action: raw.action,
    source: 'live',
    unitPrice: raw.unitPrice,
    quantity: raw.quantity,
    text: raw.text,
  });
}

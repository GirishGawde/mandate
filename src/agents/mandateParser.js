import { z } from 'zod';
import { generateObject as aiGenerateObject } from 'ai';
import { MandateSchema, summarizeIssues } from '../schemas.js';
import { createLlm } from './llm.js';
import { MANDATE_PARSER_SYSTEM_PROMPT, buildRetryPrompt } from './prompts/mandateParser.js';

const money = z.number().finite().positive().max(1_000_000);
const slug = z.string().trim().toLowerCase().min(1);
const currency = z.string().length(3).transform((s) => s.toUpperCase());

/**
 * Draft mandate schema:
 * Matches MandateSchema fields, but caps are optional during extraction
 * so missing caps are not forcibly invented.
 */
export const DraftMandateSchema = z
  .object({
    version: z.literal(1).default(1),
    currency: currency.default('USD'),
    monthlyCap: money.optional(),
    perPurchaseCap: money.optional(),
    approvalThreshold: money.optional(),
    allowedCategories: z.array(slug).default([]),
    blockedCategories: z.array(slug).default([]),
    allowedMerchants: z.array(slug).default([]),
    blockedMerchants: z.array(slug).default([]),
    allowSubscriptions: z.boolean().default(false),
    blockedKeywords: z.array(slug).default([]),
    expiresAt: z
      .string()
      .refine((s) => !Number.isNaN(Date.parse(s)), 'must be an ISO date string')
      .optional(),
  })
  .strict();

export const ParsedMandateResultSchema = z
  .object({
    mandate: DraftMandateSchema,
    assumptions: z.array(z.string()).default([]),
    unclear: z.array(z.string()).default([]),
  })
  .strict();

/**
 * Validates a parsed mandate object against both structure and domain invariants.
 * @param {unknown} raw
 * @returns {{ success: true, data: { mandate: object, assumptions: string[], unclear: string[] } } | { success: false, error: string }}
 */
export function validateParsedMandate(raw) {
  const result = ParsedMandateResultSchema.safeParse(raw);
  if (!result.success) {
    return { success: false, error: summarizeIssues(result.error) };
  }

  const { mandate, assumptions, unclear } = result.data;
  const issues = [];
  const updatedUnclear = [...unclear];

  // 1. Missing caps must be placed in unclear (never invented)
  const requiredCaps = ['monthlyCap', 'perPurchaseCap', 'approvalThreshold'];
  for (const cap of requiredCaps) {
    if (mandate[cap] === undefined || mandate[cap] === null) {
      const alreadyNoted = updatedUnclear.some((u) => u.toLowerCase().includes(cap.toLowerCase()));
      if (!alreadyNoted) {
        updatedUnclear.push(`${cap} not specified; ask user`);
      }
    }
  }

  // 2. Relative constraints when caps are present
  if (mandate.monthlyCap !== undefined && mandate.perPurchaseCap !== undefined) {
    if (mandate.perPurchaseCap > mandate.monthlyCap) {
      issues.push(`perPurchaseCap (${mandate.perPurchaseCap}) cannot exceed monthlyCap (${mandate.monthlyCap})`);
    }
  }

  if (mandate.perPurchaseCap !== undefined && mandate.approvalThreshold !== undefined) {
    if (mandate.approvalThreshold > mandate.perPurchaseCap) {
      issues.push(`approvalThreshold (${mandate.approvalThreshold}) cannot exceed perPurchaseCap (${mandate.perPurchaseCap})`);
    }
  }

  // 3. When all 3 caps are present, validate full MandateSchema
  if (
    mandate.monthlyCap !== undefined &&
    mandate.perPurchaseCap !== undefined &&
    mandate.approvalThreshold !== undefined
  ) {
    const fullCheck = MandateSchema.safeParse(mandate);
    if (!fullCheck.success) {
      issues.push(summarizeIssues(fullCheck.error));
    }
  }

  if (issues.length > 0) {
    return { success: false, error: issues.join('; ') };
  }

  return {
    success: true,
    data: {
      mandate,
      assumptions,
      unclear: updatedUnclear,
    },
  };
}

/**
 * Deterministic scripted parser for NEGOTIATION_MODE=scripted (makes NO API calls).
 * @param {string} text
 */
export function parseMandateScripted(text) {
  const t = String(text).toLowerCase();

  // Extract monthlyCap
  let monthlyCap;
  const mMatch = t.match(/\$?(\d+(?:\.\d+)?)\s*(?:\/|per)\s*month|\bmonthly\s*(?:cap|budget)?\s*(?:of\s*)?\$?(\d+(?:\.\d+)?)/i);
  if (mMatch) {
    const val = parseFloat(mMatch[1] ?? mMatch[2]);
    if (!Number.isNaN(val) && val > 0) monthlyCap = val;
  }

  // Extract perPurchaseCap
  let perPurchaseCap;
  const pMatch = t.match(/\$?(\d+(?:\.\d+)?)\s*(?:per purchase|per item|single purchase)|\bmax\s*\$?(\d+(?:\.\d+)?)\s*(?:per purchase|each)/i);
  if (pMatch) {
    const val = parseFloat(pMatch[1] ?? pMatch[2]);
    if (!Number.isNaN(val) && val > 0) perPurchaseCap = val;
  }

  // Extract approvalThreshold
  let approvalThreshold;
  const aMatch = t.match(/(?:ask me above|approval above|ask above|above)\s*\$?(\d+(?:\.\d+)?)/i);
  if (aMatch) {
    const val = parseFloat(aMatch[1]);
    if (!Number.isNaN(val) && val > 0) approvalThreshold = val;
  }

  // Categories
  const allowedCategories = [];
  if (t.includes('travel')) allowedCategories.push('travel');
  if (t.includes('electronics')) allowedCategories.push('electronics');

  // Subscriptions
  const noSubs = t.includes('no subscription') || t.includes('never subscription') || t.includes('block subscription');
  const allowSubscriptions = !noSubs;
  const blockedKeywords = noSubs ? ['subscription', 'free trial', 'recurring'] : [];

  const raw = {
    mandate: {
      version: 1,
      currency: 'USD',
      ...(monthlyCap !== undefined ? { monthlyCap } : {}),
      ...(perPurchaseCap !== undefined ? { perPurchaseCap } : {}),
      ...(approvalThreshold !== undefined ? { approvalThreshold } : {}),
      allowedCategories,
      blockedCategories: [],
      allowedMerchants: [],
      blockedMerchants: [],
      allowSubscriptions,
      blockedKeywords,
    },
    assumptions: ['Default currency set to USD', 'Scripted deterministic extraction'],
    unclear: [],
  };

  const validated = validateParsedMandate(raw);
  if (!validated.success) {
    throw new Error(`Scripted parse validation failed: ${validated.error}`);
  }

  return validated.data;
}

/**
 * Parses natural language text into a structured mandate draft.
 * Rules:
 *  - Extract only what the user said (never invent numbers).
 *  - Missing caps go to `unclear`.
 *  - Retries once on invalid output, then errors.
 *  - Scripted mode makes zero external API calls.
 *
 * @param {string|{text: string, llm?: object, maxRetries?: number}} input
 * @param {object} [options]
 * @param {object} [options.llm]
 * @param {number} [options.maxRetries]
 * @returns {Promise<{ mandate: object, assumptions: string[], unclear: string[] }>}
 */
export async function parseMandate(input, options = {}) {
  const text = typeof input === 'string' ? input : input?.text;
  if (!text || typeof text !== 'string' || text.trim() === '') {
    throw new Error('Mandate parser requires non-empty text input.');
  }

  const opts = typeof input === 'object' && input !== null && input.text ? input : options;
  const llm = opts.llm ?? createLlm();
  const maxRetries = opts.maxRetries ?? 1;

  if (llm.mode === 'scripted') {
    return parseMandateScripted(text);
  }

  let attempt = 0;
  let lastError = null;
  let previousOutput = null;

  while (attempt <= maxRetries) {
    attempt++;
    try {
      let rawResult;
      const prompt =
        attempt === 1
          ? text
          : buildRetryPrompt({ originalText: text, previousOutput, errorDetails: lastError });

      if (typeof llm.generateObject === 'function') {
        const res = await llm.generateObject({
          schema: ParsedMandateResultSchema,
          system: MANDATE_PARSER_SYSTEM_PROMPT,
          prompt,
          schemaName: 'ParsedMandateResult',
        });
        rawResult = res.object ?? res;
      } else {
        const res = await aiGenerateObject({
          model: llm,
          schema: ParsedMandateResultSchema,
          system: MANDATE_PARSER_SYSTEM_PROMPT,
          prompt,
          schemaName: 'ParsedMandateResult',
        });
        rawResult = res.object;
      }

      previousOutput = rawResult;
      const validation = validateParsedMandate(rawResult);

      if (validation.success) {
        return validation.data;
      }

      lastError = validation.error;
    } catch (err) {
      lastError = err.message;
    }
  }

  throw new Error(`Failed to parse mandate after retry: ${lastError}`);
}


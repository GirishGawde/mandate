import { z } from 'zod';

const money = z.number().finite().positive().max(1_000_000);
const slug = z.string().trim().toLowerCase().min(1);
const currency = z.string().length(3).transform((s) => s.toUpperCase());

/**
 * A mandate is the set of rules a human gives their agent.
 * Strict: unknown fields are rejected, so typos can never silently weaken a rule.
 */
export const MandateSchema = z
  .object({
    version: z.literal(1).default(1),
    currency: currency.default('USD'),
    monthlyCap: money,
    perPurchaseCap: money,
    approvalThreshold: money, // purchases above this need a human tap
    allowedCategories: z.array(slug).default([]), // empty = any category
    blockedCategories: z.array(slug).default([]),
    allowedMerchants: z.array(slug).default([]), // empty = any merchant
    blockedMerchants: z.array(slug).default([]),
    allowSubscriptions: z.boolean().default(false),
    blockedKeywords: z.array(slug).default([]),
    expiresAt: z
      .string()
      .refine((s) => !Number.isNaN(Date.parse(s)), 'must be an ISO date string')
      .optional(),
  })
  .strict()
  .superRefine((m, ctx) => {
    if (m.perPurchaseCap > m.monthlyCap) {
      ctx.addIssue({ code: 'custom', path: ['perPurchaseCap'], message: 'cannot exceed monthlyCap' });
    }
    if (m.approvalThreshold > m.perPurchaseCap) {
      ctx.addIssue({ code: 'custom', path: ['approvalThreshold'], message: 'cannot exceed perPurchaseCap' });
    }
  });

/** What an agent proposes to buy. Everything an agent says goes through this schema first. */
export const PurchaseSchema = z
  .object({
    merchantId: slug,
    merchantName: z.string().trim().max(200).default(''),
    category: slug,
    amount: money,
    currency: currency.default('USD'),
    description: z.string().max(500).default(''),
    isSubscription: z.boolean().default(false),
  })
  .strict();

export const summarizeIssues = (error) =>
  error.issues.map((i) => `${i.path.join('.') || 'value'}: ${i.message}`).join('; ');

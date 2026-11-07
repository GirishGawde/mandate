import { z } from 'zod';

export const NegotiationActionSchema = z.enum(['offer', 'counter', 'accept', 'reject', 'notice']);

export const NegotiationFromSchema = z.enum(['buyer', 'merchant', 'system']);

export const NegotiationSourceSchema = z.enum(['live', 'scripted']);

/**
 * NegotiationMessage schema per docs/04-AGENTS_SPEC.md.
 * Supports agent offers/counters/accepts/rejects as well as system notices.
 *
 * Requirements:
 * - Every message has source: "live" | "scripted" (default "live").
 * - For buyer and merchant turns: unitPrice (>0) and quantity (>=1) are required.
 * - For system notice messages: text is required, and unitPrice/quantity MUST NOT be present.
 */
export const NegotiationMessageSchema = z
  .object({
    from: NegotiationFromSchema,
    action: NegotiationActionSchema,
    source: NegotiationSourceSchema.default('live'),
    unitPrice: z.number().finite().max(1_000_000).optional(),
    quantity: z.number().int().max(10_000).optional(),
    text: z.string().trim().max(280),
  })
  .strict()
  .superRefine((data, ctx) => {
    // Notice messages MUST NOT contain price or quantity
    if (data.from === 'system' || data.action === 'notice') {
      if (data.unitPrice !== undefined) {
        ctx.addIssue({
          code: 'custom',
          path: ['unitPrice'],
          message: 'Notice message must have no price or quantity fields',
        });
      }
      if (data.quantity !== undefined) {
        ctx.addIssue({
          code: 'custom',
          path: ['quantity'],
          message: 'Notice message must have no price or quantity fields',
        });
      }
    } else {
      // Normal agent negotiation turns must have positive unitPrice and quantity >= 1
      if (typeof data.unitPrice !== 'number' || data.unitPrice <= 0) {
        ctx.addIssue({
          code: 'custom',
          path: ['unitPrice'],
          message: 'unitPrice must be a positive number for agent messages',
        });
      }
      if (typeof data.quantity !== 'number' || data.quantity < 1) {
        ctx.addIssue({
          code: 'custom',
          path: ['quantity'],
          message: 'quantity must be an integer >= 1 for agent messages',
        });
      }
    }
  });

/**
 * Validates a negotiation message against the strict schema.
 * @param {unknown} data
 * @returns {{ success: true, data: import('zod').infer<typeof NegotiationMessageSchema> } | { success: false, error: string }}
 */
export function validateNegotiationMessage(data) {
  const result = NegotiationMessageSchema.safeParse(data);
  if (!result.success) {
    const errorMsg = result.error.issues.map((i) => `${i.path.join('.') || 'root'}: ${i.message}`).join('; ');
    return { success: false, error: errorMsg };
  }
  return { success: true, data: result.data };
}

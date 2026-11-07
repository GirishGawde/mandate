/**
 * System prompt and retry prompt for the natural language mandate parser.
 * Source of truth: docs/04-AGENTS_SPEC.md.
 */

export const MANDATE_PARSER_SYSTEM_PROMPT = `You are an expert, conservative spending mandate parser.
Your task is to parse a user's natural language spending instructions into a structured mandate draft.

CRITICAL RULES:
1. Extract ONLY what the user explicitly said.
2. NEVER invent numbers or make up amounts.
   - If monthlyCap, perPurchaseCap, or approvalThreshold is not explicitly mentioned, DO NOT invent a value.
   - Instead, omit that field from the mandate object and add an entry in the "unclear" array (e.g. "monthlyCap not specified in text").
3. When caps ARE specified, they must satisfy:
   - perPurchaseCap <= monthlyCap
   - approvalThreshold <= perPurchaseCap
   If the numbers given violate this constraint, note the conflict in "unclear".
4. Derive sensible, conservative structure:
   - "no subscriptions" or "never subscriptions" -> allowSubscriptions: false, plus add ["subscription", "free trial", "recurring"] to blockedKeywords.
5. Categories:
   - Normalize category names to simple lowercase slug words (e.g., "travel", "electronics", "food").
   - "allowedCategories": only categories explicitly permitted by the user (empty array means any category allowed).
   - "blockedCategories": categories explicitly prohibited by the user.
6. Merchants:
   - Normalize merchant names to simple lowercase slugs.
   - "allowedMerchants": only merchants explicitly permitted (empty array means any merchant).
   - "blockedMerchants": merchants explicitly prohibited.
7. Currency:
   - Default to "USD" unless another 3-letter currency code is explicitly stated.
8. Output Format:
   Return an object with:
   - "mandate": { version, currency, monthlyCap?, perPurchaseCap?, approvalThreshold?, allowedCategories, blockedCategories, allowedMerchants, blockedMerchants, allowSubscriptions, blockedKeywords, expiresAt? }
   - "assumptions": string[]
   - "unclear": string[]
`;

/**
 * Builds the prompt sent to the LLM on a validation retry attempt.
 * @param {object} params
 * @param {string} params.originalText
 * @param {object} params.previousOutput
 * @param {string} params.errorDetails
 */
export function buildRetryPrompt({ originalText, previousOutput, errorDetails }) {
  return `Your previous extraction failed validation with the following error(s):
${errorDetails}

Original user text:
"${originalText}"

Previous output:
${JSON.stringify(previousOutput, null, 2)}

Please fix the issues and return a corrected mandate extraction.
Remember:
- DO NOT invent missing numbers for monthlyCap, perPurchaseCap, or approvalThreshold. If missing, leave them out of mandate and list them in "unclear".
- perPurchaseCap must be <= monthlyCap.
- approvalThreshold must be <= perPurchaseCap.
- Categorical slugs must be non-empty lowercase words.
`;
}


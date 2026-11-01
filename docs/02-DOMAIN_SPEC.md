# 02 — Domain Spec (source of truth: `src/schemas.js`, `src/policy/engine.js`)

If this doc and the code disagree, the code + tests win; then fix this doc.

## Mandate (user's rules) — `MandateSchema` (strict: unknown keys rejected)
| Field | Type | Default | Meaning |
|---|---|---|---|
| `version` | `1` | 1 | Schema version |
| `currency` | 3-letter code | `USD` | Single currency per mandate |
| `monthlyCap` | number > 0 | required | Max total per calendar month (UTC) |
| `perPurchaseCap` | number > 0 | required | Max for one purchase. Must be ≤ `monthlyCap` |
| `approvalThreshold` | number > 0 | required | Above this → ask human. Must be ≤ `perPurchaseCap` |
| `allowedCategories` | string[] | `[]` | Empty = any category |
| `blockedCategories` | string[] | `[]` | Always denied |
| `allowedMerchants` | string[] | `[]` | Empty = any merchant |
| `blockedMerchants` | string[] | `[]` | Always denied |
| `allowSubscriptions` | boolean | `false` | Recurring charges |
| `blockedKeywords` | string[] | `[]` | Denied if found in description or merchant name |
| `expiresAt` | ISO date string | none | Mandate stops working after this |

Strings are trimmed and lower-cased. Amounts are decimals in major units (e.g. `49.99`), max 1,000,000.

Example:
```json
{
  "monthlyCap": 200, "perPurchaseCap": 100, "approvalThreshold": 50,
  "allowedCategories": ["travel", "electronics"],
  "blockedKeywords": ["subscription", "free trial", "recurring"],
  "allowSubscriptions": false
}
```

## Purchase proposal — `PurchaseSchema` (strict)
| Field | Type | Default |
|---|---|---|
| `merchantId` | string | required |
| `merchantName` | string ≤ 200 | `""` |
| `category` | string | required |
| `amount` | number > 0 | required |
| `currency` | 3-letter code | `USD` |
| `description` | string ≤ 500 | `""` |
| `isSubscription` | boolean | `false` |

Extra fields (e.g. `humanApproved`, `overrideLimits`) are **rejected** → `INVALID_PURCHASE`. This prevents smuggling permissions in.

## Policy engine — `evaluate(mandate, purchase, history, now)`
Returns `{ decision, reasons[{code,message}], purchase?, monthlyRemaining? }`.
`decision` ∈ `ALLOW` | `ASK_HUMAN` | `DENY`. **All** deny reasons are collected (not just the first).

Evaluation order / reason codes:
| Code | Result | Condition |
|---|---|---|
| `INVALID_MANDATE` | DENY | Mandate fails schema (incl. incoherent caps, unknown keys) |
| `INVALID_PURCHASE` | DENY | Purchase fails schema (negative, NaN, strings, extra keys) |
| `MANDATE_EXPIRED` | DENY | `now` > `expiresAt` |
| `CURRENCY_MISMATCH` | DENY | purchase currency ≠ mandate currency |
| `SUBSCRIPTION_BLOCKED` | DENY | `isSubscription` and not allowed |
| `KEYWORD_BLOCKED` | DENY | blocked keyword in description/merchant name |
| `MERCHANT_BLOCKED` / `MERCHANT_NOT_ALLOWED` | DENY | on blocklist / not on non-empty allowlist |
| `CATEGORY_BLOCKED` / `CATEGORY_NOT_ALLOWED` | DENY | same for categories |
| `PER_PURCHASE_CAP` | DENY | amount > `perPurchaseCap` |
| `MONTHLY_CAP` | DENY | amount > remaining monthly budget |
| `APPROVAL_THRESHOLD` | ASK_HUMAN | amount > `approvalThreshold` (and no denials) |
| `WITHIN_MANDATE` | ALLOW | none of the above |

Budget accounting: sum of purchases in the **same UTC calendar month** and currency with status in
`{pending, authorized, captured}`. `voided` frees budget. Comparisons use integer cents. Boundaries are inclusive
(spending exactly the cap/threshold is allowed).

## Purchase lifecycle statuses (ledger)
`pending` → `authorized` → `captured`, or `pending|authorized` → `voided`.
Denied proposals are **not** stored as purchases; they appear only in the audit log (`policy_decision`).

## Audit log entry types
`policy_decision`, `approval_requested`, `order_created`, `funds_authorized`, `funds_captured`, `purchase_voided`.
Add more (e.g. `negotiation_message`, `mandate_confirmed`) as needed; keep entries append-only with `id`, `ts`, `type`.

## Invariants (tested; keep tested)
1. DENY is final: `humanApproved` never overrides it.
2. Free text never changes ALLOW↔DENY except to add `KEYWORD_BLOCKED`.
3. A denied purchase never causes a PayPal call.
4. Pending orders reserve budget; cancelling frees it.
5. Cannot capture before authorize; cannot authorize twice.
6. Floating point cannot cause off-by-a-cent decisions.

## Public API of the core (`src/`)
- `evaluate(mandate, purchase, history, now)` — `policy/engine.js`
- `proposePurchase({ mandate, purchase, ledger, paypal, now?, humanApproved? })` → `{status: 'denied'|'needs_approval'|'awaiting_buyer_approval', ...}`
- `authorizePurchase({ purchaseId, ledger, paypal })`, `confirmDelivery(...)`, `cancelPurchase(...)`
- `createLedger()` → `{ log, audit, addPurchase, getPurchase, updatePurchase, history }`
- `createPaypalClient(mode?)` → `{ createOrder, authorizeOrder, captureAuthorization, voidAuthorization }`

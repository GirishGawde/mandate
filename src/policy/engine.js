import { MandateSchema, PurchaseSchema, summarizeIssues } from '../schemas.js';
import { toCents, fmt } from '../money.js';

/** Purchases in these states count against the budget. 'pending' reserves budget so
 *  an agent cannot overspend by firing several orders before any of them settle. */
export const COUNTED_STATUSES = new Set(['pending', 'authorized', 'captured']);

const monthKey = (d) => `${d.getUTCFullYear()}-${d.getUTCMonth()}`;

export function spentThisMonthCents(history, currency, now) {
  const key = monthKey(now);
  return history
    .filter(
      (h) =>
        COUNTED_STATUSES.has(h.status) &&
        h.currency === currency &&
        monthKey(new Date(h.createdAt)) === key,
    )
    .reduce((sum, h) => sum + toCents(h.amount), 0);
}

const reason = (code, message) => ({ code, message });
const done = (decision, reasons, extra = {}) => ({ decision, reasons, ...extra });

/**
 * The policy engine. A pure, deterministic function: no LLM, no network, no randomness.
 * Free text (descriptions, merchant names) can only ever make a decision stricter,
 * never more permissive, so a manipulative merchant agent cannot talk its way past it.
 *
 * @returns {{decision: 'ALLOW'|'ASK_HUMAN'|'DENY', reasons: {code:string,message:string}[], purchase?: object, monthlyRemaining?: number}}
 */
export function evaluate(mandateInput, purchaseInput, history = [], now = new Date()) {
  const mp = MandateSchema.safeParse(mandateInput);
  if (!mp.success) {
    return done('DENY', [reason('INVALID_MANDATE', summarizeIssues(mp.error))]);
  }
  const pp = PurchaseSchema.safeParse(purchaseInput);
  if (!pp.success) {
    return done('DENY', [reason('INVALID_PURCHASE', summarizeIssues(pp.error))]);
  }
  const m = mp.data;
  const p = pp.data;
  const cur = m.currency;
  const amount = toCents(p.amount);
  const denials = [];

  if (m.expiresAt && now.getTime() > Date.parse(m.expiresAt)) {
    denials.push(reason('MANDATE_EXPIRED', `Mandate expired on ${m.expiresAt}.`));
  }
  if (p.currency !== cur) {
    denials.push(reason('CURRENCY_MISMATCH', `Mandate is in ${cur}, purchase is in ${p.currency}.`));
  }
  if (p.isSubscription && !m.allowSubscriptions) {
    denials.push(reason('SUBSCRIPTION_BLOCKED', 'Subscriptions and recurring charges are not allowed.'));
  }

  const haystack = `${p.description} ${p.merchantName}`.toLowerCase();
  const hit = m.blockedKeywords.find((k) => haystack.includes(k));
  if (hit) denials.push(reason('KEYWORD_BLOCKED', `Purchase text contains blocked term "${hit}".`));

  if (m.blockedMerchants.includes(p.merchantId)) {
    denials.push(reason('MERCHANT_BLOCKED', `Merchant "${p.merchantId}" is blocked.`));
  } else if (m.allowedMerchants.length && !m.allowedMerchants.includes(p.merchantId)) {
    denials.push(reason('MERCHANT_NOT_ALLOWED', `Merchant "${p.merchantId}" is not on the allowed list.`));
  }

  if (m.blockedCategories.includes(p.category)) {
    denials.push(reason('CATEGORY_BLOCKED', `Category "${p.category}" is blocked.`));
  } else if (m.allowedCategories.length && !m.allowedCategories.includes(p.category)) {
    denials.push(reason('CATEGORY_NOT_ALLOWED', `Category "${p.category}" is not on the allowed list.`));
  }

  const perCap = toCents(m.perPurchaseCap);
  if (amount > perCap) {
    denials.push(
      reason('PER_PURCHASE_CAP', `${fmt(amount, cur)} exceeds the per-purchase cap of ${fmt(perCap, cur)}.`),
    );
  }

  const monthlyCap = toCents(m.monthlyCap);
  const spent = spentThisMonthCents(history, cur, now);
  const remaining = monthlyCap - spent;
  if (amount > remaining) {
    denials.push(
      reason(
        'MONTHLY_CAP',
        `${fmt(amount, cur)} would exceed the monthly cap (${fmt(Math.max(remaining, 0), cur)} of ${fmt(monthlyCap, cur)} left).`,
      ),
    );
  }

  const extra = { purchase: p, monthlyRemaining: remaining / 100 };
  if (denials.length) return done('DENY', denials, extra);

  if (amount > toCents(m.approvalThreshold)) {
    return done(
      'ASK_HUMAN',
      [reason('APPROVAL_THRESHOLD', `${fmt(amount, cur)} is above the auto-approve limit of ${fmt(toCents(m.approvalThreshold), cur)}.`)],
      extra,
    );
  }

  return done('ALLOW', [reason('WITHIN_MANDATE', 'Purchase is within every rule of the mandate.')], extra);
}

import { randomUUID } from 'node:crypto';
import { evaluate } from './policy/engine.js';

/**
 * Step 1: an agent proposes a purchase. The policy engine decides BEFORE any PayPal call.
 * DENY can never be overridden. ASK_HUMAN proceeds only with humanApproved = true.
 */
export async function proposePurchase({ mandate, purchase, ledger, paypal, now = new Date(), humanApproved = false }) {
  const d = evaluate(mandate, purchase, ledger.history(), now);
  ledger.log('policy_decision', { decision: d.decision, reasons: d.reasons, purchase });

  if (d.decision === 'DENY') return { status: 'denied', reasons: d.reasons };

  if (d.decision === 'ASK_HUMAN' && !humanApproved) {
    ledger.log('approval_requested', { purchase: d.purchase, reasons: d.reasons });
    return { status: 'needs_approval', reasons: d.reasons, purchase: d.purchase };
  }

  const id = randomUUID();
  const p = d.purchase;
  const order = await paypal.createOrder({
    referenceId: id,
    amount: p.amount,
    currency: p.currency,
    description: p.description || `Purchase from ${p.merchantName || p.merchantId}`,
  });
  // Recorded as 'pending' immediately so the budget is reserved.
  ledger.addPurchase({
    id,
    orderId: order.id,
    amount: p.amount,
    currency: p.currency,
    merchantId: p.merchantId,
    category: p.category,
    status: 'pending',
    createdAt: now.toISOString(),
  });
  ledger.log('order_created', { purchaseId: id, orderId: order.id, humanApproved });
  return { status: 'awaiting_buyer_approval', purchaseId: id, orderId: order.id, approveUrl: order.approveUrl };
}

/** Step 2: the buyer approved in PayPal; place the hold on the funds. */
export async function authorizePurchase({ purchaseId, ledger, paypal }) {
  const p = ledger.getPurchase(purchaseId);
  if (!p) throw new Error(`Unknown purchase ${purchaseId}`);
  if (p.status !== 'pending') throw new Error(`Cannot authorize a purchase that is ${p.status}`);
  const auth = await paypal.authorizeOrder(p.orderId);
  ledger.updatePurchase(purchaseId, { status: 'authorized', authorizationId: auth.authorizationId });
  ledger.log('funds_authorized', { purchaseId, authorizationId: auth.authorizationId });
  return { status: 'authorized', authorizationId: auth.authorizationId };
}

/** Step 3: delivery confirmed; capture the funds. */
export async function confirmDelivery({ purchaseId, ledger, paypal }) {
  const p = ledger.getPurchase(purchaseId);
  if (!p) throw new Error(`Unknown purchase ${purchaseId}`);
  if (p.status !== 'authorized') throw new Error(`Cannot capture a purchase that is ${p.status}`);
  const cap = await paypal.captureAuthorization(p.authorizationId);
  ledger.updatePurchase(purchaseId, { status: 'captured', captureId: cap.captureId });
  ledger.log('funds_captured', { purchaseId, captureId: cap.captureId });
  return { status: 'captured', captureId: cap.captureId };
}

/** Delivery failed or the user cancelled: release the hold and free the budget. */
export async function cancelPurchase({ purchaseId, ledger, paypal }) {
  const p = ledger.getPurchase(purchaseId);
  if (!p) throw new Error(`Unknown purchase ${purchaseId}`);
  if (!['pending', 'authorized'].includes(p.status)) throw new Error(`Cannot cancel a purchase that is ${p.status}`);
  if (p.status === 'authorized') await paypal.voidAuthorization(p.authorizationId);
  ledger.updatePurchase(purchaseId, { status: 'voided' });
  ledger.log('purchase_voided', { purchaseId });
  return { status: 'voided' };
}

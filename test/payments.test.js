import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createLedger } from '../src/ledger.js';
import { createMockClient } from '../src/paypal/mock.js';
import { proposePurchase, authorizePurchase, confirmDelivery, cancelPurchase } from '../src/payments.js';

const now = new Date('2026-11-15T12:00:00Z');
const mandate = { monthlyCap: 200, perPurchaseCap: 100, approvalThreshold: 50, allowedCategories: ['travel'] };
const buy = (over = {}) => ({ merchantId: 'acme', category: 'travel', amount: 40, description: 'Train tickets', ...over });
const setup = () => ({ ledger: createLedger(), paypal: createMockClient() });

test('in-mandate purchase creates a PayPal order and reserves budget', async () => {
  const { ledger, paypal } = setup();
  const r = await proposePurchase({ mandate, purchase: buy(), ledger, paypal, now });
  assert.equal(r.status, 'awaiting_buyer_approval');
  assert.ok(r.approveUrl);
  assert.equal(ledger.getPurchase(r.purchaseId).status, 'pending');
  assert.equal(paypal.calls.filter((c) => c.name === 'createOrder').length, 1);
});

test('a denied purchase never touches PayPal', async () => {
  const { ledger, paypal } = setup();
  const r = await proposePurchase({ mandate, purchase: buy({ amount: 5000 }), ledger, paypal, now });
  assert.equal(r.status, 'denied');
  assert.equal(paypal.calls.length, 0);
  assert.ok(ledger.audit().some((e) => e.type === 'policy_decision' && e.decision === 'DENY'));
});

test('pending orders reserve budget so an agent cannot overspend by firing in parallel', async () => {
  const { ledger, paypal } = setup();
  for (let i = 0; i < 5; i++) {
    const r = await proposePurchase({ mandate, purchase: buy({ amount: 40 }), ledger, paypal, now });
    assert.equal(r.status, 'awaiting_buyer_approval'); // 5 x 40 = 200, exactly the cap
  }
  const sixth = await proposePurchase({ mandate, purchase: buy({ amount: 1 }), ledger, paypal, now });
  assert.equal(sixth.status, 'denied');
});

test('ASK_HUMAN waits, then proceeds only when the human approves', async () => {
  const { ledger, paypal } = setup();
  const big = buy({ amount: 80 });
  const first = await proposePurchase({ mandate, purchase: big, ledger, paypal, now });
  assert.equal(first.status, 'needs_approval');
  assert.equal(paypal.calls.length, 0);
  const second = await proposePurchase({ mandate, purchase: big, ledger, paypal, now, humanApproved: true });
  assert.equal(second.status, 'awaiting_buyer_approval');
});

test('human approval can never override a DENY', async () => {
  const { ledger, paypal } = setup();
  const r = await proposePurchase({ mandate, purchase: buy({ amount: 5000 }), ledger, paypal, now, humanApproved: true });
  assert.equal(r.status, 'denied');
  assert.equal(paypal.calls.length, 0);
});

test('full lifecycle: propose -> authorize -> deliver -> captured', async () => {
  const { ledger, paypal } = setup();
  const { purchaseId } = await proposePurchase({ mandate, purchase: buy(), ledger, paypal, now });
  await authorizePurchase({ purchaseId, ledger, paypal });
  assert.equal(ledger.getPurchase(purchaseId).status, 'authorized');
  const cap = await confirmDelivery({ purchaseId, ledger, paypal });
  assert.equal(cap.status, 'captured');
  assert.equal(ledger.getPurchase(purchaseId).status, 'captured');
});

test('cannot capture before authorizing, or authorize twice', async () => {
  const { ledger, paypal } = setup();
  const { purchaseId } = await proposePurchase({ mandate, purchase: buy(), ledger, paypal, now });
  await assert.rejects(confirmDelivery({ purchaseId, ledger, paypal }), /Cannot capture/);
  await authorizePurchase({ purchaseId, ledger, paypal });
  await assert.rejects(authorizePurchase({ purchaseId, ledger, paypal }), /Cannot authorize/);
});

test('cancelling voids the hold and frees the budget', async () => {
  const { ledger, paypal } = setup();
  const { purchaseId } = await proposePurchase({ mandate, purchase: buy({ amount: 50 }), ledger, paypal, now });
  await authorizePurchase({ purchaseId, ledger, paypal });
  await cancelPurchase({ purchaseId, ledger, paypal });
  assert.equal(ledger.getPurchase(purchaseId).status, 'voided');
  assert.ok(paypal.calls.some((c) => c.name === 'voidAuthorization'));
  const again = await proposePurchase({ mandate, purchase: buy({ amount: 50 }), ledger, paypal, now });
  assert.equal(again.status, 'awaiting_buyer_approval');
});

test('getOrder returns current order status', async () => {
  const { ledger, paypal } = setup();
  const { orderId } = await proposePurchase({ mandate, purchase: buy(), ledger, paypal, now });
  const o = await paypal.getOrder(orderId);
  assert.equal(o.id, orderId);
  assert.equal(o.status, 'CREATED');
});

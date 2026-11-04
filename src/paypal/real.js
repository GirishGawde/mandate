// Real PayPal sandbox client, same interface as mock.js.
// STATUS: written from PayPal's Orders v2 / Payments v2 docs, NOT YET TESTED against a live
// sandbox. Verify each call during the first sandbox run and fix any response-shape surprises.
import { randomUUID } from 'node:crypto';

const BASE = process.env.PAYPAL_BASE_URL ?? 'https://api-m.sandbox.paypal.com';

export function createRealClient({
  clientId = process.env.PAYPAL_CLIENT_ID,
  clientSecret = process.env.PAYPAL_CLIENT_SECRET,
  returnUrl = process.env.PAYPAL_RETURN_URL ?? 'http://localhost:3000/paypal/return',
  cancelUrl = process.env.PAYPAL_CANCEL_URL ?? 'http://localhost:3000/paypal/cancel',
} = {}) {
  if (!clientId || !clientSecret) {
    throw new Error('Set PAYPAL_CLIENT_ID and PAYPAL_CLIENT_SECRET (see .env.example).');
  }
  let token = null;
  let tokenExpiresAt = 0;

  async function accessToken() {
    if (token && Date.now() < tokenExpiresAt - 30_000) return token;
    const res = await fetch(`${BASE}/v1/oauth2/token`, {
      method: 'POST',
      headers: {
        Authorization: `Basic ${Buffer.from(`${clientId}:${clientSecret}`).toString('base64')}`,
        'Content-Type': 'application/x-www-form-urlencoded',
      },
      body: 'grant_type=client_credentials',
    });
    if (!res.ok) throw new Error(`PayPal auth failed: ${res.status} ${await res.text()}`);
    const data = await res.json();
    token = data.access_token;
    tokenExpiresAt = Date.now() + data.expires_in * 1000;
    return token;
  }

  async function api(path, { method = 'POST', body } = {}) {
    const res = await fetch(`${BASE}${path}`, {
      method,
      headers: {
        Authorization: `Bearer ${await accessToken()}`,
        'Content-Type': 'application/json',
        'PayPal-Request-Id': randomUUID(), // idempotency key
      },
      body: body ? JSON.stringify(body) : undefined,
    });
    const text = await res.text();
    const data = text ? JSON.parse(text) : {};
    if (!res.ok) throw new Error(`PayPal ${method} ${path} failed: ${res.status} ${text}`);
    return data;
  }

  return {
    mode: 'sandbox',
    async createOrder({ referenceId, amount, currency, description }) {
      const order = await api('/v2/checkout/orders', {
        body: {
          intent: 'AUTHORIZE',
          purchase_units: [
            {
              reference_id: referenceId,
              description: String(description).slice(0, 127),
              amount: { currency_code: currency, value: amount.toFixed(2) },
            },
          ],
          payment_source: {
            paypal: {
              experience_context: { return_url: returnUrl, cancel_url: cancelUrl, user_action: 'PAY_NOW' },
            },
          },
        },
      });
      const link = order.links?.find((l) => l.rel === 'payer-action' || l.rel === 'approve');
      return { id: order.id, status: order.status, approveUrl: link?.href };
    },
    async getOrder(orderId) {
      const order = await api(`/v2/checkout/orders/${orderId}`, { method: 'GET' });
      return { id: order.id, status: order.status };
    },
    async authorizeOrder(orderId) {
      const res = await api(`/v2/checkout/orders/${orderId}/authorize`, { body: {} });
      const auth = res.purchase_units?.[0]?.payments?.authorizations?.[0];
      if (!auth) throw new Error(`No authorization in response: ${JSON.stringify(res)}`);
      return { authorizationId: auth.id, status: auth.status };
    },
    async captureAuthorization(authorizationId) {
      const res = await api(`/v2/payments/authorizations/${authorizationId}/capture`, {
        body: { final_capture: true },
      });
      return { captureId: res.id, status: res.status };
    },
    async voidAuthorization(authorizationId) {
      await api(`/v2/payments/authorizations/${authorizationId}/void`, { body: undefined });
      return { status: 'VOIDED' };
    },
  };
}

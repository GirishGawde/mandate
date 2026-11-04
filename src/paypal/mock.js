// In-memory fake of the four PayPal calls Mandate needs. Same interface as real.js.
let counter = 1000;
const id = (prefix) => `${prefix}-${++counter}`;

export function createMockClient() {
  const orders = new Map();
  const auths = new Map();
  const calls = [];
  const rec = (name, args) => calls.push({ name, args });

  return {
    mode: 'mock',
    calls,
    async createOrder({ referenceId, amount, currency, description }) {
      rec('createOrder', { referenceId, amount, currency });
      const orderId = id('MOCK-ORDER');
      orders.set(orderId, { amount, currency, description, status: 'CREATED' });
      return { id: orderId, status: 'CREATED', approveUrl: `https://sandbox.paypal.example/approve/${orderId}` };
    },
    async getOrder(orderId) {
      rec('getOrder', { orderId });
      const o = orders.get(orderId);
      if (!o) throw new Error(`Mock PayPal: unknown order ${orderId}`);
      return { id: orderId, status: o.status };
    },
    async authorizeOrder(orderId) {
      rec('authorizeOrder', { orderId });
      const o = orders.get(orderId);
      if (!o) throw new Error(`Mock PayPal: unknown order ${orderId}`);
      const authorizationId = id('MOCK-AUTH');
      auths.set(authorizationId, { orderId, status: 'AUTHORIZED' });
      o.status = 'AUTHORIZED';
      return { authorizationId, status: 'AUTHORIZED' };
    },
    async captureAuthorization(authorizationId) {
      rec('captureAuthorization', { authorizationId });
      const a = auths.get(authorizationId);
      if (!a) throw new Error(`Mock PayPal: unknown authorization ${authorizationId}`);
      a.status = 'CAPTURED';
      return { captureId: id('MOCK-CAP'), status: 'COMPLETED' };
    },
    async voidAuthorization(authorizationId) {
      rec('voidAuthorization', { authorizationId });
      const a = auths.get(authorizationId);
      if (!a) throw new Error(`Mock PayPal: unknown authorization ${authorizationId}`);
      a.status = 'VOIDED';
      return { status: 'VOIDED' };
    },
  };
}

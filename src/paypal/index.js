// The ONLY place the app chooses between mock and real PayPal.
// PAYPAL_MODE=mock (default) | sandbox
export async function createPaypalClient(mode = process.env.PAYPAL_MODE ?? 'mock') {
  if (mode === 'sandbox') {
    const { createRealClient } = await import('./real.js');
    return createRealClient();
  }
  const { createMockClient } = await import('./mock.js');
  return createMockClient();
}

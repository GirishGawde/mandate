// All money math is done in integer cents to avoid floating point surprises.
export const toCents = (n) => Math.round(n * 100);
export const fromCents = (c) => c / 100;
export const fmt = (cents, currency = 'USD') => `${currency} ${(cents / 100).toFixed(2)}`;

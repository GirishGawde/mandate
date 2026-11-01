import { randomUUID } from 'node:crypto';

/** In-memory ledger: an append-only audit log plus purchase records.
 *  Swap for SQLite/Postgres later; the interface stays the same. */
export function createLedger() {
  const auditLog = [];
  const purchases = new Map();
  return {
    log(type, data = {}) {
      const entry = { id: randomUUID(), ts: new Date().toISOString(), type, ...data };
      auditLog.push(entry);
      return entry;
    },
    audit: () => auditLog.map((e) => ({ ...e })),
    addPurchase(p) {
      purchases.set(p.id, { ...p });
    },
    getPurchase(id) {
      const p = purchases.get(id);
      return p ? { ...p } : undefined;
    },
    updatePurchase(id, patch) {
      const p = purchases.get(id);
      if (!p) throw new Error(`Unknown purchase ${id}`);
      Object.assign(p, patch);
      return { ...p };
    },
    history: () => [...purchases.values()].map((p) => ({ ...p })),
  };
}

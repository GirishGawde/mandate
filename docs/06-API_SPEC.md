# 06 — API Spec (Next.js route handlers in `app/api/`)

All handlers are thin: validate input with Zod → call core (`src/`) → emit events → return JSON.
State lives in `src/server/state.js` (single in-memory singleton: mandate, ledger, paypal client, sessions).
Single demo user; no auth. Errors: `{ "error": "message" }` with proper status codes.
Route handlers must run on the Node runtime (not Edge), because they use `node:crypto` and in-memory state.

| Method & path | Body → Response | Notes |
|---|---|---|
| `POST /api/mandate/parse` | `{text}` → `{mandate, assumptions[], unclear[]}` | LLM parser; not applied yet |
| `POST /api/mandate` | `{mandate}` → `{mandate}` | Validates with `MandateSchema`; becomes the active mandate |
| `GET /api/mandate` | → `{mandate\|null, budget}` | |
| `POST /api/shop/start` | `{goal, attack?: boolean}` → `{sessionId}` | Starts negotiation; requires confirmed mandate |
| `GET /api/shop/:id/events` | → SSE stream | See events below; send keep-alive comments every ~15s |
| `POST /api/purchases/:id/approve` | → status | Human approves an `ASK_HUMAN` proposal (re-evaluated; DENY still wins). Use the session/proposal id returned in `approval_required` |
| `POST /api/purchases/:id/decline` | → status | Human declines |
| `GET /api/paypal/return` | query `token` (+ `PayerID`) | Finds purchase by orderId → `authorizePurchase` → redirect to `/` |
| `GET /api/paypal/cancel` | query `token` | `cancelPurchase` → redirect `/` |
| `POST /api/paypal/webhook` | PayPal event | Verify signature; idempotent; emit event |
| `POST /api/purchases/:id/deliver` | → status | Simulated delivery confirmation → `confirmDelivery` (capture) |
| `POST /api/purchases/:id/cancel` | → status | `cancelPurchase` |
| `GET /api/ledger` | → `{audit[], purchases[], budget}` | For AG Grid and reload |
| `POST /api/demo/attack` | → events | "Simulated compromised agent" — submits a manipulated proposal straight to `proposePurchase` |
| `POST /api/demo/reset` | → `{ok:true}` | Clears mandate, ledger, sessions |

## SSE event envelope
```json
{ "type": "negotiation_message", "ts": "ISO", "sessionId": "…", "data": { } }
```
| `type` | `data` |
|---|---|
| `negotiation_message` | `{from, action, unitPrice, quantity, text, round}` |
| `negotiation_ended` | `{status: 'deal'\|'no_deal', deal?}` |
| `policy_decision` | `{decision, reasons[], purchase}` |
| `approval_required` | `{proposalId, purchase, reasons[]}` |
| `order_created` | `{purchaseId, orderId, approveUrl}` |
| `funds_authorized` | `{purchaseId, authorizationId}` |
| `funds_captured` | `{purchaseId, captureId}` |
| `purchase_voided` | `{purchaseId}` |
| `budget_update` | `{monthlyCap, captured, reserved, remaining}` |
| `error` | `{message}` |

Client: `EventSource`; on disconnect, reconnect and refetch `GET /api/ledger` to resync (events are a convenience, ledger is the truth).

## Security basics (even for a demo)
- Secrets only in env; never returned to the client; never logged.
- Validate every request body with Zod; cap body size; ignore unknown keys.
- Rate-limit LLM-backed routes simply (e.g. 1 active session at a time) to protect API credits on the public demo.
- Webhook: verify signature; reject unsigned.
- The public demo uses sandbox credentials only.

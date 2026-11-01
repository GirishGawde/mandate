# 03 — PayPal Integration

Sandbox only. Docs: https://developer.paypal.com (Orders v2, Payments v2, Webhooks).
Hackathon note: PayPal must be central; the whole money lifecycle runs through PayPal.

## Status
- `src/paypal/mock.js` — complete, used by tests/demo.
- `src/paypal/real.js` — **written from docs, UNTESTED**. First sandbox run will likely need small fixes.
- Interface (identical for both):
  - `createOrder({referenceId, amount, currency, description}) → {id, status, approveUrl}`
  - `authorizeOrder(orderId) → {authorizationId, status}`
  - `captureAuthorization(authorizationId) → {captureId, status}`
  - `voidAuthorization(authorizationId) → {status}`

## Sandbox setup (one-time)
1. Sign in at developer.paypal.com → Dashboard → **Apps & Credentials** → Sandbox.
2. Create a REST app → copy **Client ID** and **Secret** into `.env` (`PAYPAL_CLIENT_ID`, `PAYPAL_CLIENT_SECRET`). Never commit.
3. Sandbox accounts: use/create one **Business** (merchant) and one **Personal** (buyer). Note their sandbox emails/passwords privately.
4. Set `PAYPAL_MODE=sandbox`.
5. (If sign-up blocks on phone verification, work in `PAYPAL_MODE=mock` and retry later; ask hackathon organizers.)

## Payment lifecycle (intent AUTHORIZE)
1. `POST /v2/checkout/orders` with `intent: "AUTHORIZE"` → returns order id + approval link (`approve` or `payer-action`).
2. Buyer opens approval link (sandbox buyer account) and approves; PayPal redirects to `return_url`.
3. `POST /v2/checkout/orders/{id}/authorize` → authorization id. Funds are **held**.
4. On delivery: `POST /v2/payments/authorizations/{id}/capture` → capture id.
5. If delivery fails/cancel: `POST /v2/payments/authorizations/{id}/void`.

Facts (from PayPal docs, verify if behavior differs): an authorization is valid for 29 days; capture is recommended within the 3-day honor period; re-authorization is possible. For the demo we capture right after the simulated delivery.

Send a unique `PayPal-Request-Id` header on POSTs (idempotency) — `real.js` does this.

## Open spike: Path A vs Path B  (resolve first, record result here)
Question: can the backend complete payment for an in-mandate purchase **without** the buyer clicking through PayPal each time (e.g. vaulted/saved sandbox payment method)?
- **Path A (autonomous):** in-mandate purchases pay with no human step. Strongest story.
- **Path B (one-tap):** every purchase needs the PayPal approval click. The guardrail still blocks bad purchases *before any order is created*; demo shows a one-tap approval. Fully acceptable.
Result: _TBD — fill in after testing_. Do not build Path A-only features until confirmed.

## Return/cancel handling (Path B)
- `PAYPAL_RETURN_URL` → `app/api/paypal/return` handler: read the order `token`, find purchase by `orderId`, call `authorizePurchase`, redirect to the dashboard.
- `PAYPAL_CANCEL_URL` → `cancelPurchase` and redirect.
- Locally use `http://localhost:3000/...`; on Render use the public URL (set via env).

## Webhooks (live status + credibility)
- Register a webhook in the sandbox app pointing to `https://<render-url>/api/paypal/webhook` (use a tunnel such as ngrok/cloudflared for local dev).
- Likely events (verify exact names in PayPal docs before relying on them): `CHECKOUT.ORDER.APPROVED`, `PAYMENT.AUTHORIZATION.CREATED`, `PAYMENT.CAPTURE.COMPLETED`, `PAYMENT.AUTHORIZATION.VOIDED`.
- **Verify the signature** using PayPal's verify-webhook-signature API before trusting an event. Store `PAYPAL_WEBHOOK_ID` in env.
- Webhooks must be idempotent (events can repeat); map by `orderId`/`authorizationId`.
- The app must still work if webhooks fail (the return-URL path drives state); webhooks enrich the live feed.

## PayPal Agent Toolkit / MCP (optional, merchant side only)
PayPal publishes an Agent Toolkit (`@paypal/agent-toolkit`) and a hosted MCP server.
- **Never** expose buyer-side payment tools to the buyer agent (invariant 2 in `AGENTS.md`).
- Reasonable use: the **merchant agent** can use toolkit tools to create an invoice/order for the agreed deal, strengthening the "PayPal + AI" story. Only add this after the core flow works, and verify the toolkit's current API in its README.

## Testing checklist for first sandbox run
- [ ] Token request succeeds
- [ ] `createOrder` returns an approval link; opening it with the buyer sandbox account works
- [ ] `authorizeOrder` returns an authorization id
- [ ] `captureAuthorization` succeeds; transaction visible in the sandbox business account dashboard
- [ ] `voidAuthorization` works on a fresh authorization
- [ ] Error responses surface readable messages in the UI
- [ ] Record Path A/B result above
- [ ] Webhook received and signature verified

## Risks
| Risk | Mitigation |
|---|---|
| Sandbox sign-up/verification trouble | Build on mock; ask organizers; retry |
| Response shapes differ from `real.js` | Fix on first run; keep mock identical |
| Webhook delivery to localhost | Tunnel in dev; Render in prod |
| Authorization honor period/expiry | Demo captures immediately; document the 3/29-day rules |

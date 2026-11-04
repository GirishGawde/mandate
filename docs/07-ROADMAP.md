# 07 — Roadmap & Status

Deadline: **Nov 12, 2026 12:00pm PST** (= Nov 13 ~01:30 IST). Real target: **submit by the evening of Nov 11 IST.**
Rule: when you finish a task, tick it here. Keep "Open questions" current.

## Day 1 — Sun Nov 1: foundation
- [x] Repo scaffold, MIT license, `.gitignore`, `.env.example`
- [x] Zod schemas (mandate, purchase)
- [x] Policy engine (pure) + tests
- [x] Ledger, payment lifecycle (propose/authorize/capture/void), budget reservation
- [x] Mock PayPal client + real sandbox client (**real untested**)
- [x] Terminal demo `npm run demo:core`; 27 tests passing
- [x] Project docs + `AGENTS.md`
- [x] PayPal developer sign-up
- [ ] Create GitHub public repo, first commit (keep honest history)

## Day 2 — Mon Nov 2: PayPal sandbox + LLM plumbing
- [x] Sandbox REST app + business & personal sandbox accounts; keys in `.env`
- [ ] `PAYPAL_MODE=sandbox npm run demo:core` → fix `real.js`; confirm authorize→capture visible in sandbox dashboard
- [x] Path A/B spike; record result in `docs/03`
- [ ] `src/agents/llm.js` (provider switch, injected `llm`) + scripted mode skeleton
- [ ] `mandateParser.js` + tests (fake llm)

## Day 3 — Tue Nov 3: agents
- [ ] `data/merchants.js` (catalog + floor prices + shady merchant)
- [ ] `buyerAgent.js`, `merchantAgent.js`, `negotiation.js` with code-enforced rules + tests
- [ ] Deal → proposal builder (code) → `proposePurchase`
- [ ] Scripted-mode transcripts (normal deal + attack)

## Day 4 — Wed Nov 4: server
- [ ] Install Next.js, `jsconfig` alias, `app/` skeleton, runtime = nodejs
- [ ] `src/server/state.js`, `events.js` (SSE bus)
- [ ] Routes per `docs/06` (mandate, shop/start + SSE, ledger, demo/reset)

## Day 5 — Thu Nov 5: PayPal flow in the app
- [ ] `/api/paypal/return` + cancel; approve/decline for `ASK_HUMAN`; deliver/cancel
- [ ] Red-team route `/api/demo/attack`
- [ ] End-to-end in mock mode via curl/tests

## Day 6 — Fri Nov 6: UI core
- [ ] Layout, MandateCard, BudgetMeter, GoalBar
- [ ] NegotiationFeed with decision chips; ApprovalCard; PaymentStatus stepper

## Day 7 — Sat Nov 7: UI finish + AG Grid
- [ ] AuditLedger (AG Grid), RedTeamButton, error/empty/loading states
- [ ] Webhook endpoint with signature verification; feed updates

## Day 8 — Sun Nov 8: real run + polish
- [ ] Full flow on PayPal sandbox with live LLM (not scripted)
- [ ] Visual polish (spacing, type, dark mode), 1080p check

## Day 9 — Mon Nov 9: deploy
- [ ] Deploy to Render; env vars; set PayPal return/cancel/webhook URLs to the public URL
- [ ] Smoke-test hosted app from a clean browser; rate limit / single session guard
- [ ] Optional: merchant-side PayPal Agent Toolkit invoice (only if all above is solid)

## Day 10 — Tue Nov 10: docs + hardening
- [ ] README final (setup, architecture, mocked parts, third-party services, how it was built during the hackathon)
- [ ] Test from a clean clone; `npm test` green; no secrets in git history
- [ ] Rehearse demo twice end-to-end

## Day 11 — Wed Nov 11: record + submit
- [ ] Record video (< 3:00), upload to YouTube (public/unlisted per rules), backup take
- [ ] Fill Devpost; paste links; preview submission
- [ ] **Submit** (do not wait for Nov 12)

## Day 12 — Thu Nov 12: buffer only
Fix submission issues only. No new features.

## Cut list (if behind, drop in this order)
1. Webhooks (keep return-URL flow) 2. Merchant-side Agent Toolkit 3. Dark mode 4. Live LLM merchant (use scripted) 5. Live parser (use preset mandate + manual edit).
**Never cut:** policy engine, prompt-injection block demo, real PayPal sandbox authorize→capture, hosted URL, video.

## Open questions
- Path A or B? (`docs/03`)
- Which LLM provider/model for the demo (cost, latency)?
- Sponsor prizes to target after reading Section 8 (`docs/08`)?
- Does the hackathon allow winning overall + sponsor prizes together?

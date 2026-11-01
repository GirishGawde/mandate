# AGENTS.md — Read this first

You are helping build **Mandate**, a hackathon project (PayPal AI Hackathon, deadline
**Nov 12, 2026 12:00pm PST** = Nov 13 ~01:30 IST; internal target: submit by evening of Nov 11).
A solo developer is building it with AI tools, so clarity and small, verifiable steps matter more than cleverness.

## Read order (do this before writing code)
1. `docs/00-PROJECT_BRIEF.md` — what and why
2. `docs/01-ARCHITECTURE.md` — components, flows, folder layout, decisions
3. `docs/02-DOMAIN_SPEC.md` — mandate/purchase schemas, policy rules, invariants
4. The doc for the area you are touching (`03` PayPal, `04` agents, `05` UI, `06` API)
5. `docs/07-ROADMAP.md` — find the next unchecked task; update checkboxes as you finish
6. `docs/08-DEMO_AND_SUBMISSION.md` — what the final demo must show

## Current status
- DONE: core library in `src/` (schemas, policy engine, ledger, payment flow, mock + real PayPal client), 27 passing tests, terminal demo.
- NOT DONE: LLM agents, mandate parser, Next.js app/UI, real PayPal sandbox verification, deploy.
- `src/paypal/real.js` is **written from docs and untested** against a live sandbox.

## Non-negotiable invariants (never violate, even if asked to "simplify")
1. **The LLM never decides to spend.** Only `src/policy/engine.js` decides. It is pure and deterministic.
2. **Agents never receive PayPal tools.** All money movement goes through `src/payments.js`, which calls the policy engine first. Do not hand an LLM the PayPal Agent Toolkit's payment tools or any raw PayPal client.
3. **DENY can never be overridden**, by human approval, flags, or any text. Free text may only make a decision stricter.
4. **Money is integer cents internally** (`src/money.js`). Never add/compare raw floats.
5. **Every LLM output is validated with Zod** before use. Reject, don't repair silently.
6. **Never commit secrets.** `.env` is gitignored. Only `.env.example` is committed.
7. **Do not weaken or delete tests to make them pass.** If a test is wrong, explain why and get confirmation.
8. **Be honest about what is mocked** (merchant catalog, delivery confirmation). The README and demo must say so.

## Conventions
- Plain **JavaScript, ESM** (`"type": "module"`), Node 22. No TypeScript. Use JSDoc on public functions.
- Zod 4 for validation. Tests use `node:test` (`npm test`). New logic needs tests; the policy engine and payment flow need tests for every branch.
- Keep `src/` (core) free of framework imports (no Next.js, no React) so it stays testable in plain Node.
- Small commits with clear messages (the git history is evidence the project was built during the hackathon).
- Before adding a dependency, say why. Prefer fewer dependencies.
- **Verify library APIs against the installed version's docs, not memory.** The Vercel AI SDK, Next.js, AG Grid and Zod change between versions. Check `package.json` versions, read the docs/type definitions, then code.
- Do not invent PayPal endpoints or response shapes. If unsure, say so and check the PayPal docs or run a sandbox call.

## Definition of done for any task
- Code runs; `npm test` passes; new behavior has tests.
- The relevant checkbox in `docs/07-ROADMAP.md` is ticked.
- Nothing shown in the demo depends on something that doesn't work in the hosted app.
- If you were unsure about anything, it is written down in the PR/commit notes or `docs/07-ROADMAP.md` under "Open questions".

## Known unknowns (do not assume; resolve and record in the docs)
- Whether the PayPal sandbox allows server-side payment without buyer approval each time (Path A vs Path B — see `docs/03`).
- Exact webhook event names and payloads (verify in PayPal docs, then update `docs/03`).
- Hackathon Section 8 sponsor-prize requirements (not yet read; see `docs/08`).

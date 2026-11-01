# 00 — Project Brief

## One-liner
**Mandate** lets you give an AI agent a spending *mandate* — a plain-language set of rules — and
guarantees, in code, that the agent can never spend outside it. PayPal moves the money; a deterministic
policy engine decides whether it is allowed to.

## The problem
AI agents can now shop, negotiate and pay. Almost nobody trusts them with a wallet, because agents can be
manipulated by text (prompt injection, a pushy merchant bot, a sneaky "free trial"). Trust, not capability,
is the blocker for agentic commerce.

## The solution
1. The user writes a mandate in plain English ("up to $200/month on travel and electronics, ask me above $50, never subscriptions").
2. An LLM turns it into a strict, validated JSON mandate; the user confirms it.
3. A **buyer agent** shops and negotiates with a **merchant agent** (both LLMs, each with its own rules).
4. Any purchase the buyer agent proposes goes through the **policy engine** (plain code) → `ALLOW`, `ASK_HUMAN`, or `DENY`.
5. Only `ALLOW` (or human-approved `ASK_HUMAN`) reaches PayPal: create order → buyer approval → authorize (hold) → capture on delivery, or void.
6. Everything is recorded in a human-readable **audit ledger**.

## Core principle
> **The LLM proposes. Deterministic code disposes.**
The model can be fooled; the policy engine cannot. Free text can only ever make a decision *stricter*.

## Hackathon context
- Event: PayPal AI Hackathon (Devpost: https://paypalaihackathon.devpost.com/). Deadline Nov 12, 2026 12:00pm PST.
- Requirement: integrate the PayPal developer platform (free sandbox) **and** an AI tool/model; PayPal must be central.
- Must be new (or significantly updated) during the submission period; must run as depicted in the video.
- Submission: hosted working demo (or runnable repo), text description, list of AI tools used, **public open-source repo with a visible license**, **YouTube demo video under 3 minutes**.
- Judging criteria: Technological Implementation, Design, Potential Impact, Innovation, Presentation.
- Target awards: Best Use of Agentic Commerce, Best Use of PayPal + AI, Best Demo Delivery, plus overall. Possible sponsor prizes: Render (hosting), AG Grid (audit table). See `docs/08`.

## Success criteria (what "good" looks like)
1. A judge can open the hosted URL and complete the full story without help.
2. The prompt-injection attack is visibly blocked, with a clear human-readable reason.
3. A real PayPal **sandbox** transaction (authorize → capture) appears in the sandbox dashboard and in our ledger.
4. The 3-minute video shows only things that work in the hosted app.
5. Clean public repo: README, license, tests, docs.

## Non-goals (do not build)
- Real-money payments, production PayPal, KYC, user accounts/auth beyond a single demo user.
- Multi-user data, real merchant integrations, real delivery tracking.
- Mobile apps, browser extensions, other payment providers.
- Other PayPal products (Venmo, Braintree, Hyperwallet...) unless everything else is done.

## What is mocked (must be disclosed honestly in README + demo)
- The **merchant catalog** and merchants' pricing rules (a small fixed set).
- **Delivery confirmation** (a simulated "shipped/delivered" event from the merchant side).
- PayPal is **sandbox only**; no real funds move.

## Glossary
- **Mandate**: the user's spending rules (see `02`).
- **Purchase proposal**: structured request an agent submits to buy something.
- **Policy engine**: pure function returning ALLOW / ASK_HUMAN / DENY with reasons.
- **Reservation**: a pending order counts against the budget immediately.
- **Path A / Path B**: whether in-mandate purchases can be paid server-side without buyer approval (A) or need a one-tap PayPal approval each time (B). See `03`.

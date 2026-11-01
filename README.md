# Mandate

Spending guardrails for AI agents. You give your agent a **mandate** (budget, categories,
merchants, approval limits). A deterministic policy engine checks every purchase *before*
any PayPal call is made. The LLM proposes; plain code disposes.

Built for the PayPal AI Hackathon (new project, started Nov 1, 2026).

## Run

    npm install
    npm test            # 27 tests
    npm run demo:core   # terminal walkthrough against mock PayPal

## Design principle

Agents (and the merchants' agents they talk to) can be manipulated by text. So the decision
to spend is never made by a model. /engine.js` is a pure function; free text can
only make a decision stricter, never looser. See the prompt-injection tests.



PayPal Sandbox (Orders v2 / Payments v2), Zod. More added as built.

## License

MIT

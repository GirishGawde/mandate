# 08 — Demo Script & Submission Checklist

## Judging criteria → how Mandate answers
| Criterion | Our answer |
|---|---|
| Technological Implementation | Real PayPal sandbox lifecycle (authorize → capture/void), pure policy engine, validated LLM I/O, tests, bounded multi-agent loop |
| Design | Single-story dashboard, plain-language decisions, budget meter, audit grid |
| Potential Impact | Trust is the blocker for agentic commerce; this is the guardrail layer anyone can adopt |
| Innovation | "LLM proposes, code disposes": deterministic enforcement + adversarial merchant agent + reservation accounting |
| Presentation | Tight 3-minute video; live hosted demo; clear README |

## Video script (target 2:45, hard limit 3:00)
| Time | Show | Say (gist) |
|---|---|---|
| 0:00–0:20 | Title + problem | "Agents can shop. Nobody trusts them with a wallet. Prompt injection, pushy merchant bots, sneaky free trials." |
| 0:20–0:50 | Type mandate in plain English → parsed rules → Confirm | "I give my agent a mandate. It becomes strict rules — and nothing is active until I confirm." |
| 0:50–1:30 | Goal → live negotiation → deal within limits → PayPal sandbox approval → funds held | "Two agents negotiate. The deal fits my mandate, so PayPal authorizes — funds are held, not spent." |
| 1:30–1:50 | Mark delivered → captured; budget meter updates | "On delivery we capture. If it fails, we void." |
| 1:50–2:30 | **Attack:** shady merchant injection / red-team button → ⛔ Blocked with reasons | "The merchant tries to talk my agent into $900 and a hidden subscription. It's blocked — not by the AI, by code. Even a fully compromised agent can't overspend." (state clearly if the attack is simulated) |
| 2:30–2:50 | Audit ledger + PayPal sandbox dashboard side by side | "Every decision is auditable, every payment is real PayPal sandbox." |
| 2:50–3:00 | Close | "The LLM proposes. Deterministic code disposes." |

Recording tips: 1080p, hide bookmarks/notifications, zoom browser to ~110–125%, use scripted mode if the live API is flaky, record a backup take, add captions. Disclose in the video/description what is mocked (catalog, delivery) and that PayPal is sandbox.

## Devpost submission checklist
- [ ] Project name + tagline
- [ ] Text description: problem, solution, how it works, how PayPal is used, how AI is used, what's mocked, what's next
- [ ] "Built with": Node.js, Next.js, PayPal Orders/Payments (Sandbox), Zod, Vercel AI SDK, <LLM provider>, AG Grid, Render
- [ ] AI tools used list (include IDE agents: Antigravity, Claude Code, etc., plus the runtime LLM)
- [ ] Hosted demo URL (works for a stranger, no login) + any test instructions
- [ ] Public GitHub repo with visible OSS license (MIT, `LICENSE` at root)
- [ ] YouTube video < 3:00
- [ ] Screenshots (decision chips, budget meter, audit grid, PayPal sandbox transaction)
- [ ] If asked: explain that the project is new / built during the Submission Period (git history supports this)
- [ ] Third-party terms respected (PayPal, LLM provider, AG Grid, Render); list in README

## README must contain
What it is · demo link · architecture diagram · how to run (mock + sandbox) · env vars · tests · what's mocked · third-party services · license · how it was built during the hackathon.

## Sponsor prizes (fill in after reading Section 8 on Devpost)
- Sponsors: AG Grid, APIMatic, Astropods, Bryntum, Channel3, Elastic, KERNEL, Postman, Render, Zapier.
- Likely natural fits: **Render** (hosting), **AG Grid** (audit ledger). Optional: **Postman** (API collection for our routes), **Zapier** (alert on blocked attempts).
- Each sponsor prize has extra requirements in Section 8. _TBD: paste requirements here and add tasks to the roadmap._

## Final-day checklist
- [ ] Clean-clone run works · `npm test` green · hosted URL loads fast
- [ ] No secrets in repo or git history · `.env.example` present
- [ ] PayPal return/cancel/webhook URLs point to the hosted app
- [ ] "Reset demo" works; demo starts from a clean state
- [ ] Video and text match what the hosted app actually does
- [ ] Submitted at least a few hours early

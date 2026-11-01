# 05 — UI Spec (Next.js App Router, `app/` + `components/`)

Design is a judging criterion, and the video is recorded from this UI. Aim: calm, trustworthy fintech. Big, legible, 1080p-friendly.

## Principles
- One page, one story: **mandate → negotiation → decision → payment → audit**.
- Every decision shows a plain-language reason. Never show raw JSON as the main view.
- Honest labels: "Sandbox", "Mock catalog", "Simulated compromised agent".
- Works on a 1280–1920px desktop first; reasonably usable on mobile.
- Light and dark mode via CSS variables; semantic colors: green = allowed, amber = needs approval, red = denied, blue = PayPal activity.

## Layout (single dashboard)
```
┌ Header: Mandate logo · Sandbox badge · Reset demo ───────────────┐
├ Left column ───────────────┬ Right column ───────────────────────┤
│ 1. Mandate card            │ 3. Live negotiation feed             │
│    - textarea + "Parse"    │    chat-style, buyer vs merchant     │
│    - parsed rules (editable│    decision chips inline             │
│      chips/fields)         │ 4. Approval / payment status card    │
│    - Confirm button        │    (PayPal order, authorize, capture)│
│ 2. Budget meter            ├──────────────────────────────────────┤
│    spent / reserved / left │ 5. Audit ledger (AG Grid, full width)│
│ Goal input + "Start shop"  │                                      │
│ [Simulate compromised agent]                                      │
└────────────────────────────┴──────────────────────────────────────┘
```

## Components
| Component | Behavior |
|---|---|
| `MandateCard` | Textarea → `POST /api/mandate/parse` → shows editable parsed rules + `assumptions`/`unclear` prompts → "Confirm mandate" → `POST /api/mandate`. Locked/active state after confirm, with "Edit" to re-open. |
| `BudgetMeter` | Stacked bar: captured / reserved (pending+authorized) / remaining, with dollar labels. Animates on `budget_update`. |
| `GoalBar` | Text input ("Find me a train ticket to … under $60") + Start. Disabled until mandate confirmed. |
| `NegotiationFeed` | Messages as chat bubbles (buyer left, merchant right), unit price/qty badges. Shows `policy_decision` as a full-width chip: ✅ Allowed / ⚠️ Needs your approval / ⛔ Blocked + reasons. Auto-scroll. |
| `ApprovalCard` | On `approval_required`: purchase summary + reasons + **Approve** / **Decline**. |
| `PaymentStatus` | Stepper: Order created → Buyer approved (PayPal) → Funds held → Delivered → Captured (or Voided). "Open PayPal approval" button (sandbox link). "Mark delivered" (simulated) button. |
| `AuditLedger` | AG Grid (Community). Columns: time, type, decision, merchant, amount, reasons, PayPal ids. Row color by decision. Sort/filter on. Auto-updates. |
| `RedTeamButton` | "Simulate compromised agent" → `POST /api/demo/attack`. Tooltip explains it's simulated. |
| `Toasts/Errors` | Plain-language errors; never a blank panel. |

## States to design (don't skip — judges poke at these)
Empty (no mandate) · parsing · parse error · needs clarification (`unclear`) · confirmed · negotiating · no deal · denied · needs approval · awaiting PayPal approval · authorized · captured · voided · LLM/PayPal error · reset.

## Visual direction
- Typeface: one clean sans (e.g. Inter or system UI) + tabular numbers for money.
- Generous spacing, rounded cards, subtle borders; avoid default-template look.
- Money always formatted `$49.99`, right-aligned in tables.
- Keep animations purposeful (budget bar, decision chip). No decorative motion.
- Use the `frontend-design` guidance/skill if your tool has it.

## Accessibility & polish
Keyboard-operable buttons, visible focus, color never the only signal (icons + text on chips), contrast AA, `prefers-color-scheme`.

## AG Grid notes (sponsor prize)
Use `ag-grid-react` Community. **Check the installed version's docs** for module registration and theming (this changed across major versions). The grid should be genuinely useful (filter by decision, sort by time), not decoration.

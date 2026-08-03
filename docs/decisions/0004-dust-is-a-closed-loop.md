---
date: 2026-07-29
status: superseded
superseded-by: 0005-wagering-earns-the-cosmetic-currency.md
---

# 0004 — Collection rewards are paid in dust, never coins

> **Superseded by `0005-wagering-earns-the-cosmetic-currency.md`** — dust is
> removed in the wager-economy revamp. The rationale below still holds and
> shaped its replacement: 0005's one-time completion bonus exists to avoid
> the same compounding failure this entry guarded against.

**Decision:** Set bonuses, tips and salvage pay dust. Dust buys cosmetics and can never be converted to coins.

**Why:** A cosmetic that generates coins is a money printer whose output compounds as players collect more, which is the classic runaway-inflation failure. Paying in a closed-loop currency lets us reward collection depth as generously as we like without any effect on the main economy.

**Consequence:** The daily set stipend needs a global cap regardless — see `02-economy/dust.md` — because uncapped dust still devalues crates.

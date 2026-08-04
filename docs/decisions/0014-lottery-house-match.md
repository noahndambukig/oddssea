---
date: 2026-08-04
status: accepted
---

# 0014 — The lottery is positive-EV: a 50% house match, bounded by ticket caps

**Decision:** The lottery pot is **1.5× ticket sales** — the house matches
50% of the pool, free to players. It is the only game in the house where
the player has the edge, and that is the point: the daily and weekly
draws are promotional, communal generosity moments. Three bounds make it
safe:

1. **Per-player ticket caps** per draw, sized so a max-ticket player's
   expected subsidy is comparable to one daily task — the cap is what
   turns "+50% EV" from a dominant strategy into a bounded bonus with
   drama. Figures in `02-economy/currency-model.md`.
2. **Tickets earn no Pearls.** The theo formula is undefined at negative
   edge, and a game that already pays +EV must not also mint the
   cosmetic currency.
3. **The match is accounted as a faucet.** Guardrails rule 1 ("one
   faucet, one sink") is amended: the Shell economy has two faucets —
   tasks, and the capped lottery match — and still exactly one sink.

**Why:** Noah's call, extending the lottery-as-shared-moment design: a
pot that visibly grows past what players put in makes the countdown a
gift, not a tax, and generosity concentrated in one scheduled communal
event buys more goodwill per Shell than the same subsidy spread invisibly
across task payouts. Uncapped, the same design is an infinite money
printer — the cap is not tuning, it is what makes the mechanic possible.

**Consequence:** The bankroll simulation needs a lottery term before the
ticket figures are locked — the subsidy lowers the Shell destruction
ratio, and task payouts may need a trim to keep the ratio ≥ 0.90
(roadmap question 11). The lottery is also now mechanically a raffle
with a pooled pot, not a fixed-prize game — specced in
`01-game/game-modes.md`.

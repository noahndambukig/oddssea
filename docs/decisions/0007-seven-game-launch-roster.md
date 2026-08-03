---
date: 2026-08-03
status: accepted
---

# 0007 — Seven games at launch, weighted toward shared moments

**Decision:** The launch roster is seven games:

| Game | Role |
|---|---|
| Sea races | Flagship communal spectacle — shifting pre-race odds, spectator stands |
| Crash | Shared multiplier curve; seeing other players cash out is the point |
| Roulette | Communal table — one wheel, one timer, everyone's bets on it |
| Lottery | Daily and weekly countdown draws; a scheduled all-players moment |
| Blackjack | Communal tables seating up to 6 |
| Plinko | Solo instant game — the high-frequency loop between shared events |
| Dice | Solo over/under; primarily the pipeline-iteration game, low UI prominence |

**Why:** Deliberately few. Communal games need critical mass — a small early
population spread across many rooms produces empty tables, and an empty
communal game is worse than none. Five of seven are shared-outcome
experiences because avatar visibility is what the cosmetic economy runs on
(pillar 2). Dice exists mainly to prove the wager → settle → Pearl pipeline
with the simplest possible math before anything complex is built on it.

Considered and **deferred, not rejected**: craps and baccarat (communal, but
overlap roulette's role), mines/hi-lo/limbo/towers (overlap plinko/dice),
pari-mutuel race pools, PvP duels and poker (rake-based economics need their
own spec), bingo and keno. **Slots argued against outright**: fixed odds but
art-heavy — each machine is a content project, which fights pillar 4.

Two consequences of what was *not* picked: sea-race odds are **house-banked
(bookmaker model)**, not pooled from player bets, since pari-mutuel was
deferred; and with no PvP at launch, the entire economy runs on house edge
alone.

**Consequence:** Blackjack ships only once Pearl rewards are normalised by
theoretical loss (stake × game edge) — its low, skill-dependent edge would
otherwise make it a Pearl farm. This resolves the former roadmap question 7:
avatars **are** visible during play — at tables, in race stands, on the
crash graph — so the flex layer shares the stage with the games rather than
carrying status alone. Real-time sync moves from peripheral to central in
`04-technical/hosting.md`'s scope: races, crash, roulette, blackjack and
lottery countdowns all need it; only plinko and dice are request/response.
`01-game/core-loop.md` and `game-modes.md` are now writable.

---
status: draft
purpose: How a play session works, from logging in to logging out.
depends-on: ../decisions/0005-wagering-earns-the-cosmetic-currency.md, ../decisions/0007-seven-game-launch-roster.md, ../decisions/0008-no-seasons-in-v1.md
---

# Core Loop

## What this is

The connective tissue between the task faucet, the seven games and the
cosmetic sink — what a player actually does, minute to minute and week to
week. Everything else in the docs assumed this file; it is written last
because decisions 0005, 0007 and 0008 had to fix the economy shape, the
game roster and the no-seasons scope first.

## The loop

Tasks pay Shells → Shells are wagered → wagering mints Pearls while the
house edge drains Shells → Pearls buy crates and cosmetics → cosmetics are
*seen*, because play happens in shared spaces → being seen pulls players
back in.

Every arrow is load-bearing:

- **Tasks → Shells** is the only faucet. It rewards showing up and playing,
  never winning — see `tasks.md`.
- **Wagering → Pearls** is the only source of the cosmetic currency
  (`decisions/0005`). A player who never bets never collects.
- **Edge → the sink.** Wagering is Shell-negative in expectation; that is
  the economy's drain, not a flaw.
- **Cosmetics → visibility** is why five of the seven games are communal
  (`decisions/0007`): the race stands and table seats are the stage the
  collection system performs on.

## Session anatomy

**Races are the metronome.** They run on a fixed public schedule — one
shared cadence, the same for everyone — so they function as appointment
beats: the pre-race window is when odds are live and bets go in, the race
itself is a shared spectacle, and the stands are where avatars gather.

**Between races, the floor is open.** Instant games (plinko, dice) and
crash rounds fill short gaps; roulette and blackjack tables hold players
who want a seat rather than a spectacle.

**The day has one site-wide moment**: the daily lottery countdown and
draw. **The week has a bigger one**: the weekly draw, landing alongside
the weekly task reset.

| Rhythm | Beat |
|---|---|
| Seconds | A bet resolves |
| Minutes | The next race |
| Day | Login claim, daily tasks, daily draw |
| Week | Weekly tasks, weekly draw |

Nothing is longer than a week. There are no seasons in v1
(`decisions/0008`).

## The first session

Onboarding is a guided tour whose steps are paid one-time tasks — the tour
*is* the starter grant. In order: what Shells and Pearls are, open your
free crate, equip what you pulled, watch a race, place a first bet. A new
player finishes the tour funded, dressed and having seen the two loops
(wager and collect) with their own eyes.

## Rules

1. **Every day is bust-proof.** The login claim plus the zero-Shell tasks
   always fund a minimum session. This is the comeback floor — implemented
   as task design, not a separate mechanic.
2. **The faucet is decoupled from outcomes.** At most one active task may
   depend on winning. Income comes from participation.
3. **Nothing owned pays forever.** All collection and milestone rewards are
   one-time (`decisions/0005`).
4. **The client renders; the server decides.** Every task completion, wager
   and payout resolves server-side — see `../04-technical/hosting.md`.

## What this deliberately does not do

- No seasons, no pass track (`decisions/0008`).
- No PvP loops (`decisions/0007` — deferred).
- No per-game rules — bet types, odds and edges belong in `game-modes.md`.
- No figures — see Numbers.

## Open questions

- **Race cadence interval.** Minutes-scale, but the exact number is a
  tuning decision that needs a live floor to observe.
- **Lottery ticket mechanics** (price, ticket caps, draw structure) —
  specced in `game-modes.md`.

## Numbers

Every payout, threshold and interval lives in
`../02-economy/currency-model.md`, pending the bankroll-ruin simulation.

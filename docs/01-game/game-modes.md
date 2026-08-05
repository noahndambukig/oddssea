---
status: agreed
purpose: The rules of each launch game — how bets are placed, resolved and presented.
depends-on: core-loop.md, ../decisions/0007-seven-game-launch-roster.md, ../decisions/0014-lottery-house-match.md, ../decisions/0019-pass-3-on-the-game-specs.md
---

# Game Modes

## What this is

How each of the seven launch games (`decisions/0007`) actually plays —
what you bet on, how it resolves, and what the table or track looks like
while it does. **Mechanics only.** Edges, odds parameters, minimum bet,
crash cap, roster size and every lottery figure live in
`../02-economy/currency-model.md`; this file names them and links rather
than repeating them, because a figure written in two places is wrong in
one of them within a month (`../00-project/doc-conventions.md`). Timings
below are game feel, not currency, so they do live here.

Every outcome resolves server-side (`../04-technical/hosting.md`), and
every roll is logged (`../04-technical/data-model.md`, rule 5).

## Sea races — the metronome

Races run on a fixed public schedule; the interval is a tuning decision
(`core-loop.md`). Each race: a betting window while odds are live, then
a ~45-second spectacle, then settlement. The stands are a shared space —
spectator avatars are visible, which is the flex layer on stage.

**Persistent roster.** Racers are named sea creatures from a stable
roster, a subset of which contests each field (`racers.md`; sizes in the
currency model), each with personality and **visible form** — recent
finishes, win rate, preferred conditions.
Players study form like horse racing. Form is engagement, not exploitable
edge: each racer carries hidden true win probabilities that drift slowly
over time, and displayed odds are always derived from those probabilities
plus the house overround — there is no mispricing to find.

**Win only at launch.** Bet on a racer to finish first. Place, each-way
and exotics are post-launch.

## Crash — the shared curve

Shared rounds: a ~10-second betting window, then the multiplier climbs
from 1.00× until it busts. Cash out any time before the bust to lock
stake × current multiplier. Everyone rides the same curve and cashouts
are visible in the feed — seeing others bail is the game. Auto-cashout
at a player-set multiplier is supported. The bust distribution is derived
directly from the game's edge, up to the multiplier cap in the currency
model.

## Roulette — the shared table

European single-zero wheel (this is exactly the table-game edge in the
currency model). One shared wheel per room on a ~40-second spin timer;
every seated player's chips are visible on the same layout. Standard
inside and outside bets.

## Blackjack — communal tables

Tables seat up to 6 (`decisions/0007`). Six decks, dealer stands on soft
17, blackjack pays 3:2, double on any two cards, split once. A per-turn
timer keeps tables moving; an away player auto-stands. Ships only with
the theo-based Pearl rule in force (`decisions/0009`), which it is.

## Lottery — the countdown

A raffle with a pooled pot: every ticket is an entry, and **the house
matches a fixed share of ticket sales, free** — which is what makes the
lottery deliberately positive-EV (`decisions/0014`). Daily draw pays one
winner; the weekly pays three on a fixed split. Multiplier, split and
per-player ticket caps are all in the currency model. The free weekly
ticket from `tasks.md` counts toward the weekly cap. **Tickets earn no
Pearls.** The pot is displayed live, site-wide, under the countdown, and
both draws close on the UTC boundaries in `core-loop.md`.

## Plinko — the solo drop

Three risk profiles (low/mid/high), each with a published multiplier
table at the instant-game edge. Pick risk, pick stake, drop.

## Dice — the pipeline proof

Over/under a slider threshold, payout derived from the chosen
probability at the instant-game edge. Deliberately the simplest game in
the house; it exists to prove the wager → settle → Pearl pipeline and
ships first.

## Rules

1. **Every game publishes its numbers.** Edges, odds derivations, drop
   distributions and pity counters are disclosed in the UI — the same
   policy as crates.
2. **No maximum bet in v1.** All-in is a legitimate play; the comeback
   floor (`core-loop.md`) is the safety net. Revisit only with evidence.
3. **Odds are never mispriced on purpose.** Race odds derive from true
   probabilities plus overround; form is flavour and information, never
   +EV.
4. **Settlement is atomic.** A bet's debit, resolution and payout are one
   ledger transaction (`../04-technical/hosting.md`).

## What this deliberately does not do

- No PvP (poker, duels) and no pari-mutuel pools — deferred
  (`decisions/0007`).
- No race exotics (forecast, accumulator) at launch.
- No live/in-race betting: the window closes when the race starts.
- No progressive jackpot outside the lottery pot.
- No Mythic prize draws in v1 — flagged as a candidate future lottery
  event (a one-of-one in the weekly pot would be enormous; Mythic source
  rules in `../03-cosmetics/rarity-tiers.md`).

## Open questions

- **Race cadence interval** — shared with `core-loop.md`; tuning, needs a
  live floor. (The racer roster, formerly open here, is `racers.md` and
  `../03-cosmetics/content/data/racers.json`.)

## Numbers

All figures — edges, ticket price, ticket caps, pot split, crash cap,
roster size — live in `../02-economy/currency-model.md`.

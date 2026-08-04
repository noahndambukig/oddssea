---
status: draft
purpose: The rules of each launch game — how bets are placed, resolved and presented.
depends-on: core-loop.md, ../decisions/0007-seven-game-launch-roster.md, ../decisions/0014-lottery-house-match.md
---

# Game Modes

Seven games (`decisions/0007`). Edges, odds parameters, minimum bet and
lottery figures live in `../02-economy/currency-model.md`; this file is
mechanics only. Every outcome resolves server-side
(`../04-technical/hosting.md`).

## Sea races — the metronome

Races run on a fixed public schedule; the interval is a tuning decision
(`core-loop.md`). Each race: a betting window while odds are live, then
a ~45-second spectacle, then settlement. The stands are a shared space —
spectator avatars are visible, which is the flex layer on stage.

**Persistent roster.** Racers are named sea creatures from a stable
roster (~14 at launch; 6–8 race per field), each with personality and
**visible form** — recent finishes, win rate, preferred conditions.
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
directly from the game's edge; capped at 1,000×.

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

A raffle with a pooled pot: every ticket is an entry, and **the pot is
1.5× ticket sales — the house matches 50%, free** (`decisions/0014`).
Daily draw (one winner) and weekly draw (three winners, split 60/30/10).
Per-player ticket caps per draw — figures in the currency model. The
free weekly ticket from `tasks.md` counts toward the weekly cap.
**Tickets earn no Pearls.** The pot is displayed live, site-wide, under
the countdown.

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

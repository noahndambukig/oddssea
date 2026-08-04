---
status: draft
purpose: Every way a player earns Shells outside of wagering.
depends-on: core-loop.md, ../decisions/0005-wagering-earns-the-cosmetic-currency.md, ../decisions/0008-no-seasons-in-v1.md
---

# Tasks

## What this is

The Shell faucet, itemised. Task *structure* lives here and is stable;
task *payouts* are relative sizes (S/M/L) until the simulations set real
figures in `../02-economy/currency-model.md`. The roster of rotating
challenges will grow like content; the categories should not.

## Daily

Constant every day:

| Task | Size | Notes |
|---|---|---|
| Login claim | S, streak-scaled | Grows over consecutive days, caps at day 7, missing a day resets the streak |
| First bet of the day | S | Converts logins into play |

Plus **three challenges drawn daily** from a rotating pool:

| Pool task | Size | Notes |
|---|---|---|
| Place N bets (any game) | S | Volume |
| Attend N races | S | **Zero-Shell** — watching is free, works when busted |
| Play 2 different games | S | Spreads players across the roster |
| Visit another player's Closet | S | **Zero-Shell**, feeds the flex layer |
| Win a bet | S | Outcome-based — at most one such task active at a time |

## Weekly

| Task | Size | Notes |
|---|---|---|
| Complete daily sets on 4 different days | L | The consistency reward — reachable by a 4-active-day casual, which is the point |
| Place N bets across M different games | M | Roster-wide volume |
| Attend N races over the week | M | Appointment-beat reinforcement |
| Complete any 3 weeklies | — | Pays a **free ticket to the weekly lottery draw**, not Shells |

## One-time

| Task | Size | Notes |
|---|---|---|
| Onboarding tour steps | S each | Economy intro · open free crate · equip it · watch a race · first bet. The chain is the starter grant |
| First bet in each of the 7 games | S each | Teaches the roster |
| First cosmetic equipped · first salvage · first fusion | S each | Feature discovery |
| Dex page completed | M each | One-time per page |
| Set completed | L | The one-time Shell bonus — `../decisions/0005` |

## Referral

The largest reward in the task system — growth is the explicit priority.

- **Payout gates on Shells earned, not signup.** The referrer is paid when
  the referred player's cumulative task earnings cross a threshold. The
  threshold is set **at or below the onboarding chain's total payout**, so
  a genuine new player crosses it in their first session or two — but an
  account that merely exists never triggers it.
- **Both sides are paid.** The referee gets a starter boost on top of
  onboarding, so an invite feels like a gift.
- **The ladder pays cosmetics.** Exclusive items at 5, 10 and 25 successful
  referrals — prestige that costs the economy nothing and advertises
  itself in the race stands.
- **The threshold is the anti-abuse lever.** Referrals pay a wagerable
  currency, so farming is the failure mode to watch. Instrument referral
  conversion from day one; if farming appears, raise the threshold —
  do not bolt on friction elsewhere first.

## Rules

1. **Every day is bust-proof**: the login claim plus zero-Shell pool tasks
   always fund a minimum session (`core-loop.md`, rule 1).
2. **At most one outcome-based task active at a time.**
3. **One-time means one-time** — no repeatable reward attached to owning
   or having completed anything (`../decisions/0005`).
4. **Referral pays only on the earn threshold**, never on account creation.

## What this deliberately does not do

- No season pass or season-scoped tasks (`../decisions/0008`).
- No tasks that pay Pearls — Pearls come only from wagering.
- No lifetime-wagered milestones — handle is already rewarded in Pearls;
  paying Shells for it would double-dip.

## Numbers

All task payouts, the streak curve and the referral threshold live in
`../02-economy/currency-model.md`, pending the bankroll-ruin simulation.

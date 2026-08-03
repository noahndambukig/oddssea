---
status: draft — pre-revamp figures, rewrite pending
purpose: Single source of truth for every currency figure in the system.
depends-on: ../decisions/0005-wagering-earns-the-cosmetic-currency.md
---

# Currency Model

> **The two-currency wager revamp (`decisions/0005`) replaces this model.**
> The currencies are now Shells (task-earned, wagerable) and Pearls
> (wager-earned, buys cosmetics). The figures below describe the pre-revamp
> coin economy and are retained only until the Shell/Pearl numbers are
> derived — that requires the bankroll-ruin simulation first. Do not build
> against anything below this line.

**Every currency number in the project lives in this file.** Other documents link here rather than restating figures. See `00-project/doc-conventions.md`, rule 2.

## Faucets — coins in

| Source | Amount |
|---|---|
| Per match | 15–40 (avg ~25), scaled by performance |
| Daily first win | 100 |
| Daily challenge | 75 |
| Weekly challenge | 400 |
| Season pass milestones | ~1,500 per season |

### Reference earn rates

| Player | Composition | Coins |
|---|---|---|
| **Committed** (10 matches/day, 7 days) | 250 match + 100 first win + 75 daily | **425/day · 2,975/week · 23,800/season** |
| **Casual** (3 matches/day, 4 days) | 75 match + 100 first win + 75 daily, plus 400 weekly | **~200/day · 1,400/week · 11,200/season** |

Roughly **70% of the casual player's income comes from dailies and weeklies rather than match volume.** This is deliberate and worth protecting: it means a low-volume player earns at a third of a committed player's rate rather than a tenth, which is the only reason seasonal sets are reachable for them at all.

Season length is assumed to be 8 weeks throughout.

## Sinks — coins out

| Sink | Cost | Type |
|---|---|---|
| Gear Crate | 500 | Primary |
| Skin Crate | 800 | Primary |
| Set Crate | 900 | Seasonal, targeted |
| Fusion: 4 Common → 1 Rare | 200 + items | Pure burn |
| Fusion: 4 Rare → 1 Epic | 500 + items | Pure burn |
| Fusion: 4 Epic → 1 Legendary | 1,500 + items | Pure burn |
| Fusion: 4 Legendary → chosen Legendary | 5,000 + items | Pure burn |
| Closet expansion | 2,000 | One-off |
| Extra loadout slot | 1,500 | One-off |
| Showcase pedestal | 3,000 | One-off |
| Marketplace listing fee | 50 | Pure burn |
| Marketplace sale tax | 10% of sale | Pure burn |

## Set completion timings

With the Set Crate at 900 and the first-four-distinct guarantee, completing a six-piece set costs ~10.4 crates ≈ **9,400 coins**.

| Player | Days to complete a set | Share of season earnings |
|---|---|---|
| Committed | ~22 | ~39% |
| Casual | ~47 | ~84% |

Both fit inside an 8-week season. Simulation in `simulations/`.

## The tension to watch

A casual player spending 84% of a season's income on a single set has almost nothing left for gear crates, and experiences the system as *one long grind toward one thing*. Survivable, but fragile.

If retention data shows casual players stalling mid-set, **the lever is the weekly challenge payout** — 400 → 600 takes them to ~1,600/week and the set to ~41 days. Raising the faucet for low-volume players is far less inflationary than cutting prices for everyone, and a visible price cut reads as an admission that the original price was a rip-off.

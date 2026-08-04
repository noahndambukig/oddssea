---
status: agreed — simulated, not playtested
purpose: Single source of truth for every currency figure in the system.
depends-on: ../decisions/0005-wagering-earns-the-cosmetic-currency.md, ../decisions/0009-pearl-to-item-pipeline.md, ../decisions/0010-crate-volume-and-premium-tier.md, ../decisions/0011-accountwide-pity-catalogue-expansion.md
---

# Currency Model

**Every currency number in the project lives in this file.** Other
documents link here rather than restating figures. See
`00-project/doc-conventions.md`, rule 2. Figures were derived by
`simulations/bankroll.py` and `simulations/crate-game.py`; re-run both
before changing anything here.

Two currencies (`decisions/0005`): **Shells** — task-earned, wagerable —
and **Pearls** — earned only by wagering, spent on cosmetics.

## Shells in — the task faucet

Task structure lives in `01-game/tasks.md`; the payouts live here.

| Task | Shells |
|---|---|
| Daily login | 50, +10 per consecutive day, capped at 100 (day 6) |
| First bet of the day | 25 |
| Daily challenge (3 offered per day) | 75 each |
| Weekly: complete daily sets on 4 different days | 500 |
| Weekly: volume across games | 300 |
| Weekly: race attendance | 300 |
| Onboarding tour (one-time) | 5 steps × 80 = 400 total |
| First bet in each game (one-time) | 50 each |
| Feature firsts (one-time) | 50 each |
| Dex page completed (one-time) | 200 |
| Set completed (one-time, `decisions/0005`) | 1,500 |
| Referral — referrer, on referee earning 300 | 2,000 |
| Referral — referee starter boost | 250 |

The referral threshold (300) sits below the onboarding chain total (400)
by design — see `01-game/tasks.md`.

### Reference earn rates

| Player | Pattern | Shells |
|---|---|---|
| **Committed** | 7 days, full streak, all dailies + weeklies | ~500/day · **~3,550/week** |
| **Casual** | 4 days, 2 of 3 dailies, consistency weekly | ~350/day · **~1,400/week** |

## Shells out — wagering

The **house edge is the only Shell sink**. Minimum bet **10 Shells** —
one casual day funds 35 minimum bets, the comeback floor.

| Game | Edge | Representative odds |
|---|---|---|
| Sea races | 10% (overround) | ~5.0 |
| Instant (crash, plinko, dice) | 3% | ~2.0 |
| Roulette | 2.7% | ~2.0 |
| Blackjack | 1.5% effective | ~2.0 |

At the reference mix (40% races, 30% instant, 20% roulette, 10%
blackjack) the blended edge is ~5.6%. Reference handle: **~58,000/week
committed, ~25,000/week casual**.

## Pearls in — the wager reward

Per bet: **0.75 × stake × edge**, plus on a win **0.30 × stake × edge ×
odds**. Expected total ≈ 1.05 Pearls per Shell of theoretical loss,
identical across games (farm-proof); long-odds wins pay visibly more.

Reference Pearl income: **~3,300/week committed, ~1,400/week casual**.

## Pearls out — crates, shop and sinks

| Sink | Pearls | Notes |
|---|---|---|
| Basic Gear Crate | 60 | Legendary 1% |
| Basic Skin Crate | 80 | skins priced above gear deliberately |
| Premium Gear Crate | 240 | Legendary 5%, Epic 20% |
| Premium Skin Crate | 320 | |
| Set Crate | 90 | keystone 2%; hybrid targeting (`decisions/0009`) |
| Direct purchase (featured in weekly rotation) | 1.5× expected crate-route cost | e.g. Legendary ≈ 9,500 |
| Fusion 4 Common → Rare | 50 + items | |
| Fusion 4 Rare → Epic | 150 + items | |
| Fusion 4 Epic → Legendary | 500 + items | |
| Fusion 4 Legendary → chosen Legendary | 1,500 + items | |
| Closet expansion | 800 | one-off |
| Extra loadout slot | 500 | one-off |
| Showcase pedestal | 1,200 | one-off |
| Marketplace listing | 20 | pure burn |
| Marketplace sale tax | 10% | pure burn |

Salvage (duplicates → Pearls): Common 4 · Rare 12 · Epic 45 · Legendary
180.

Pity: **Legendary guaranteed within 200 basic crate opens, account-wide**
(`decisions/0011`); premium within 40; set-chase keystone within 100 Set
Crates per chase. Drop tables live in `03-cosmetics/crates.md`.

## What the simulations show

| Outcome | Committed | Casual |
|---|---|---|
| Basic crates/week | ~47 | ~20 |
| First Legendary (median / p90) | 1.3 / 3.8 wk | 3.2 / 9.5 wk |
| Pity fires | ~13% of chases | ~13% |
| Legendaries/year | ~31 | ~12 |
| Set completion (median / p90) | 3 / 9 wk | 7 / 21 wk |
| Busts/week (typical stake sizing) | 0 | 0 |
| Shell destruction ratio | ~0.90 | ~0.96 |

## The tensions to watch

**The committed destruction ratio is 0.90**, so a committed player's
balance drifts up ~350 Shells/week. Mild, but if playtests show hoarding,
the lever is the race share of the game mix (races carry the fat edge) —
not task payouts, and never visible price rises.

**The casual set-chase p90 is 21 weeks.** The rotation buyout is what caps
the tail; if playtests show casuals stalling at 5/6, tighten the rotation
interval before touching drop rates.

**Catalogue expansion is an economy input** (`decisions/0011`): ~31
Legendaries/year for committed players means the Legendary pool must grow
by roughly one item per month or the top of the catalogue runs dry.

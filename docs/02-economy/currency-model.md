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
| Visitor tip (`decisions/0016`) | 10 per tip · **cap 50/day received**, 1 tip per visitor per closet per day |

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
blackjack) the blended edge is ~5.6%. Reference handle: **~74,000/week
committed, ~27,000/week casual**.

### Game parameters

| Parameter | Value |
|---|---|
| Crash multiplier cap | 1,000× |
| Race field | 6–8 racers from a roster of ~14 |
| Race overround | the races edge above |

### Lottery — validated by simulation

The lottery is **positive-EV by design** (`decisions/0014`): pot = 1.5×
ticket sales, house match accounted as a second, capped Shell faucet.
Tickets earn **no Pearls**. The bankroll sim confirms the subsidy is
absorbed by recycling — crate prices were re-derived to hold the
crates-per-week anchor after it landed.

| Parameter | Value |
|---|---|
| Ticket price | 50 Shells |
| Daily draw cap | 3 tickets per player · 1 winner |
| Weekly draw cap | 10 tickets per player (the free task ticket counts) · 3 winners, split 60/30/10 |
| Max expected daily subsidy per player | ~75 Shells (3 × 50 × 0.5) — sized like one daily task |

## Pearls in — the wager reward

Per bet: **0.75 × stake × edge**, plus on a win **0.30 × stake × edge ×
odds**. Expected total ≈ 1.05 Pearls per Shell of theoretical loss,
identical across games (farm-proof); long-odds wins pay visibly more.

Reference Pearl income: **~4,200/week committed, ~1,550/week casual**
(includes the knock-on handle from the lottery and tip faucets).

## Pearls out — crates, shop and sinks

| Sink | Pearls | Notes |
|---|---|---|
| Basic Gear Crate | 70 | Legendary 1% |
| Basic Skin Crate | 90 | skins priced above gear deliberately |
| Premium Gear Crate | 280 | Legendary 5%, Epic 20% |
| Premium Skin Crate | 360 | |
| Set Crate | 100 | keystone 2%; hybrid targeting (`decisions/0009`) |
| Direct purchase (featured in weekly rotation) | 1.5× expected crate-route cost | e.g. Legendary ≈ 11,000 |
| Fusion 4 Common → Rare | 50 + items | |
| Fusion 4 Rare → Epic | 150 + items | |
| Fusion 4 Epic → Legendary | 500 + items | |
| Fusion 4 Legendary → chosen Legendary | 1,500 + items | |
| Closet expansion | 800 | one-off |
| Extra loadout slot | 500 | one-off |
| Showcase pedestal | 1,200 | one-off |
| Marketplace listing | 20 | pure burn |
| Marketplace sale tax | 10% | pure burn |
| Weekly rotation: featured family | direct price (1.5×) | one family per week (`decisions/0016`) |
| Weekly rotation: spotlight Set Crate | 80 (20% off) | one set per week |

Salvage (duplicates → Pearls): Common 4 · Rare 12 · Epic 45 · Legendary
180.

Pity: **Legendary guaranteed within 200 basic crate opens, account-wide**
(`decisions/0011`); premium within 40; set-chase keystone within 100 Set
Crates per chase. Drop tables live in `03-cosmetics/crates.md`.

## What the simulations show

| Outcome | Committed | Casual |
|---|---|---|
| Basic crates/week | ~53 | ~19 |
| First Legendary (median / p90) | 1.3 / 3.8 wk | 3.7 / 10.5 wk |
| Pity fires | ~14% of chases | ~14% |
| Legendaries/year | ~32 | ~11 |
| Set completion (median / p90) | 3 / 8 wk | 8 / 22 wk |
| Busts/week (typical stake sizing) | 0 | 0 |
| Shell destruction ratio | ~0.92 | ~0.91 |

## The tensions to watch

**Destruction sits at ~0.92 for both profiles** — above the 0.90 floor
but with little headroom, because three faucets now feed one sink. Every
new faucet must be re-simulated before it ships; the lottery and tip
faucets each pushed crates/week off-anchor when added and were sized
back to fit.

**Tips are deliberately a garnish** (10 Shells, 50/day cap). Tips
correlate with closet depth, so a large tip faucet widens the
committed/casual gap rather than lifting both — the cap is what keeps
tipping social rather than economic.

**The casual set-chase p90 is 22 weeks.** The rotation buyout is what caps
the tail; if playtests show casuals stalling at 5/6, tighten the rotation
interval before touching drop rates.

**Catalogue expansion is an economy input** (`decisions/0011`): ~32
Legendaries/year for committed players means the Legendary pool must grow
by roughly one item per month or the top of the catalogue runs dry.

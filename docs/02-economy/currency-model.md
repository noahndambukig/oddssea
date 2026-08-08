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

**Referral ladder** (cosmetics, not Shells — costs the economy nothing):
exclusive items at **5, 10 and 25** successful referrals.

**Onboarding grant, one-time:** **3 Basic crates**, opened during the
tour. Three is not arbitrary — it is exactly the window
`03-cosmetics/crates.md`'s first-session guarantee covers, so a new player
finishes the tour with a garment and a skin that can be worn together.
Pearls come only from wagering (`decisions/0005`), so the first crates
have to be granted rather than bought; this line is what stops that grant
being invisible.

### Task completion targets

Structure is in `01-game/tasks.md`; the thresholds live here.

| Task | Target |
|---|---|
| Daily: place N bets (any game) | 10 |
| Daily: attend N races | 3 |
| Daily: play 2 different games | 2 |
| Weekly: place N bets across M different games | 100 bets · 4 games |
| Weekly: attend N races | 12 |

Sized against the reference patterns below: a casual player places ~45
bets on an active day, so every daily target is comfortably inside one
session and the weekly ones inside four. Race-attendance targets assume a
minutes-scale cadence and are the two figures to revisit when the cadence
lands (`01-game/core-loop.md`, open question).

### Reference earn rates

**Derived from the task table above, not estimated.** Committed:
550 login (50→100, capped day 6) + 175 first-bet + 1,575 dailies +
1,100 weeklies. Casual: 4 non-consecutive days, so the streak resets to
50 each time.

| Player | Pattern | Shells |
|---|---|---|
| **Committed** | 7 days, full streak, all dailies + weeklies | ~486/day · **3,400/week** |
| **Casual** | 4 days, 2 of 3 dailies, consistency weekly | 350/day · **1,400/week** |

Committed read ~500/day · ~3,550/week until 2026-08-05, when Pass 3
priced the task structure and found neither figure matched it
(`decisions/0019`). If a task payout changes, recompute both here **and**
in `simulations/bankroll.py`, which declares the same constants.

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
blackjack) the blended edge is ~5.6%. Reference handle: **~72,400/week
committed, ~27,300/week casual**.

### Game parameters

| Parameter | Value |
|---|---|
| Crash multiplier cap | 1,000× |
| Race field | 6–8 racers from a roster of ~14 |
| Race overround | the races edge above |

### Plinko — the published tables (`decisions/0027`)

Binomial drop over `rows` fair pegs; bucket k lands with probability
C(rows,k)/2^rows. Tables are priced against the 3% instant edge above,
rounded player-favorably to display-clean multipliers; the **exact RTP
is published in the UI** (`01-game/game-modes.md` rule 1) and the
shipping copy (`01-game/data/games.json`) is recomputed against its own
table at every deploy. A "win" — for the Pearl win-share and the
win-a-bet challenge alike — is a bucket paying **more than stake**.

| Profile | Rows | Multipliers (symmetric, centre bold) | Exact RTP | Max |
|---|---|---|---|---|
| low | 8 | 4.4 · 1.9 · 1.1 · 0.85 · **0.75** | 97.0703125% | 4.4× |
| mid | 12 | 26 · 9 · 3.1 · 1.7 · 1.0 · 0.7 · **0.49** | 97.0888671875% | 26× |
| high | 16 | 220 · 55 · 14 · 5 · 2.2 · 1.1 · 1.0 · 0.6 · **0.4** | 97.152099609375% | 220× |

### Crash — the bust law (`decisions/0028`)

The bust multiplier is drawn so that **`P(bust ≥ m) = 0.97/m`** — the
3% instant edge above, expressed as an inverse-CDF law — then floored
to 2 decimals and clamped to the cap in the table above. Because
flooring cannot cross a 2-decimal boundary, every cash-out target on
the cent grid from **1.01× (the minimum)** up to the cap has an
identical **multiplier RTP of exactly 97.00%**; ties (`target = bust`)
pay, in both the live and auto verbs. A bust of 1.00× — probability
≈ 4% — has no winners.

**Shell payouts floor to whole Shells** on top of that law:
`floor(stake × multiplier)`, so the effective Shell RTP sits at or
below 97.00% and converges to it as stakes grow (worst case just under
1 Shell per payout). Both facts are published in the UI disclosure.
The draw itself: `U = (first 48 bits of HMAC-SHA256(secret,
round_index) + 1) / 2^48`, `bust = clamp(1.00, floor2(0.97/U), cap)` —
deterministic per round, recomputable for audit
(`04-technical/hosting.md`; timings are game feel and live in
`01-game/game-modes.md`; shipping copy `01-game/data/games.json`).

### Roulette — one identity prices the table (`decisions/0029`)

European single-zero: the edge is **exactly 1/37 ≈ 2.7027%** (the 2.7%
in the games table above, made precise). Every standard bet pays
**`36 / coverage`** — straight 36×, split 18×, street 12×, corner 9×,
six-line 6×, dozen/column 3×, even-money 2× — so every bet type at
every stake returns **exactly `36/37 = 97.2973…%`** in expectation.
Payouts are integer multiples of stake, so unlike crash there is **no
whole-Shell floor caveat**: the Shell RTP equals the published RTP,
exactly, always. The pocket is drawn uniformly — exactly 1/37 per
pocket, by deterministic rejection over the 48-bit HMAC grid (a naked
`mod 37` would carry modulo bias) — from
`HMAC-SHA256(secret, 'roulette:' + round_index)`, recomputable for
audit. Timings are game feel (`01-game/game-modes.md`); shipping copy
`01-game/data/games.json`.

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

Reference Pearl income: **~4,150/week committed, ~1,560/week casual**
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
| Basic crates/week | ~52 | ~20 |
| First Legendary (median / p90) | 1.3 / 3.8 wk | 3.5 / 10.0 wk |
| Pity fires | ~13% of chases | ~14% |
| Legendaries/year | ~31 | ~12 |
| Set completion (median / p90) | 3 / 9 wk | 7 / 22 wk |
| Busts/week (typical stake sizing) | 0 | 0 |
| Shell destruction ratio | ~0.93 | ~0.92 |

## The tensions to watch

**Destruction sits at ~0.93 for both profiles** — above the 0.90 floor
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

**Catalogue expansion is an economy input** (`decisions/0011`): ~31
Legendaries/year for committed players means the Legendary pool must grow
by roughly one item per month or the top of the catalogue runs dry.

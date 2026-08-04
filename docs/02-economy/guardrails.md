---
status: agreed — simulated, not playtested
purpose: The rules and metrics that stop the economy inflating.
depends-on: currency-model.md, ../decisions/0005-wagering-earns-the-cosmetic-currency.md, ../decisions/0011-accountwide-pity-catalogue-expansion.md
---

# Anti-Inflation Guardrails

## Non-negotiable rules

**1. The Shell economy has three faucets and one sink.** Tasks pay
Shells in, plus the **capped lottery house match** (`decisions/0014`)
and **capped visitor tips** (`decisions/0016`) — both promotional
faucets bounded by per-player caps to roughly one daily task's worth
each. The house edge takes Shells out. No cosmetic,
collection state, or owned thing ever generates recurring Shells —
completion rewards are one-time (`decisions/0005`) — and nothing but
wagering consumes them. This keeps the identity the whole model rests
on: lifetime handle ≈ (task income + subsidy) ÷ edge.

**2. Pearls come only from wagering and leave only through cosmetics.**
No task pays Pearls; no mechanism converts Pearls to Shells. The
marketplace trades in Pearls with a burn on every sale.

**3. The catalogue must grow at least as fast as the top-tier chase
completes** (`decisions/0011`). Without seasons (`decisions/0008`),
content cadence *is* the sink-capacity mechanism: the moment the fastest
players own every Legendary, rule 1's sink keeps draining but desire
stops. Cadence figure in `currency-model.md`.

**4. Retired or vaulted items return.** When rotation eventually retires
anything, it comes back at a premium later. Permanent exclusion generates
more resentment than prestige.

## Metrics to instrument from day one

| Metric | Target |
|---|---|
| Shell destruction ratio (edge × handle ÷ task faucet, weekly) | ≥ 0.90 |
| Median Shell balance | Flat or gently rising — never compounding |
| Median Pearl balance | Flat — a climbing balance means crate prices are too low |
| Basic crates opened/week | ~53 committed · ~19 casual |
| Bust rate, typical stake sizing | ~0 — busting should be self-inflicted |
| Share of players with "nothing left to chase" | < 5% |
| Legendary pool size ÷ fastest player's Legendary count | > 1 at all times |

If the destruction ratio drifts below 0.85 sustained, the lever is the
game-mix share of races (the fat-edge game) — via scheduling and
promotion, not payout cuts. **Fix the faucet or the mix, never visible
prices.** A quietly retuned challenge payout is invisible; a price rise
reads as betrayal.

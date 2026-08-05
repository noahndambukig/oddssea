---
status: agreed
purpose: The scripts behind every economy number, so figures can be re-derived rather than argued about.
---

# Simulations

Any figure in `../currency-model.md` that came from a simulation is
reproducible here. If you change a price, a rate, or an edge, re-run these
before updating the doc:

```bash
python docs/02-economy/simulations/bankroll.py     # run first — the others chain off it
python docs/02-economy/simulations/crate-game.py
```

| Script | Answers |
|---|---|
| `bankroll.py` | Shell bankroll trajectories per profile × betting archetype: busts, handle, Pearl income, crates/week |
| `crate-game.py` | First-Legendary timing, pity fire rate, Legendaries/year, six-piece set completion under the 0009/0010 rules |
| `set-completion.py` | **Historical** — pre-revamp coin economy; kept as the record of what the old design measured |
| `crate-rates.py` | **Historical** — pre-retune drop tables |

**Every script carries a fixed `SEED`, and reproducibility is the point.**
Unseeded, re-running `bankroll.py` moved committed crates/week by ±4% —
larger than most real changes — so "re-run before changing a number" could
not distinguish a change from noise, and nothing in the table below could
be checked by anyone. Change a seed only for a deliberate sensitivity run,
and never leave the changed value committed.

**`bankroll.py` runs first.** `crate-game.py` takes its crates/week and
Pearl income as declared constants; they are copied from bankroll's
typical-bettor row rather than derived independently, so a faucet change
propagates only if you re-run in that order.

## Results of record (wager economy, decisions 0005–0011)

Re-derived 2026-08-05 under the fixed seed, after Pass 3 found the
committed faucet was 3,400 Shells/week (the task table) rather than the
~3,550 the model claimed — `decisions/0019`.

| Figure | Committed | Casual | Source |
|---|---|---|---|
| Basic crates opened/week (typical bettor) | 52 | 20 | bankroll.py |
| Handle/week (Shells) | ~72,400 | ~27,300 | bankroll.py |
| Pearl income/week | ~4,150 | ~1,560 | bankroll.py |
| Busts/week, typical stake sizing | 0 | 0 | bankroll.py |
| Shell destruction ratio (all three faucets) | ~0.93 | ~0.92 | bankroll.py |
| First Legendary, median / p90 (weeks) | 1.3 / 3.8 | 3.5 / 10.0 | crate-game.py |
| 200-pity fire rate | ~13% | ~14% | crate-game.py |
| Legendaries/year | ~31 | ~12 | crate-game.py |
| Set completion, median / p90 (weeks) | 3 / 9 | 7 / 22 | crate-game.py |

The correction moved every committed figure down by ~2–3% and left the
casual ones unchanged, which is what a 4% faucet correction on one profile
should do. No design conclusion changes: destruction still lands near 1.0,
busts stay at zero under typical sizing, and set completion holds its
3-week committed median.

Behavioral assumptions (bets/day, stake fractions, game mix) are declared
constants at the top of `bankroll.py` — they are guesses until playtests
correct them, and every figure above inherits that caveat.

---
status: agreed
purpose: The scripts behind every economy number, so figures can be re-derived rather than argued about.
---

# Simulations

Any figure in `../currency-model.md` that came from a simulation is
reproducible here. If you change a price, a rate, or an edge, re-run these
before updating the doc.

| Script | Answers |
|---|---|
| `bankroll.py` | Shell bankroll trajectories per profile × betting archetype: busts, handle, Pearl income, crates/week |
| `crate-game.py` | First-Legendary timing, pity fire rate, Legendaries/year, six-piece set completion under the 0009/0010 rules |
| `set-completion.py` | **Historical** — pre-revamp coin economy; kept as the record of what the old design measured |
| `crate-rates.py` | **Historical** — pre-retune drop tables |

## Results of record (wager economy, decisions 0005–0011)

| Figure | Committed | Casual | Source |
|---|---|---|---|
| Basic crates opened/week (typical bettor) | 53 | 19 | bankroll.py |
| Handle/week (Shells) | ~74,000 | ~27,000 | bankroll.py |
| Pearl income/week | ~4,200 | ~1,550 | bankroll.py |
| Busts/week, typical stake sizing | 0 | 0 | bankroll.py |
| Shell destruction ratio (all three faucets) | ~0.92 | ~0.91 | bankroll.py |
| First Legendary, median / p90 (weeks) | 1.3 / 3.8 | 3.7 / 10.5 | crate-game.py |
| 200-pity fire rate | ~14% | ~14% | crate-game.py |
| Legendaries/year | ~32 | ~11 | crate-game.py |
| Set completion, median / p90 (weeks) | 3 / 8 | 8 / 22 | crate-game.py |

Behavioral assumptions (bets/day, stake fractions, game mix) are declared
constants at the top of `bankroll.py` — they are guesses until playtests
correct them, and every figure above inherits that caveat.

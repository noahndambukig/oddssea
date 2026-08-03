---
status: draft — needs revision for the wager economy
purpose: The rules and metrics that stop the economy inflating.
depends-on: ../decisions/0005-wagering-earns-the-cosmetic-currency.md
---

# Anti-Inflation Guardrails

> **Needs revision for `decisions/0005`.** The principles survive, but rule 1
> and the metrics reference dust and the coin economy. Their revamp
> equivalents: house edge is the Shell sink, so the destruction ratio becomes
> edge × handle ÷ task faucet; the collection-rewards rule becomes "set
> completion pays one-time, never per-day."

## Non-negotiable rules

**1. No cosmetic ever generates coins.** Every productive reward in this system is paid in dust. This single rule eliminates the runaway-inflation failure mode entirely.

**2. Sink capacity must exceed the median player's lifetime earnings by at least 3×**, permanently. This is what seasonal content rotation is *for*.

**3. Retire sets into a vault, not oblivion.** Old sets rotate back periodically at a higher price. Original-season owners keep the status via a permanent season badge on the dex entry and an exclusive seasonal variant, so early adopters lose nothing — while a player who joined late is never permanently locked out of a set they love. Permanent exclusion generates far more resentment than it generates prestige.

## Metrics to instrument from day one

| Metric | Target |
|---|---|
| Coins destroyed ÷ coins created (daily) | ≥ 0.95 |
| Median player coin balance | Flat or gently rising — never compounding |
| Share of players with "nothing left to buy" | < 5% |
| Days to complete an active set | ~22 committed · ~47 casual |
| Set cost as share of season earnings | ~39% committed · ~84% casual |
| Median dust balance | Flat — a climbing balance means the 300/day cap is too loose |

If the destruction ratio drops below 0.9 for a sustained period, prices are too low or faucets too generous. **Fix the faucet, not the prices** — visible price rises read as a betrayal, while a quietly retuned challenge payout does not.

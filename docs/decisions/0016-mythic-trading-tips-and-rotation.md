---
date: 2026-08-04
status: accepted
---

# 0016 — Mythics are tradeable; tips pay capped Shells; the rotation features one family and one set

**Decision:** The three remaining open questions, closed together.

**Mythics are tradeable on the marketplace.** A one-of-one can change
hands for Pearls; provenance grows into the ordered owner list
`03-cosmetics/rarity-tiers.md` always described, and each sale is
genuine news. **This is taken against the compliance lean**
(`06-risks/compliance.md` recommends untradeable, because a tradeable
one-of-one is the strongest off-platform real-money-trading magnet the
game can create) and against the recommendation offered at decision
time. The drama is judged worth the risk, and the risk is bounded by
mitigations rather than avoided:

- Mythic sales are **announced site-wide** — a public, permanent record
  makes laundered ownership visible rather than quiet.
- **Provenance is immutable and displayed forever**, including every
  price paid in Pearls.
- Marketplace burn applies as normal; Mythic listings carry a longer
  cooling-off window before the item can be re-listed.
- **Account trading remains prohibited in the ToS**, and Mythic
  transfers are the highest-signal thing to monitor for off-platform
  RMT patterns. If evidence of cash trading appears, the response is to
  suspend Mythic listings — a lever that must exist in the code from
  the start.

**Visitor tips pay capped Shells.** Social approval feeds bankroll,
bankroll feeds wagering, wagering feeds Pearls — the tip enters the
loop at the top rather than skipping it, so Pearls stay
wager-exclusive (`decisions/0005`). The per-player daily cap on tips
*received* is what stops reciprocal tip-farming rings; it makes tipping
the Shell economy's **third faucet**, alongside tasks and the lottery
match.

**The weekly rotation features one family plus one spotlight set.** Each
week one gear or skin family becomes directly purchasable at the 1.5×
price (`decisions/0009`), and one set's Set Crate is discounted ~20%.
Featuring by *family* — rather than by assorted items — teaches the
catalogue's structure, is legible in one sentence of UI copy, and gives
catalogue expansion (`decisions/0011`) a natural release beat: a new
family ships as a rotation week.

**Consequence:** Tips add a ledger kind, a social row and a third
faucet term to the bankroll simulation before their cap locks. Mythic
tradeability makes the marketplace's provenance and announcement
machinery a launch-blocking requirement for Mythics rather than a
nicety, and requires a listing-suspension switch. Roadmap questions 3,
7 and 8 are closed; only the deliberately-parked post-v1 seasons
question (Q4) remains.

---
status: superseded
purpose: The closed secondary currency — salvage, targeted purchase, stipends.
superseded-by: ../decisions/0005-wagering-earns-the-cosmetic-currency.md
---

# Dust

> **Superseded — dust is removed** (`decisions/0005`). Its jobs moved to
> the wager economy: salvage pays Pearls (ratios now in
> `currency-model.md`), set completion pays a one-time Shell bonus, and
> what visitor tips pay remains open — see `00-project/roadmap.md`. This
> file is retained as the historical record of the design; nothing in it
> is current.

Dust is a **cosmetic-only currency that can never be converted to coins.** This is the most important piece of economic engineering in the design: it lets us reward players generously for collection depth without ever adding pressure to the main economy. See `decisions/0004`.

## Salvage duplicates into dust

| Tier | Dust from salvage | Dust to buy that tier |
|---|---|---|
| Common | 8 | 40 |
| Rare | 25 | 125 |
| Epic | 100 | 500 |
| Legendary | 400 | 2,000 |

A clean **5:1 ratio** — five duplicates of a tier buy one item of your choice at that tier. Deliberately lossy, so salvage feels like progress without undermining crates, and targeted purchase remains a real reward for volume.

Legendaries and above should require an explicit confirmation before salvage, with a second confirmation for anything the player has ever equipped.

## Other dust sources

| Source | Amount |
|---|---|
| Set bonus at 3/6 | 25/day claim |
| Set bonus at 5/6 | 50/day claim |
| Set bonus at 6/6 | 100/day claim |
| Visitor tips | Variable, capped per visitor per day |

## The cap that matters

**Total daily set stipend is capped at 300 dust/day across all sets.**

Without this, a player with ten completed sets prints 1,000/day and the reward compounds out of control — the same failure mode as coin-generating cosmetics, just one currency removed. Dust being closed-loop makes it safe for the *coin* economy; the cap is what makes it safe for the *crate* economy.

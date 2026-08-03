---
status: agreed
purpose: Crate types, drop tables, pity rules and new-player guarantees.
note: Prices live in 02-economy/currency-model.md, not here.
---

# Crates

Two everyday crates plus a rotating event crate. Keeping gear and skins on separate crates doubles the number of "open a thing" moments and lets you price and pace the two axes independently.

## Gear Crate — 1 garment

| Tier | Rate |
|---|---|
| Common | 58% |
| Rare | 27% |
| Epic | 11% |
| Legendary | 4% |

## Skin Crate — 1 skin

| Tier | Rate |
|---|---|
| Common | 56% |
| Rare | 28% |
| Epic | 13% |
| Legendary | 3% |

Skins are priced above gear and drop Legendaries slightly less often, because the animated Legendary skin is the aspirational object in this system.

## Set Crate — 1 piece from the active seasonal set

| Tier | Rate |
|---|---|
| Common | 40% |
| Rare | 34% |
| Epic | 20% |
| Legendary | 6% |

Only ever contains pieces from the currently active set, so it is a targeted purchase rather than a lottery.

**The first four pulls from a given set are guaranteed to be distinct pieces.** Without this, duplicate luck dominates: plain random pulls need ~14.7 crates to complete a six-piece set and the tail is brutal. The distinct guarantee plus duplicate salvage brings it to ~10.4, which is what makes the timings in `02-economy/currency-model.md` work. Getting the same piece three times in your first three pulls is the fastest way to make a player abandon a set.

## Pity timers

Tracked **separately per crate type**, and disclosed to the player in the UI.

- **Guaranteed Epic or better** if 10 consecutive opens produce none
- **Guaranteed Legendary** if 50 consecutive opens produce none

With a 4% base rate and 50-open hard pity, the *effective* Legendary rate is 4.6% and the worst case is bounded — which matters far more for retention than the average does. Verified in `02-economy/simulations/`.

## First-session guarantee

A player's first three opens must produce **at least one garment and one skin that can be worn together**. Opening three skins with no gear to put them on is a miserable introduction, and it is the most common self-inflicted wound in slot-based cosmetics.

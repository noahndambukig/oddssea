---
status: agreed — simulated, not playtested
purpose: Crate types, drop tables, pity rules and new-player guarantees.
note: Prices live in 02-economy/currency-model.md, not here.
depends-on: ../decisions/0009-pearl-to-item-pipeline.md, ../decisions/0010-crate-volume-and-premium-tier.md, ../decisions/0011-accountwide-pity-catalogue-expansion.md
---

# Crates

Gear and Skin crates each come in **basic and premium** quality tiers
(`decisions/0010`), plus the set-targeted Set Crate. Keeping gear and
skins on separate crates doubles the number of "open a thing" moments and
lets the two axes be priced and paced independently. Crate opening is
high-volume by design — a dedicated player opens ~50 basic crates a week
— so opening is a quick, repeatable moment, not a ceremony, and **bulk
salvage** is a required UI feature.

## Basic crates — 1 garment (Gear) or 1 skin (Skin)

| Tier | Rate |
|---|---|
| Common | 67% |
| Rare | 25% |
| Epic | 7% |
| Legendary | 1% |

The everyday open. Skins are priced above gear (see
`02-economy/currency-model.md`) because the animated Legendary skin is
the aspirational object in this system.

## Premium crates — boosted odds, higher price

| Tier | Rate |
|---|---|
| Common | 35% |
| Rare | 40% |
| Epic | 20% |
| Legendary | 5% |

Premium is the concentration play: fewer opens per Pearl, better opens.
Priced so premium is only modestly more Legendary-efficient than basic —
a real choice between volume (breadth, salvage fodder, dex progress) and
chase quality, not a strictly dominant option.

## Set Crate — 1 piece from a target set

| Tier | Rate |
|---|---|
| Common | 40% |
| Rare | 34% |
| Epic | 24% |
| Legendary (keystone) | 2% |

Only ever contains pieces from one target set. Targeting is **hybrid**
(`decisions/0009`): the player chooses any set at standard price, and the
weekly rotation features one set with a discount or bonus odds. Rotation
details are `00-project/roadmap.md`, question 3.

**The first four pulls from a given set are guaranteed to be distinct
pieces.** Without this, duplicate luck dominates the early chase, and
getting the same piece three times in your first three pulls is the
fastest way to make a player abandon a set.

## Pity — disclosed in the UI, always

- **Basic Legendary pity is account-wide across all basic crate opens**
  (`decisions/0011`): a Legendary is guaranteed within 200 basic opens,
  Gear and Skin combined, counter resetting on any basic Legendary.
  At the 1% rate this fires for ~13% of chases — a felt mechanism, not a
  sticker.
- **Premium pity:** Legendary within 40 premium opens, account-wide
  across premium crates.
- **Set-chase pity:** the keystone is guaranteed within 100 Set Crates
  opened against the same target set.
- **Epic-or-better pity:** 10 consecutive basic opens without an Epic+
  force one on the next open.

Every counter is visible to the player. Disclosed odds plus visible pity
counters turn a black box into a system players can reason about, and
reasoning about it is most of the fun.

## First-session guarantee

A player's first three opens must produce **at least one garment and one
skin that can be worn together**. Opening three skins with no gear to put
them on is a miserable introduction, and it is the most common
self-inflicted wound in slot-based cosmetics.

## Verified outcomes

Simulated in `02-economy/simulations/crate-game.py`; results of record in
`02-economy/simulations/README.md`. Headlines: first Legendary at median
1.3 weeks (dedicated) / 3.2 weeks (casual), set completion median 3 / 7
weeks, ~31 / ~12 Legendaries per year — which is why catalogue expansion
is an economy guardrail (`decisions/0011`).

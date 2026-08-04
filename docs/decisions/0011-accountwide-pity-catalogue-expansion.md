---
date: 2026-08-03
status: accepted
---

# 0011 — Account-wide basic pity; the catalogue grows instead of the odds shrinking

**Decision:** Two closures from the combinatorial-rarity discussion:

1. **The 200-crate Legendary pity counts all basic crate opens
   account-wide** — Gear and Skin crates share one counter. This replaces
   the per-crate-type pity tracking in the pre-revamp crates spec (for
   basic crates only; premium and the set-chase keystone pity keep their
   own counters). It matches the rule as Noah originally stated it
   ("guaranteed a legendary every 200 crates opened"), protects the
   worst-case tail for players who split their opens, and is simpler to
   disclose.
2. **The Legendary flow (~31/year dedicated) is sustained by catalogue
   expansion, not by tightening odds.** When the launch pool of 12
   Legendary items (6 garments + 6 cosmic-skin pieces) thins, new items
   are added — roughly a new Legendary a month keeps the chase ahead of
   the fastest players. This is what covers the guardrails sink-capacity
   rule in the absence of seasons (`decisions/0008`).

Also confirmed in the same discussion: **combination rarity stays a
display-layer property.** The economy transacts strictly per axis (crates
sell garments or skins, never combinations); double-Legendary looks are
assembled by players, which is why the combinatorial value adds no
complexity to the currency model or its simulations.

**Why:** A per-type pity quietly doubles worst-case bad luck for anyone
splitting opens across both crate types — the opposite of what a disclosed
guarantee is for. And expanding the catalogue rather than rarifying the
odds keeps the honeymoon and pity math stable forever: the chase stays
fresh because there is more to chase, not because chasing got slower.

**Consequence:** `03-cosmetics/crates.md`'s pity section changes with the
numbers rewrite. Content cadence becomes an economy guardrail: the
catalogue must grow at least as fast as the top-tier chase completes.

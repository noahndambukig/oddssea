---
status: agreed
purpose: The two-axis structure everything else in this system hangs off.
depends-on: decisions/0001, decisions/0002, decisions/0003
---

# Core Model: Gear × Skin

Two independent axes. This is the single most important structural decision in the design, because it means content scales multiplicatively while art cost scales additively.

| Axis | What it is | Tiered? | Example |
|---|---|---|---|
| **Gear** | The garment itself — its silhouette and shape | Yes, 5 tiers | Roll-top backpack |
| **Skin** | A palette + pattern + material applied to gear | Yes, 5 tiers | "Void Weave" |

There is no third axis. Dyes were considered and rejected — see `decisions/0003-no-dye-axis.md`.

## Skins are scoped to a slot, not a garment

The Void Weave headgear skin applies to *any* headgear the player owns. This is what keeps the system affordable: a new garment inherits the entire existing skin library the day it ships.

Garment-specific skins are reserved for Legendary and above, where exclusivity is the point.

## Every garment has a no-skin base

A garment must look finished with no skin applied. The base is a
deliberately plain flat treatment baked into the garment asset — Common
grade at most — so a player who owns zero skins still has a coherent
outfit, and any skin applied always reads as an upgrade. The base is not
a skin: it occupies no inventory slot, cannot be salvaged, and is what a
garment reverts to when its skin is removed.

## What this produces

At the launch roster of 11 gear and 11 skins per slot:

| | Count |
|---|---|
| Garments | 66 |
| Skin families | 11 (× 6 slots = 66 skin definitions) |
| Distinct looks per slot | 121 |
| Total slot-looks | 726 |
| Outfit permutations | ~3.1 trillion |
| Hand-authored asset files | ~157 |

Every garment added later produces 11 new looks instantly. Every skin family added produces 66.

## Rarity is combinatorial for free

A Legendary skin on a Legendary garment is rarer than either alone, and that emerges from the two axes without authoring anything new. Surface it in the UI — see `flex-layer.md`.

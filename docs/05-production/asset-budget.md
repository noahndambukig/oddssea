---
status: agreed
purpose: What the launch catalogue costs to build.
depends-on: ../decisions/0013-gear-families.md, ../03-cosmetics/core-model.md, ../01-game/racers.md
---

# Asset Budget

Counted against the chosen rosters: **11 gear families × 6 slots** and
**11 skin families × 6 slot definitions** (`decisions/0013`), plus the
three launch-set keystones and the racer cast. Content of record lives in
`03-cosmetics/content/data/*.json`.

## Cosmetics

| Item | Count | Note |
|---|---|---|
| Garments (11 families × 6 slots) | 66 | |
| Garment asset files (grayscale base + mask each) | 132 | The real art |
| No-skin base palettes | 11 | **One per family, not per garment** — a family shares its unskinned look |
| Skin definitions (11 families × 6 slots) | 66 | Data records: palette + pattern ref + shader params |
| Shared pattern textures | ~8 | Chrome, wood grain, denim weave, water, florals, starfield |
| Master animated material | 1 | One shader, parameter rows per effect |
| Animated effect rows | 6 | Tidepool, Bloomcycle, Void Weave + 3 set keystones |
| Set keystone variants | 3 | Legendary-grade shirt treatments |
| **Hand-authored cosmetic assets** | **~160** | |

## Racers — a second art track

The sea races need a cast of 14 (`01-game/racers.md`), and no earlier
version of this budget counted them. They are not garments: each needs an
idle and a racing state, authored to the race view rather than the avatar
grid.

| Item | Count |
|---|---|
| Racers | 14 |
| Racer sprite sets (idle + racing) | 28 |
| Race backdrop / lane furniture | 1 set |

## What the cosmetics produce

| | |
|---|---|
| Distinct looks per slot | 121 |
| Total slot-looks | 726 |
| Outfit permutations | ~3.1 trillion |
| Dex entries | 132 |

## Time

| Track | Estimate |
|---|---|
| Garments, 66 at 2–4h | 130–260h |
| Skin definitions, mostly data | ~20h |
| Set keystones | ~12h |
| Racers, 14 at 4–6h | 55–85h |
| **Total** | **~220–380h** |

The family structure pulls the garment estimate toward its lower bound:
six pieces of one theme authored in one sitting share references, palette
decisions and context, which is materially faster than 66 unrelated
items. Racers are the line item to watch — they are a third of the work
and were invisible until now.

## The lever if that's too much

**Cut families, not slots.** Dropping one Common gear family removes six
garments and twelve asset files cleanly, with no hole in any slot and no
effect on the set system. Going from 5 Common families to 3 saves ~25% of
the garment work and gives you two ready-made content drops.

Do **not** cut a slot: six slots is what makes sets work, and the layer
order assumes all six.

**Racers scale the same way** — launch with 10 and add four later; the
field is 6–8 per race, so 10 is sufficient for variety on day one.

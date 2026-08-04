---
status: agreed
purpose: How art gets made, and the decisions that must be locked before any is.
depends-on: ../03-cosmetics/core-model.md, ../03-cosmetics/animation-ladder.md, ../decisions/0013-gear-families.md
---

# Art Pipeline

## The technique that makes this affordable

**Author every garment once as a grayscale base plus a mask channel.** A
skin then becomes a small data record — a palette, an optional pattern
texture reference, and shader parameters — rather than a new drawing.

Recolouring becomes a data change instead of an art task. This is the
difference between 20 skins and 200 skins on the same budget, and it is
very hard to retrofit. **Build it before the first garment ships.**

The mask channel does double duty: it decides where a skin's pattern
appears, and where animation is allowed to play. Authoring it well is
what separates a Legendary that looks designed from one that looks like a
texture smeared over a shape.

## Produce by family, not by slot

Gear ships as families of six (`decisions/0013`), and that is also the
right unit of work: author Basics' six pieces in one sitting, not six
headgear items across six themes. One theme in your head at a time means
shared references, one palette decision, and no context switching — the
main reason the garment estimate in `asset-budget.md` sits toward its
lower bound.

It is also the right unit of *review*: a family is only finished when its
six pieces read as one outfit worn together.

## Every garment needs its no-skin base

A garment must look finished with nothing applied
(`../03-cosmetics/core-model.md`). In this pipeline that is not extra
drawing — it is a **default palette per family**, Common-grade, applied
to the same grayscale base. Eleven records, not sixty-six.

Check it: a full unskinned family should look like a deliberate outfit,
not a placeholder. If it looks grey and unfinished, the base palette is
wrong, not the garment.

## Lock these before producing any art

**One canonical pose.** Every garment is drawn to a single front-facing
stance. Add a turnaround or idle animation later, once, applied to all
garments simultaneously.

**One body silhouette at launch.** Every additional body type multiplies
the *entire* garment library by that count. If you want more body options
later — and you probably should — plan it as a deliberately costed
expansion, never a quiet addition.

**A fixed registration grid.** Every garment layer is authored on the
same canvas with the same anchor points, so layers composite without
per-item offsets.

**Chibi-ish proportions.** Larger heads and simplified limbs read better
at small sizes and need less detail per garment. Silhouette clarity at
64px is the target.

**Hide flags authored with the garment**, never patched later
(`../03-cosmetics/slots.md`). The known launch conflict is Cosmic's hover
skirt hiding the anti-grav boots — both in the same family, so a
full-Cosmic player meets it immediately.

## The 64px test

Every garment gets reviewed at 64 pixels before it is accepted. If you
cannot tell it apart from another item in its slot at that size, it is
not finished. This single check prevents the most common failure in
cosmetic catalogues: forty items that all look the same in the one
context where players actually see them.

Legendaries have a stricter version: **the silhouette must differ**, not
just the detail (`../03-cosmetics/rarity-tiers.md`).

## Animated skins ship with a static twin

Every animated skin needs a **pre-rendered static thumbnail** for lists,
the dex grid and the marketplace — grids must never animate
(`../03-cosmetics/animation-ladder.md`). Treat the thumbnail as part of
the asset, not a later optimisation, or the dex ships janky.

Test **full Void Weave across all six slots early**. Six overlapping
star-holes is a very different image from one, and it is the launch
catalogue's most important asset.

## Racers are a separate track

The 14 racers (`../01-game/racers.md`) are not garments: no mask channel,
no skin system, authored to the race view. Each needs an idle and a
racing state. Their legibility test is different too — a player must
identify their pick mid-race from the field, so **silhouette and colour
must separate at a glance across the 6–8 racers in a field**, not just
against the backdrop.

## What to build from

`03-cosmetics/content/data/*.json` is the content of record
(`decisions/0015`) — gear, skins, sets, racers, all versioned. Work from
the JSON, not from the prose rosters, and treat a mismatch as a bug in
whichever was updated last.

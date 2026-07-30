---
status: draft
purpose: How art gets made, and the decisions that must be locked before any is.
---

# Art Pipeline

## The technique that makes this affordable

**Author every garment once as a grayscale base plus a mask channel.** A skin then becomes a small data record — a palette, an optional pattern texture reference, and shader parameters — rather than a new drawing.

Recolouring becomes a data change instead of an art task. This is the difference between 20 skins and 200 skins on the same budget, and it is very hard to retrofit. **Build it before the first garment ships.**

The mask channel does double duty: it decides where a skin's pattern appears, and where animation is allowed to play. Authoring it well is what separates a Legendary that looks designed from one that looks like a texture smeared over a shape.

## Lock these before producing any art

**One canonical pose.** Every garment is drawn to a single front-facing stance. Add a turnaround or idle animation later, once, applied to all garments simultaneously.

**One body silhouette at launch.** Every additional body type multiplies the *entire* garment library by that count. If you want more body options later — and you probably should — plan it as a deliberately costed expansion, never a quiet addition.

**A fixed registration grid.** Every garment layer is authored on the same canvas with the same anchor points, so layers composite without per-item offsets.

**Chibi-ish proportions.** Larger heads and simplified limbs read better at small sizes and need less detail per garment. Silhouette clarity at 64px is the target — check every garment at that size before approving it.

## The 64px test

Every garment gets reviewed at 64 pixels before it is accepted. If you cannot tell it apart from another item in its slot at that size, it is not finished. This single check prevents the most common failure in cosmetic catalogues: forty items that all look the same in the one context where players actually see them.

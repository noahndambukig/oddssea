---
status: agreed
purpose: The six equipment slots, their layer order, and clipping suppression.
---

# Slots

| # | Slot | Character | Notes |
|---|---|---|---|
| 1 | **Headgear** | Highest attention | Most silhouette impact per pixel. Spend your best ideas here. |
| 2 | **Shirt** | Largest canvas | Best surface for animated skins. Favour big uninterrupted panels. |
| 3 | **Pants** | Low attention | Compensated with exclusive cuff particle FX. |
| 4 | **Shoes** | Low attention | Compensated with exclusive trail and footprint FX. |
| 5 | **Backpack** | Rear mass | Splits across two layers (rear + straps). |
| 6 | **Held item** | Expressive | Replaces the "weapon" slot from early drafts. Comedy lives here, and comedy drives sharing. |

The launch roster is in `content/gear-roster.md`; the shipping copy is
`content/data/gear.json`.

## Slot attention is not equal — plan for it

In every game that has shipped a slot-based cosmetic system, headgear and the held item absorb most of the desire while pants and shoes get ignored.

**Gear families changed the available mitigations** (`decisions/0013`).
A family has exactly one garment per slot, so the old advice — ship fewer
of the quiet slots, price them lower — is no longer possible: slot counts
are necessarily equal, and crates sell by axis rather than by slot. Two
mitigations remain, and both now carry more weight:

- **Give the quiet slots exclusive FX types.** Shoes get trails and footprints; pants get cuff particles. Things headgear *cannot* have, so there is a reason to care.
- **Spend the design attention unequally even though the counts are equal.** Every family gets six pieces regardless; make the pants and shoes the ones that earn their place within the theme rather than filler drawn to complete a set.

## Layer order (back to front)

```
0  Set aura / FX — rear
1  Backpack — rear portion
2  Body base
3  Pants
4  Shoes
5  Shirt (overlaps pant waist)
6  Backpack — straps
7  Held item
8  Headgear (over hair)
9  Set aura / FX — front (additive blend)
```

## Hide flags

Every garment carries suppression flags as data, not special-case code. Without these you will be fixing clipping bugs forever.

`hidesHair` · `hidesPantCuff` · `hidesShirtSleeve` · `hidesBackpackStraps` · `hidesShoeTop` · `hidesLegs`

A long coat sets `hidesPantCuff` and `hidesShirtSleeve`. A full helmet sets `hidesHair`. A hover skirt sets `hidesLegs`, which makes shoes invisible beneath it — an intentional trade-off the player should be told about in the preview, not discover after buying.

## Known conflicts to resolve at selection time

Some gear combinations are physically contradictory. Resolve them with hide flags and preview warnings before art starts, not in QA:

- Anything that lifts the avatar off the ground (anti-grav boots, balloon cluster) conflicts with anything else that does
- Rear-layer items (wing rig, jetpack, orbital pack) compete for the same space
- Leg-hiding bottoms make the shoes slot inert

At launch exactly one conflict is live: Cosmic's **hover skirt hides the
anti-grav boots**, recorded as a hide-flag in `content/data/gear.json`.
Both are in the same family, so full-Cosmic players hit it immediately —
the preview must say so.

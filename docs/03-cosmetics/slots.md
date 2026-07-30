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

Candidate items for each slot are in `03-cosmetics/content/gear-candidates.md`.

## Slot attention is not equal — plan for it

In every game that has shipped a slot-based cosmetic system, headgear and the held item absorb most of the desire while pants and shoes get ignored. Two mitigations, use both:

- **Give the quiet slots exclusive FX types.** Shoes get trails and footprints; pants get cuff particles. Things headgear *cannot* have, so there is a reason to care.
- **Ship fewer of them and price them lower.** Do not spend equal art budget across slots that do not earn equal attention.

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

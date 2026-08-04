---
status: agreed
purpose: The chosen launch gear roster — 11 families, one garment per slot each.
depends-on: ../slots.md, ../rarity-tiers.md, ../../decisions/0013-gear-families.md
---

# Gear Roster

11 families × 6 slots = 66 garments. A family's tier applies to every
garment in it. Families are thematic only — no bonuses, no completion
rewards (`decisions/0013`). Names below are working descriptions; the
formal naming pass follows `naming-conventions.md`.

## Common

| Family | Headgear | Shirt | Pants | Shoes | Backpack | Held |
|---|---|---|---|---|---|---|
| **Basics** | Forward cap | Tee | Jeans | Runners | Daypack | Umbrella |
| **Athletics** | Visor | Tank | Joggers | Trail shoes | Sling bag | Water bottle |
| **Skater** | Backwards snapback | Oversized tee | Baggy cargo shorts | Canvas low-tops | Drawstring sack | Skateboard (carried) |
| **Picnic** | Wide sun hat | Camp-collar shirt | Shorts | Sandals | Basket bag | Thermos |
| **Cozy** | Soft beanie | Long-sleeve | Pyjama pants | Slip-ons | Tote | Coffee cup |

## Rare

| Family | Headgear | Shirt | Pants | Shoes | Backpack | Held |
|---|---|---|---|---|---|---|
| **Streetwear** | Over-ear headphones | Hoodie | Cargo pants | High-tops | Roll-top pack | Boombox |
| **Aviator** | Aviator goggles | Bomber jacket | Flight trousers | Lace-up boots | Hardshell case | Camera |
| **Winter** | Earmuffs | Puffer vest | Snow pants | Snow boots | Pack with bedroll | Snowball |

## Epic

| Family | Headgear | Shirt | Pants | Shoes | Backpack | Held |
|---|---|---|---|---|---|---|
| **Deep Sea** | Antique brass diving helmet | Ribbed dive suit | Canvas dive trousers, brass knee joints | Weighted brass boots | Aquarium tank pack | Glass float lantern |
| **Carnival** | Ringmaster top hat | Tailcoat | Striped trousers | Platform boots | Wind-up music box pack | Kite spool, kite flying above |

## Legendary — every piece breaks the silhouette

| Family | Headgear | Shirt | Pants | Shoes | Backpack | Held |
|---|---|---|---|---|---|---|
| **Cosmic** | Orbiting halo ring | Winged coat, drifting tails | Hover skirt | Anti-grav boots | Folded wing rig | Star-catching net |

Full Cosmic is the designed endgame outfit — the six pieces are one look,
not six competing maxima. It pairs with the cosmic Legendary skin family.

## Build notes

- **Hide-flag:** the hover skirt conceals the anti-grav boots; when both
  are equipped the boots' glow merges into the skirt's underglow.
- **Idle timers:** wing rig flexes open occasionally; halo rotates slowly.
- **Skin canvases:** the bomber, hoodie, tailcoat and dive suit carry the
  large flat panels animated skins need — checked because the racing
  jacket (the best canvas in the candidate pool) was not picked.
- **Commons are deliberately plain.** They are the base a good skin makes
  shine; resist the urge to add character to them.
- **Every garment ships with its no-skin base** — see `../core-model.md`.
  The 66 garments must each look finished unskinned.

Struck candidates remain in `gear-candidates.md` as the expansion backlog
(`decisions/0011`). **Shipping copy: `data/gear.json`** (content version
1.0.0) — the game reads the JSON, per `decisions/0015`.

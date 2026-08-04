---
status: superseded — now the backlog
purpose: Candidate skin families, for Noah to pick the launch roster from.
depends-on: 03-cosmetics/animation-ladder.md, 03-cosmetics/rarity-tiers.md
---

# Skin Candidates

> **Selection made** — the launch roster is in `skin-roster.md`. This file
> stays as the family backlog for catalogue expansion (`decisions/0011`).

**Target roster: 11 skin families** — 5 Common, 3 Rare, 2 Epic, 1 Legendary (cosmic).

A skin family exists once per slot, so 11 families produces 66 skin definitions. Because skins are slot-scoped rather than garment-scoped, every family automatically applies to all 11 garments in its slot — and to every garment you add later, for free.

**★ = my recommendation.**

## The constraint each tier is working under

| Tier | Treatment | Motion budget |
|---|---|---|
| **Common** | Flat fill, 1–2 colours, no gradient | None |
| **Rare** | Static material — gloss, metal, gradient, woven or printed texture | None |
| **Epic** | One subtle looping property, 2–4s cycle | Motion only, no particles |
| **Legendary** | Full animated material plus particles and an equip flourish | Everything |

Nothing below Epic moves. That line is what keeps your cheap tiers cheap and makes motion a reliable signal of value.

---

## Common — pick 5

Flat fills. Their job is to be a clean, pleasant default that never fights the garment's shape. Aim for a spread across the colour wheel so a player's first few pulls don't all look the same, and include at least one dark and one light so early outfits can be coordinated.

| Candidate | Description |
|---|---|
| ★ **Chalk** | Matte off-white with the faintest paper grain. Your light neutral. |
| ★ **Ink** | Flat near-black with a single sharp accent line. Your dark neutral. |
| ★ **Sandlot** | Warm tan and khaki. Reads as sun-bleached and lived-in. |
| ★ **Traffic** | High-vis orange with grey. The loud one — new players love a loud one. |
| ★ **Seafoam** | Pale mint and cream. Soft, calm, very wearable. |
| Bubblegum | Flat pink and white. |
| Slate | Cool grey duotone. Risks feeling like an unfinished asset. |
| Cherrywood | Deep red-brown with cream. |
| Blueprint | Flat navy with thin white line-work. Arguably too clever for Common. |
| Rust Belt | Muted orange-brown. |

---

## Rare — pick 3

Static material treatments. The player should be able to tell *what a thing is made of*. Pick three that are materially distinct from each other — one metal, one fabric, one printed pattern is a good spread.

| Candidate | Description |
|---|---|
| ★ **Chrome Dip** | Mirrored metal with a hard specular band. The classic, and it reads at any size. |
| ★ **Varsity** | Felt and leather two-tone with stitched trim. Warm, tactile, universally liked. |
| ★ **Hazard Tape** | Printed diagonal caution stripes under a gloss coat. Bold and graphic. |
| Copper Patina | Oxidised metal with green verdigris creeping from the seams. |
| Denim Raw | Woven indigo with contrast stitching. |
| Marbleworks | Polished stone veining. |
| Sunbleach | Vertical gradient, faded top to bottom, like a well-worn shirt. |
| Patent Cherry | High-gloss red lacquer. |
| Tiger Maple | Polished figured wood grain. |
| Camo Static | Disruptive printed pattern. |

---

## Epic — pick 2

One subtle looping property each. The test: it should be noticeable when you look at it, and *not* noticeable when you're trying to read the screen behind it. Pick two with different motion characters — one warm/organic and one cool/technical works well.

| Candidate | Description |
|---|---|
| ★ **Tidepool** | Slow blue-green gradient drift under a wet sheen. Calm, beautiful, and the motion is a single UV pan. |
| ★ **Circuit Trace** | A light pulse travelling along the garment's mask lines. Technical counterpart to Tidepool, and it makes your mask channel visibly do work. |
| Emberglow | Gentle warm pulse, like metal cooling and reheating. |
| Aurora Wash | Slow colour pan across a cold ramp. Risks overlapping with your cosmic Legendary. |
| Signal Drift | A soft scanline creeping down the panels. |
| Koi Current | Printed fish drifting slowly across the panels. Charming, slightly more art. |
| Bloomcycle | Printed flowers that slowly open and close. |
| Ghost Static | Faint flicker and dissolve at the garment's edges. |

---

## Legendary — pick 1 (cosmic)

This is the single most important asset in the launch catalogue. It is the thing screenshots get taken of, the thing that makes someone open a Skin Crate, and the visual shorthand for "top of the system." Worth over-investing in.

All five are cosmic. They differ in what kind of cosmic.

### ★ Void Weave — *my pick*

Pure black garment with stars visible *through* it, as though the clothing is a hole cut in reality. The starfield sits still while the avatar moves, so the effect is that the world is showing through — a genuine parallax illusion that costs one scrolling texture and a mask.

Why it wins: it is the cheapest of the five to build, the most striking at small sizes (a black silhouette full of stars reads at 32px), and it is the only one that makes the avatar look *less* solid rather than more decorated. Everything else on this list adds; this one subtracts, which is why it will stand out in a lobby full of busy Legendaries.

Particles: a few slow motes drifting out of the "hole." Equip flourish: the garment darkens to nothing, then stars fade in.

### Event Horizon

Light bending inward toward a dark core, with a bright accretion ring and gravitational lensing warping the panel edges. The most spectacular option and the most expensive — the lensing distortion is real shader work.

Particles: infalling motes spiralling toward the core.

### Nebula Bloom

Drifting violet and magenta gas clouds over a twinkling starfield, with two cloud layers moving at different speeds for parallax depth. The prettiest option and the most obviously "cosmic" at a glance.

Particles: slow sparkle. Risk: it is the most conventional choice, and it overlaps with Aurora Wash if you pick that as an Epic.

### Orrery

A working brass-and-glass solar system rendered across the garment, with tiny planets genuinely orbiting along fixed rings. Cosmic by way of clockwork rather than by way of space.

Why it's interesting: the motion is *mechanical and legible* rather than atmospheric, so it rewards close inspection in a way the others don't. Pairs perfectly with the Orrery staff held item. Most expensive to author because the orbits need hand-placed rings per garment.

### Supernova

Mostly a calm white-hot core — and then roughly every 30 seconds it **blooms**, flashing bright and settling back down.

Why it's interesting: it is the only option with an *event*. Other players will look over when it goes off, and rarity that periodically demands attention is a different and stronger kind of flex than rarity that sits there. The risk is that a bright flash every 30 seconds in a busy lobby is annoying — so it needs a per-avatar cooldown, a much dimmer version at distance, and it must respect reduce-motion.

---

## Notes on the shape of this roster

**Your Legendary is one family, not one item.** Whichever cosmic you pick exists across all six slots, so a player can wear a full cosmic outfit. Make sure the effect still reads when it's on all six pieces at once — test that early, because six overlapping animated materials is a very different image from one.

**Consider holding one Common slot back.** Shipping four Commons and adding the fifth two weeks after launch gives you a cheap, low-risk content beat to test your release pipeline with, before a season depends on it working.

**Watch the overlap between Epic and Legendary.** Aurora Wash and Nebula Bloom occupy nearly the same visual space. If you pick both, the Epic undercuts the Legendary — which is the most common way a rarity ladder gets visually flattened.

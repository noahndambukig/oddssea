---
status: agreed
purpose: How motion signals rarity, and how to build it cheaply and performantly.
---

# The Animation Ladder

Motion is the clearest possible rarity signal, because peripheral vision detects movement before it resolves detail.

| Tier | Treatment | Motion budget |
|---|---|---|
| **Common** | Flat fill, 1–2 colours, no gradient | None |
| **Rare** | Static material: gloss, metallic sheen, gradient, printed or woven texture | None |
| **Epic** | One subtle looping property, 2–4s cycle — slow gradient pan, gentle glow pulse, drifting pattern | Motion only, no particles |
| **Legendary** | Full animated material, plus a small particle emitter (≤12 particles) and an equip flourish | Motion + particles + emissive |
| **Mythic** | Legendary treatment plus a world-space element — a trail, footprints, ambient light cast on nearby surfaces — a custom nameplate, and an audio cue on equip | Unrestricted |

## The hard line is between Rare and Epic

Nothing below Epic moves. This keeps Common and Rare cheap to produce, keeps busy screens calm, and makes "it moves" a reliable signal that something valuable is on screen.

## One shader, many effects

Do not author animated skins as sprite sequences. Build **one master material with exposed parameters** and define each effect as a row of data.

| Parameter | Void Weave | Water | Nebula | Circuitry |
|---|---|---|---|---|
| Palette ramp | Black + starfield | Deep blue→cyan | Violet→magenta | Dark→neon green |
| Flow direction | Static (world-anchored) | Left, medium | Drift, very slow | Along mask lines |
| Noise scale | Fine (stars) | Medium | High (starfield) | N/A — mask-driven |
| Emissive strength | Low, points only | Low | Medium | High, pulsed |
| Distortion | None | Sine warp | None | None |
| Particle preset | Motes, drifting out | Droplets, falling | Sparkle, static | Sparks, along path |

Twenty Legendary effects then cost one shader plus twenty rows. Each new effect is minutes of tuning, not days of art.

## Constrain animation to mask zones

The mask channel decides *where* an effect plays — the panels of a jacket, the sole of a shoe, the brim of a cap. A garment animating edge to edge looks cheap and reads as noise. Effects that respect panel boundaries look designed.

## Performance

Animated cosmetics are where mobile framerate goes to die. Budget for this from day one.

- **Cap concurrent animated avatars at 8 on screen.** Beyond that, fall back to static renders, prioritising the local player and the highest tiers.
- **12–15 fps loops**, not 60. Atlas everything; aim for one draw call per avatar.
- **Pause all animation** when an avatar is off-screen or the app is backgrounded.
- **Pre-render a static thumbnail** for every animated skin, for lists, the dex grid and the marketplace. Never animate a scrolling grid.

## Accessibility

A reduce-motion setting must **preserve the rarity signal while removing the movement**. Do not simply strip the animation — that erases information the player paid for. Substitute a static bloom plus an animated rarity *frame* only, and keep the tier colour and badge. A player with motion fully disabled should still be able to tell a Legendary from a Rare at a glance.

If you pick an effect with a periodic event (e.g. Supernova's bloom), it needs a per-avatar cooldown, a dimmed version at distance, and a full opt-out under reduce-motion.

---
status: agreed
purpose: What the game runs on and how players reach it.
depends-on: ../decisions/0006-web-first-on-a-web-native-stack.md
---

# Platform

## What this is

oddssea v1 is a **responsive web app, installable as a PWA**. There is no
native build at launch; app-store presence comes later via a wrapper. This
file records the delivery decision and the client stack, so code starts from
a settled foundation.

## How it works

**One web app, every screen size.** The same URL serves phones and desktops.
Every screen is designed for a ~375px portrait phone first and expanded for
desktop — never the reverse. Navigation is a bottom tab bar on phones and a
sidebar on desktop; wager slips are bottom sheets on mobile, side panels on
desktop.

**The PWA layer** makes it feel like an app: a web manifest (`display:
standalone`, home-screen icon) and a service worker caching the app shell
and cosmetic assets so second launch is instant.

**Client stack:** TypeScript throughout. A component framework (React or
Svelte — see open questions) renders the UI screens, which is most of the
game. **PixiJS** renders the WebGL surfaces: the avatar view, the Closet,
and crate-opening moments. The animation ladder's one-shader design maps
directly to Pixi fragment shaders.

**Stores later, not now.** When the design stabilises and
`06-risks/compliance.md` is rewritten, the web app is wrapped with Capacitor
and submitted to the Apple App Store and Google Play. Expect simulated
gambling to rate 17+ (Apple) and 18+ in some IARC regions, and some
jurisdictions to restrict the category entirely — which is why the store
step waits for the compliance pass.

## Rules

- **Mobile-first is a gate, not a preference.** A screen that has not been
  checked at phone width is not done.
- **No hover-dependent interactions.** Touch has no hover; tooltips and the
  combined-rarity readout need tap equivalents.
- **Touch targets ≥ 44px.** Safe-area padding for notches.
- **The client renders; it never decides.** All economy outcomes are
  server-side — see `hosting.md`.
- **WebGL performance is budgeted on low-end phones.** The
  8-animated-avatar cap load test in `06-risks/compliance.md` runs on a
  low-end mobile browser, not a desktop.

## What this deliberately does not do

- No native builds, no store submission, and no Capacitor work in v1.
- No game engine (Unity, Godot). Their web exports are heavy and weak on
  mobile browsers — the opposite of this delivery strategy — and their
  strengths (3D, physics) go unused here. See `decisions/0006`.
- No offline play. The service worker caches the shell; the game itself
  requires the server.

## Open questions

- **React or Svelte** for the UI framework. Blocks nothing until code
  starts. Rolled up into `00-project/roadmap.md`.

## Numbers

None. Performance budgets will live here once measured; economy figures live
in `02-economy/currency-model.md`.

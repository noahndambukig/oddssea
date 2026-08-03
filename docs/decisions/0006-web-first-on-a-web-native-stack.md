---
date: 2026-08-03
status: accepted
---

# 0006 — Web-first PWA on a web-native TypeScript stack, hosted on AWS

**Decision:** v1 ships as a responsive web app installable as a PWA — no
native builds, no store submission. The client is TypeScript with a
component framework for UI and PixiJS for WebGL surfaces; no game engine.
Hosting is AWS, serverless-first. App-store submission (Apple + Google, via
a Capacitor wrapper) waits until the compliance rewrite is done.

**Why:** Three things lined up.

*Store gates are a genre risk.* Simulated gambling rates 17+/18+ and is
restricted outright in some jurisdictions; store review inserts a cycle we
do not control between us and every release, on a project whose economy
expects constant retuning. And with Shells unpurchasable there is no IAP, so
the stores' main benefit — payment rails — buys nothing in v1.

*The game is UI-shaped.* Nearly every screen is menus, wager slips,
marketplace, dex — HTML/CSS territory. The avatars are 2D layered garments
with one parameterised shader, well within PixiJS. Unity's strengths (3D,
physics, true native builds) go unused, while its weakness — heavy WebGL
exports that mobile browsers handle poorly — directly contradicts web-first
delivery. Godot shares the same web-export weakness in milder form.

*AWS credits.* Serverless scale-to-zero makes development nearly free and
the credits cover soft launch, with no re-architecture needed between the
two.

**Consequence:** `04-technical/platform.md` and `04-technical/hosting.md`
spec the result. Mobile-first design and a server-authoritative economy are
rules from the first line of code. The eventual store build is a wrapped web
app rather than true native — an accepted cost for a menu-driven game. The
production docs folder moved `04-production/` → `05-production/` to free the
`04-technical/` slot the README map had always reserved.

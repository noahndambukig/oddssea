---
date: 2026-07-29
status: accepted
---

# 0001 — Gear and skin are separate axes

**Decision:** Cosmetics are composed of two independently-owned, independently-tiered parts: the garment (gear) and its appearance (skin).

**Why:** Content scales multiplicatively while art cost scales additively. With 11 gear and 11 skins in a slot you get 121 distinct looks from 22 authored things. A single-axis system would need 121 authored items for the same variety.

**Consequence:** Skins must be authored against a mask channel rather than painted onto specific garments. See `05-production/art-pipeline.md`.

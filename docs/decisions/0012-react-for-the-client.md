---
date: 2026-08-03
status: accepted
---

# 0012 — React + TypeScript for the client

**Decision:** The UI framework is **React 18 + TypeScript**, built with Vite.
This resolves the former roadmap question 9 (React vs Svelte), which
`04-technical/platform.md` required settled before code started — and code
starts now, with the deployment-skeleton milestone.

**Why:** The deciding argument is support surface, not raw merit. This is a
solo project on an unfamiliar stack, so the framework with the largest
ecosystem, the most reference material, and a maintained PixiJS integration
(`@pixi/react`, for the avatar and Closet WebGL surfaces `platform.md`
assigns to Pixi) is the one that costs the least when stuck. Svelte 5 is the
technically leaner choice — smaller bundles, less boilerplate — and was a
genuine contender; the ~30–40 KB gzip difference is minor next to the
cosmetic art payload, and it does not outweigh the ecosystem gap for a
first-time-AWS, first-big-frontend build.

**Consequence:** `web/` is a React workspace from the first commit
(increment A of the skeleton). The choice is contained: nothing outside
`web/` knows the framework exists, so a future migration — however unlikely —
is a `web/`-scoped rewrite, not a system one.

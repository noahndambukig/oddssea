---
status: open
purpose: Decisions that are blocking or will become blocking.
---

# Open Questions

## Blocking content production

~~**1. Gear roster.**~~ Resolved 2026-08-03: chosen as 11 thematic families — `decisions/0013-gear-families.md`, roster in `03-cosmetics/content/gear-roster.md`.

~~**2. Skin roster, and which cosmic Legendary.**~~ Resolved 2026-08-03: 11 families chosen, cosmic is Void Weave — `03-cosmetics/content/skin-roster.md`.

~~**10. Which three skin families are the launch sets?**~~ Resolved 2026-08-04: Tidepool, Bloomcycle and Chrome Dip, keystones in the shirt slot; Void Weave deliberately excluded — `03-cosmetics/content/skin-roster.md`.

~~**3. Weekly rotation design.**~~ Resolved 2026-08-04: one family purchasable at the direct price plus one spotlight set at ~20% off — `decisions/0016`.

## Blocking economy tuning

**4. What do seasons look like when they return post-v1?** Length, cadence, and how they interact with the permanent pool. Deferred by `decisions/0008`; sink capacity is covered meanwhile by catalogue expansion (`decisions/0011`).

~~**5. Are Shells ever purchasable with real money?**~~ Resolved 2026-08-04 for v1: never — no real-money path in any direction; the wall is the whole compliance posture (`06-risks/compliance.md`). Revisiting post-v1 requires a decision entry and legal advice.

~~**6. The wager-economy numbers.**~~ Resolved 2026-08-03: derived by `02-economy/simulations/bankroll.py` and `crate-game.py`; `02-economy/` rewritten (decisions 0009–0011).

~~**11. Validate the lottery house-match subsidy.**~~ Resolved 2026-08-04: the subsidy recycles fully (committed destruction ≈ 1.0); crate prices re-derived to hold the crates/week anchor — `02-economy/simulations/README.md`.

## Blocking design of the flex layer

~~**7. Can Mythics be traded?**~~ Resolved 2026-08-04: yes, on the marketplace, with provenance, site-wide announcements and a suspension lever — taken against the compliance lean, `decisions/0016`.

~~**8. What do visitor tips pay now that dust is removed?**~~ Resolved 2026-08-04: capped Shells, the economy's third faucet — `decisions/0016`.

~~**9. React or Svelte?**~~ Resolved 2026-08-03: React —
`decisions/0012-react-for-the-client.md`.

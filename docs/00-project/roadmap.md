---
status: open
purpose: Decisions that are blocking or will become blocking.
---

# Open Questions

## Blocking content production

**1. Gear roster.** 11 candidates per slot need selecting from `03-cosmetics/content/gear-candidates.md`. Blocks all art.

**2. Skin roster, and which cosmic Legendary.** See `03-cosmetics/content/skin-candidates.md`. Blocks the shader work.

**3. Permanent pool vs seasonal sets.** Are launch skin families uniform-tier, with seasonal sets as a separate mixed-tier construct? See `03-cosmetics/content/set-list.md`. Blocks the Set Crate implementation.

## Blocking economy tuning

**4. Season length.** Everything in `02-economy/` assumes 8 weeks.

**5. Are Shells ever purchasable with real money?** Now the load-bearing compliance question: purchasable Shells feeding wagers and crates is real-money gambling adjacency — see `06-risks/compliance.md`.

**6. The wager-economy numbers.** House edge, Pearl reward coefficients, task faucet sizes, comeback-floor size, completion bonus size, crate prices in Pearls. Blocked on the bankroll-ruin simulation; blocks the `02-economy/` rewrite. See `decisions/0005`.

## Blocking design of the flex layer

**7. Do avatars appear during matches, or only in menus, lobbies and profiles?** This determines how much weight the Closet and showcase have to carry. If avatars are visible in-match, the flex layer can be lighter; if they're menu-only, it has to do all the work.

**8. Can Mythics be traded?** Untradeable is cleaner; tradeable is dramatic.

**9. What do visitor tips pay now that dust is removed?** Tipping Shells feeds bankrolls from social approval; tipping Pearls breaks their wager-exclusivity; removing tips weakens the Closet loop. See `03-cosmetics/flex-layer.md`.

## Blocking code

**10. React or Svelte?** The UI framework for the web-native stack — see `04-technical/platform.md`. Blocks nothing until code starts; must be settled by then.

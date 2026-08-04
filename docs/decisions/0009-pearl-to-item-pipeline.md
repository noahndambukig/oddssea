---
date: 2026-08-03
status: accepted
---

# 0009 — The Pearl-to-item pipeline: rare Legendaries, a rotating shop, hybrid Set Crates

**Decision:** Seven linked choices settling how Pearls become items, made as
the prerequisite to deriving any economy number:

1. **The economy is tuned on crates opened per week** per player profile —
   not on set-completion time, which sits behind three layers of RNG
   (wager variance, tier rolls, piece distribution) and made a noisy
   target. Set completion becomes a reported outcome.
2. **Legendaries are retuned genuinely rare** — sub-1% base rate — with a
   **guaranteed Legendary every 200 crates opened** as a real, felt pity
   mechanism (not a never-triggering backstop over the old ~4.6%
   effective rate).
3. **A rotating weekly shop** sells a featured selection of items directly
   for Pearls, alongside crates. There is no always-on direct price:
   an item's deterministic price exists while featured.
4. **Direct prices are 1.5× the expected crate-route cost** for that tier.
5. **Set Crate targeting is hybrid**: the player may choose any set at
   standard price; the weekly rotation features one set with a discount or
   bonus odds.
6. **Duplicates salvage into Pearls**, manually, at a deliberately lossy
   rate, with confirmations at high tiers. Crates are therefore priced on
   *effective* cost (sticker minus expected salvage return).
7. **Every non-crate sink is in Pearls** — fusion, closet expansion,
   loadout slots, showcase pedestal, marketplace. The Shell economy stays
   pure: tasks in, house edge out, nothing else. And the **Pearl formula
   is theo-based**: base earn ∝ stake × game edge (equal Pearls per Shell
   of expected loss across all seven games), plus an odds-scaled
   celebration bonus on wins.

**Why:** Noah's critique started it: completing a set "should probably not
be the measure of the economy, since it is so random and also depends on
the rarity of the item." Anchoring on crates-per-week tunes the
deterministic layer and reports the random ones. The rarity retune gives
the collection game a real long-term chase — the old rates handed out a
Legendary every ~22 crates, too fast for a permanent (no-seasons) pool.
The rotation gives the shop a retail rhythm and a scarcity lever without
FOMO-deleting anything permanently. The theo-based formula closes the
farming exploit that gated blackjack in `0007`.

**Consequence:** Every existing simulation result is dead — the
crate-rates figures and the 10.4-crates-per-set number assumed the old
tables and the coin economy. The drop tables in `03-cosmetics/crates.md`
are under revision. The set keystone becomes a serious wall at sub-1%
Legendary rates, which promotes fusion (4 Epics → 1 Legendary) and shop
rotation into load-bearing Legendary paths — the simulations must model
all three. Blackjack's shipping condition from `0007` is satisfied by
choice 7. Roadmap question 3 (Set Crate targeting) is resolved; its slot
now tracks rotation design (shop contents, discount size, cadence).

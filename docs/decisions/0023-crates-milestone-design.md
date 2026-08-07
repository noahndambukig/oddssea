---
date: 2026-08-07
status: accepted
relates-to: 0005, 0009, 0010, 0011, 0015, 0020, 0021, 0022
---

# 0023 — The crates milestone: design calls made at implementation

**Decision (Noah + review, 2026-08-07):** Six calls fixed while turning
`03-cosmetics/crates.md` into running code. Scope was Noah's (all five
crate kinds now; starter grant as an immediate one-time claim; barebones
dex with page rewards; rotation and direct purchase deferred). The rest
came out of planning and two Codex review rounds (12 findings, all
applied — `.review` ledger in the repo).

1. **Pre-rolled randomness, transactional decisions.** Pity counters and
   first-four distinctness are state and must be read under the player row
   lock, but the ledger rule (`decisions/0020`/`0021` era) is one Data API
   call per economic event. Resolution: Node pre-rolls every draw the open
   could need — tier roll, one candidate per tier, the set permutation
   (Fisher-Yates over `crypto.randomInt`) — and `open_crate()` applies
   pity and distinctness to them under the lock. The full payload is
   stored on `crate_opens`, so the audit trail carries the draws that lost
   to a pity override: luck and mercy are distinguishable rows, not a
   reconstruction.

2. **The starter gate.** `open_crate()` refuses paid opens until the
   starter grant (2 Basic Gear + 1 Basic Skin, price 0, no ledger rows) is
   claimed, making the first-session guarantee (crates.md: a "must")
   structural rather than hoped-for. The composition is re-verified in
   SQL, so a modified client cannot claim three of anything else.

3. **The keystone is exempt from first-four distinctness.** The simulation
   of record (`crate-game.py`) redirects only non-keystone pieces
   (`if piece != 5`); the published completion numbers assume exactly
   that. Two Legendary rolls in a chase's first four (~0.24%) therefore
   legally produce a duplicate keystone, recorded like any pull.
   "Fixing" it would have made the chase cheaper than simulated — the
   first explicit ruling that **when spec prose and the sim of record
   disagree, the sim wins and the prose is corrected** (crates.md prose
   updated in the same change).

4. **Pity is increment-then-check** — fires ON the 200th/40th/100th open,
   matching the sim; the epic drought alone is check-then-increment and
   fires on the open after its ten misses. Verified at the exact
   boundaries by a pre-deploy harness. Set-chase pity never resets; the
   keystone-owned condition retires it.

5. **Completion pays inside the completing transaction.** Dex-page and
   set bonuses (`currency-model.md` figures, shipped to the runtime via
   `drop-tables.json` **1.1.0** — additive bump adding
   `completion_bonuses`, the same shipping-copy precedent as
   `price_pearls`) are paid as `completion_bonus` ledger rows gated by
   `one_time_claims`, in the same transaction as the open that completed
   the page or set. The candidates payload carries each possible item's
   page and set membership, so SQL needs no catalogue knowledge.

6. **The idempotency re-check moves under the lock — including for the
   shipped functions.** Review found the race in 003 as deployed: the key
   check precedes the row lock and is never repeated, so two concurrent
   same-key calls can both miss it and the loser dies on the key insert
   instead of returning the stored response. Migration 006
   `CREATE OR REPLACE`s `claim_login_task` and `place_dice_bet` with the
   re-check — a new migration replacing a function is additive history;
   editing 003 would be rewriting it.

**Consequences:** `items` and `dex_entries` (deferred by 002's slice
scoping) are created in 006 alongside `crate_opens`, `pity_counters`
(empty-string target sentinel — PK columns cannot be NULL) and
`one_time_claims`. `crates.md` and `dex.md` gain `implemented-by`.
Salvage, rotation and direct purchase remain deferred to a later economy
pass.

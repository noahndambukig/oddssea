---
date: 2026-08-08
status: accepted
relates-to: 0007, 0022, 0027, 0028
---

# 0029 — Roulette: one formula, one clock, and the extraction cashed in

**Decision (planning + one review round, 2026-08-08):** Roulette ships
as the fourth game on crash's rounds-as-arithmetic doctrine, with the
full standard bet matrix and the rule-of-three settlement extraction.

1. **One identity prices the whole table.** Every standard bet pays
   `36 / coverage`, so RTP is exactly `36/37` at every type and every
   stake, and — payouts being integer multiples of stake — the Shell
   RTP equals the published RTP with no floor caveat (unlike crash,
   0028 §4). The edge is **derived, not restated**: `1 − 36/37 = 1/37`
   in `games.ts`, with `currency-model.md` the doc of record.
   `games.ts` load-checks `payout × coverage = 36` for every type.

2. **The pocket is exactly uniform.** `HMAC-SHA256(secret,
   'roulette:' + round index)` with **deterministic rejection** — a
   naked `mod 37` carries modulo bias; rejection makes the published
   1/37 exact. **One retained secret serves both games via domain
   separation**: crash hashes the bare index (shipped history),
   roulette prefixes its name. Rounds are 40 s (30 s betting, spin at
   :30) — the spec's ~40 s timer made exact; the spin moment is FIXED,
   so the reveal gate is the clock alone.

3. **One authority clock** (review round 1's best catch): the round
   view's reveal, phase and `serverEpochMs` all derive from
   **Postgres's `now()`**, fetched in the same trip as the feed —
   never Lambda's clock. A reveal gated on a different clock than the
   one closing betting is an exploit window exactly as wide as the
   skew, and a prematurely revealed pocket is directly bankable at
   36×. (Crash's variant is benign — an early bust reveal is only
   avoidance information — and is left as shipped.)

4. **Many bets, one outcome; the extraction is forward-only.** No
   one-per-round rule — chips stack freely, each a keyed placement.
   Migration 013's private `settle_round_bet` is the shared ledger
   write-path (bets transition, payout/pearl rows, balances, fraction
   carry) used by roulette now and races later; **dice, plinko and
   crash are deliberately untouched**. Settlement sweeps in
   `(round_index, bet_id)` order — UUIDv7 makes that creation order —
   so the pearl fraction-carry sequence is exactly reproducible by the
   audit. The settle response window is **time-based** (`settled_at`
   within 5 minutes, LIMIT 200 + truncated flags): a round-count
   window with many bets per round is both unbounded and misses old
   stragglers, reopening the replay gap 0028 closed. Caps are on
   reporting, never on betting ("no maximum bet in v1").

5. **Legality at the handler, shape in SQL, truth in the audit.** The
   layout registry (60 splits, 14 streets, 23 corners incl. the
   first-four, 11 six-lines) is **derived from the 3×12 grid**, never
   typed in — the wheel's red set is the one true lookup constant.
   The handler canonicalises against the registry; SQL validates
   shape and the price; the audit re-derives legality and settlement
   over every stored row — the plinko trust split.

6. **A singleton table, rooms deferred explicitly.** `game-modes.md`
   says "per room" and `data-model.md` sketched `roulette_rooms` (and
   a stored `rounds` table that crash had already superseded
   silently); both paragraphs now carry pointers. Rooms are the
   scale-out path and enter the derivation as
   `'roulette:' + room + ':' + index` when they exist — today's key is
   the room-less special case, not a migration problem.

7. **Rollback posture** (0028's, restated): migrations are
   forward-only, so the settle functions survive an app rollback;
   open bets stay debited with the ledger intact and settle on
   roll-forward or an admin `settle_roulette_bets` call; `voided` is
   the nuclear option.

**Consequences:** `decimal_odds` is written at placement (the price is
known — dice semantics; crash's at-settle reading shares the same 002
column). `first_bet:roulette` joins the one-times. Races inherit the
many-bets-one-outcome shape and `settle_round_bet`. The two crash
lessons (declared parameter order; rule phrases registered at birth)
were applied in the same commits that created the surfaces.

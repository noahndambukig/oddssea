---
date: 2026-08-08
status: accepted
relates-to: 0007, 0022, 0024, 0026, 0027
---

# 0028 — Crash: rounds as arithmetic, and the laws that follow

**Decision (planning + two review rounds, 2026-08-08):** Crash ships as
the third game and the first *shared* one, on time-indexed lazy rounds.

1. **Rounds are derived, never run.** A round is its UTC minute:
   betting in the first 10 seconds, then the curve doubles every 4
   seconds to the 1,000× cap just inside the minute (timings in
   `01-game/game-modes.md`; shipping copy `01-game/data/games.json`
   1.1.0, geometry load-checked by `api/src/games.ts`). The bust is
   `HMAC-SHA256(secret, round index)` pushed through the inverse-CDF
   law in `02-economy/currency-model.md` — no scheduler, no round
   rows, nothing stored that can be computed, and provable fairness
   as a corollary. Chosen over a settlement sweeper (the system's
   first cron, idle at four players) and ticker-owned round rows
   (spectator-scale machinery, weaker fairness); hosting.md already
   named this first choice, and `decisions/0026` is what made the
   alternatives legal at all.

2. **Both cash-out verbs, one law, ties pay.** Live cashout is
   adjudicated by the server clock (latency is the player's risk);
   auto-cashout settles at maturity. Both win on `target = bust` /
   `m_now = bust` because the published law is `P(B ≥ m)` — review
   round 2 caught the verbs disagreeing on cent-quantised ties
   (~0.94% of cases at 1.01×). A bust below the 1.01× minimum has no
   winners, closing the zero-risk Pearl-farm a 1.00× cashout would be.

3. **Settlement eligibility is decided-not-elapsed.** A round is
   settleable from its bust moment, not its minute boundary — nothing
   after `t_bust` can change any outcome. The maturity verb is
   keyless (naturally idempotent: open→settled under the player lock)
   with a derived-state response — recent settled bets plus balances —
   so a retry reproduces outcomes instead of an empty receipt.
   Skipped-round follow-ups always reuse the keyless call; a keyed
   place retry would answer from its stored response.

4. **The Shell floor is published, not engineered away.** Payouts are
   `floor(stake × multiplier)`, so effective Shell RTP sits at or
   below the exact 97.00% multiplier law and converges with stake
   (stake 10 at 1.09× pays 10). **User call:** min stake stays 10 —
   the family default — with the floor stated in the disclosure and
   `currency-model.md`; the rejected alternative forced stakes into
   multiples of 100 for provable Shell-exactness.

5. **The secret is evidence, and it outlives the stack.** One secret
   epoch in Secrets Manager (`removalPolicy: RETAIN` — the ledger
   survives a stack delete via SNAPSHOT, and the ability to recompute
   every stored bust must match). Rotation is deferred with the
   commit-reveal ceremony and would require epoch-versioning. Rollback
   posture is documented, not machined: migrations are forward-only,
   so open bets survive an app rollback with the ledger intact and
   settle on roll-forward; 002's `voided` state is the nuclear option.

6. **Documented edges:** one bet per player per round (checked under
   the row lock); a bet placed 23:59 and settled 00:01 counts its win
   toward neither day's challenge (predicates filter on `created_at`'s
   day — one straddling round per night, accepted like dice's 0.99×
   edge); the flight UI reveals the bust only by polling, so the
   client's curve can overshoot by up to a poll interval before
   snapping to the truth.

**Consequences:** `bets.decimal_odds`'s "nullable on purpose" comment
from 002 is finally exercised — it carries the locked multiplier, NULL
on a loss. The per-game bet-function extraction (rule of three) waits
for roulette: crash's two-phase lifecycle is a new shape, not a third
instant game. WebSockets remain deferred; the ~1 s flight poll is the
barebones feed.

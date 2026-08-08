---
date: 2026-08-07
status: accepted
relates-to: 0007, 0024, 0025, 0026
---

# 0027 — Plinko's published tables, and what "win a bet" means

**Decision (planning + review, 2026-08-07):** Plinko ships as the second
game with three derived multiplier tables, and the task system's win
predicate is corrected before it could pay on a loss.

1. **The tables are derived, not designed by feel.** Three binomial
   profiles (8/12/16 rows) priced closed-form against the 3% instant
   edge, rounded player-favorably to display-clean multipliers; the
   exact RTPs (97.0703125% / 97.0888671875% / 97.152099609375%) are
   published in the UI and live in `currency-model.md` with the shipping
   copy in `01-game/data/games.json`. The shipping copy's `rtp` field is
   deliberately redundant: `api/src/games.ts` recomputes it from the
   table at module load and fails the deploy on any mismatch — a
   published number carries a tripwire against its own derivation.
   A hand-derivation error in the mid table (0.97088623 vs the true
   0.970888671875) was caught by exactly this check during the build.

2. **"Win a bet" means `payout > stake`.** The shipped predicate was
   `payout > 0`, correct only while no game paid partial returns — a
   0.4× plinko bucket would have completed the outcome challenge on a
   loss (Codex round 1, High). Profit is a win: applied in
   `claim_daily_task` and the slate. Documented dice edge: an under-99
   bet carries 0.99× odds, a satisfied prediction returning less than
   stake — it deliberately does not count.

3. **The Pearl win-share maps odds = the bucket multiplier** for buckets
   above 1× — `bankroll.py`'s exact model (odds are the winning
   outcome's decimal payout), so **no simulation changes**: plinko is an
   instant game at the 3% edge, which the sim already models
   generically.

4. **The draw grows to 3 by effective date.** `challenge:play_two_games`
   enters the pool dated **2026-08-09** (deploy day + 2, the 0024 rule)
   — the first real use of `available_from`: the entry is provably inert
   until its date, and the shared draw becomes three challenges without
   touching a day in progress.

5. **Economy parameters gained a machine-readable home.**
   `games.json` carries `instant: { edge, min_stake_shells }` — review
   found dice's figures are hardcoded in shipped 006 with pointer
   comments and no reusable source. Plinko's arrive as function
   parameters; dice's hardcodes stay as shipped history.

**Consequences:** migration 010 (the tour-chain contract owed by 0025)
opened this branch. `game-modes.md` gains `implemented-by` for its
plinko section via games.json. Crash remains the point where the
per-game bet functions get generalized (rule of three).

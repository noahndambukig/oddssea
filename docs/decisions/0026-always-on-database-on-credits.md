---
date: 2026-08-07
status: accepted
supersedes-in-part: 0020-data-api-over-rds-proxy.md (the auto-pause cost model)
---

# 0026 — Always-on database for dev, on credits; migrate before launch

**Decision (Noah, 2026-08-07):** The Aurora cluster runs always-on for the
rest of development: `serverlessV2MinCapacity` 0 → **0.5** and the
10-minute auto-pause removed. Dev is funded by AWS credits (~$44/month at
the 0.5-ACU floor, us-east-1), so the cash cost is ~zero while it lasts.
**The plan of record is to migrate off Aurora before launch** (Supabase
free tier was the candidate evaluated), which is why every migration and
function remains deliberately plain Postgres and all database access flows
through `api/src/db.ts`'s two functions — the migration stays a bounded,
one-session move for as long as those disciplines hold and no real player
data exists yet.

**Why:**

1. **The shared-round games get the simple design.** Crash, roulette and
   the lottery need rounds that exist independent of any request. With
   auto-pause, any ticker silently converts "pauses almost always" into
   "awake most of the time" — paying always-on price while pretending
   otherwise (the trap 0020 named). With the pause gone, scheduled work
   is simply legal, and time-indexed lazy rounds become a per-game design
   choice (still attractive for provable fairness) rather than an
   infrastructure requirement.
2. **Cold starts disappear** — no 15-second wake, no waking screen in
   practice. The 503/Retry-After machinery stays: it still covers
   restarts and failovers, and removing proven machinery buys nothing.
3. **Credits make the trade free**, and running a real always-on database
   is more AWS learning, not less — which is a stated goal of this
   project.

**What 0020 keeps:** everything except the cost model. The Data API, no
VPC for the Lambdas, no RDS Proxy, no NAT — all still correct: they were
chosen for auto-pause but earn their place on simplicity (no connection
pool, no VPC networking) regardless.

**Consequences:** `hosting.md` updated (minimum capacity, cost posture).
The console check "capacity drops to 0 when idle" becomes "capacity sits
at 0.5". The walkthrough's Parts 8–10 describe the scale-to-zero era
accurately as history. Watch the credit burn: ~$44/month plus pennies for
everything else.

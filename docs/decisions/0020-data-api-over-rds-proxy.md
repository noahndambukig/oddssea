---
date: 2026-08-05
status: accepted
supersedes: the RDS Proxy line in 0018-ledger-integrity-rules.md
---

# 0020 — The Data API replaces RDS Proxy, because a proxy would prevent the database from ever pausing

**Decision:** Lambda reaches Aurora over the **RDS Data API** (HTTPS), not
through a VPC-attached connection behind **RDS Proxy**. The cluster runs
Aurora PostgreSQL with **minimum capacity 0** so it auto-pauses when idle.

This **reverses** the RDS Proxy line recorded in `decisions/0018` and
rewritten into `hosting.md` the same day. 0018's rationale stands on its own
terms and is left intact, as decisions here are append-only.

**Why the reversal:**

0018 named RDS Proxy for a good reason: `data-model.md` puts hot game state
in Postgres because Lambdas have no resident memory, so every request is a
database round trip, and Lambda concurrency against Postgres is the canonical
connection-exhaustion pairing. That reasoning is correct **at volume**.

It is the wrong optimisation at this volume, and the AWS documentation says
so explicitly. Under *Situations where Aurora serverless doesn't auto-pause*:

> "If your Aurora cluster has an associated RDS Proxy, the proxy maintains an
> open connection to each DB instance in the cluster. Thus, any Aurora
> serverless instances in such a cluster won't automatically pause."

The Data API is compatible by contrast — it holds no connection, and a
request to a paused cluster resumes it:

> "If you send a request to your cluster through the RDS Data API, Aurora
> resumes the writer instance if it's paused. Then Aurora processes the Data
> API request."

So the two choices were never independent. Taking the proxy would have
silently cancelled scale-to-zero — no error, no failed deploy, just an idle
cluster billing every hour forever. **This project's entire fixed
infrastructure cost today is one Route53 hosted zone.** A permanently-awake
database is the largest line item the project would have, incurred to solve a
connection-exhaustion problem that one developer and zero players cannot
create.

Two further consequences fall out of the same choice, and are recorded here
rather than discovered later:

- **No VPC-attached compute, therefore no NAT gateway.** The Data API is
  reached over the public AWS endpoint with IAM auth, so the API Lambda stays
  out of a VPC entirely.
- **No scheduled database work.** A timer that wakes an idle cluster defeats
  the pause as thoroughly as a proxy does. Reconciliation is therefore
  event-driven — drift can only occur when the ledger is written, so a
  scheduled check of an idle system is checking something that provably
  cannot have changed.

**Costs accepted, with eyes open:**

- **Resume latency.** ~15 seconds from a pause, and 30+ seconds after more
  than 24 hours idle, which for a project like this is the normal case rather
  than the exception. Clients set timeouts above 30s and the UI states
  plainly that the database is waking.
- **Clumsier transactions.** Each statement is an HTTP round trip, so a
  locked transaction — begin, `SELECT … FOR UPDATE`, write, commit — is four
  or five calls rather than one connection's worth of work. `data-model.md`
  rules 3 and 4 are unaffected: the Data API supports transactions and row
  locks; it is the ergonomics that suffer, not the semantics.
- **A pinned engine version.** AWS documents auto-pause for PostgreSQL 16.3+,
  15.7+, 14.12+ and 13.15+ — enumerated by family. The engine is pinned
  inside that documented range rather than to the newest available, because
  the entire cost model rests on minimum-capacity-0 being honoured.

**The exit, if it is ever needed:** a VPC with RDS Proxy, which is exactly
what 0018 specified. The price of that exit is the idle bill, every hour of
every day the game is quiet. Revisit when real traffic makes per-statement
round trips the bottleneck — not before.

**Provenance:** ledger-milestone design session, 2026-08-05. The conflict was
found by reading the auto-pause documentation while verifying an unrelated
claim about minimum capacity, not by anything failing.

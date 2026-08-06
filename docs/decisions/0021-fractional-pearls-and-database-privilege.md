---
date: 2026-08-06
status: accepted
---

# 0021 — Fractional Pearls carry, and privilege lives in the database

**Decision:** Three things settled while building the ledger milestone, each
of which changes a rule rather than an implementation detail.

1. **Pearl awards accumulate a fractional carry** on `players.pearls_fraction`
   and pay whole Pearls into the ledger when the carry crosses 1.
2. **Every database write goes through a `SECURITY DEFINER` function**, and
   the application role holds no write privilege on any table.
3. **`players.age_attested_at` is authoritative for the 18+ gate**, checked
   server-side on every economic route. Cognito's custom attribute becomes a
   one-time import at first login.

## Why the Pearl carry

The award formula is `0.75 × stake × edge`, plus on a win
`0.30 × stake × edge × odds` (`02-economy/currency-model.md`). At the
documented **10-Shell minimum bet** and the 3% instant-game edge, that is
**0.225 Pearls** — and the ledger stores integers.

Flooring each bet independently pays **zero**. Not a rounding loss: measured
over 560 bets at minimum stake, 100% loss. And since wagering is the only
source of Pearls (`decisions/0005`), a player betting the minimum would have
been permanently locked out of the cosmetic system the entire game exists to
feed — while `currency-model.md` frames minimum bets as the comeback floor.

`simulations/bankroll.py` was already right: it accumulates Pearls as a
float. The implementation, not the economy, was wrong.

The carry reproduces the simulation exactly — verified across stakes 10/50/100
and 35/560 bets: **nothing lost, only deferred**. It is an accumulator rather
than currency, so it lives outside the ledger and outside the balance
assertion, and it is read and written under the player row lock the economic
functions already take.

Alternatives rejected: storing Pearls scaled (millipearls) would make the
stored unit differ from every price in `currency-model.md`, a permanent
translation layer and an easy factor-of-1000 bug; raising the coefficients so
minimum bets pay ≥1 Pearl would inflate low-end income roughly fivefold and
require reopening `decisions/0009`.

## Why privilege lives in the database

`data-model.md` rule 1 says the ledger is append-only. That was a rule the
application code followed, which means it was a rule any bug could break.

Now `oddssea_app` — the role the API connects as — has EXECUTE on ten
functions, SELECT on three non-credential tables, and **no INSERT, UPDATE or
DELETE anywhere**. The functions are `SECURITY DEFINER`, so they carry their
owner's privileges when they run; the caller needs none. `UPDATE
ledger_entries` from the API is not discouraged, it is `permission denied`.

Two details that make it real rather than decorative:

- **`SET search_path` places `pg_temp` last** and every reference is
  schema-qualified. Postgres searches `pg_temp` implicitly, so a role able to
  create temporary tables could otherwise shadow an unqualified table name
  inside a definer function — a privilege escalation that looks like nothing
  in the code. TEMP is also revoked.
- **The API is granted Data API access explicitly, never via
  `cluster.grantDataApiAccess()`.** That CDK helper also grants read on the
  cluster's *master* secret, which would let the API connect as admin and
  bypass all of the above. The helper is reserved for the migration Lambda,
  which legitimately needs admin.

## Why attestation moves to Postgres

Increment B stored the 18+ attestation as a Cognito custom attribute and
enforced it by rendering a gate. A client that skipped the screen skipped the
check. `compliance.md` asks for attestation, and a UI-only gate does not
provide it.

`POST /me/attest` writes `players.age_attested_at`, and the economic
functions raise if it is null. The import at login is **backfill-only**: once
the gate stops writing Cognito, later ID tokens carry no attestation claim,
so a conventional upsert would overwrite a real timestamp with null on the
user's next sign-in.

A pleasant consequence: no forced token refresh. The old flow had to mint a
fresh ID token to observe its own write, because claims are fixed when a
token is issued. A row has no such problem.

**Consequences:** `data-model.md` gains `pearls_fraction` on `players`; the
`age_attested_at` migration it anticipated is done; rule 1's append-only
guarantee is now enforced by grants rather than convention.

**Provenance:** built 2026-08-05/06 against the plan reviewed over 9 Codex
rounds (62 findings). The Pearl bug was found by checking the arithmetic
against `bankroll.py`, not by review — the reviewers checked what the plan
said, and only running the numbers checked what it would do.

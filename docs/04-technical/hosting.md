---
status: agreed
purpose: The AWS architecture serving the game.
depends-on: ../decisions/0006-web-first-on-a-web-native-stack.md, ../decisions/0017-tokens-in-sessionstorage-until-money-exists.md, ../decisions/0018-ledger-integrity-rules.md, ../decisions/0020-data-api-over-rds-proxy.md
implemented-by: ../../infra/
---

# Hosting

## What this is

Where the game runs server-side. AWS, chosen for existing credits; shaped
serverless so cost scales from near-zero during development to launch
without re-architecture.

## How it works

| Piece | Service | Why |
|---|---|---|
| Frontend + cosmetic assets | S3 + CloudFront | Static bundle behind a CDN; the grayscale+mask art pipeline keeps assets small |
| API | Lambda + API Gateway | Scales to zero while the game is being built; no servers to keep warm |
| Database | Aurora Serverless v2 (Postgres) | The economy is a ledger — wagers, marketplace escrow and crate opens need ACID transactions. **Minimum capacity 0.5 — always on for the rest of dev** (`decisions/0026`): funded by AWS credits, no cold starts, scheduled work is legal. The plan of record migrates off Aurora before launch, so everything stays plain Postgres |
| Database access | **RDS Data API** | An HTTPS endpoint instead of a connection. No VPC attachment for Lambda, therefore no NAT gateway; no connection pool to exhaust. Chosen for auto-pause (`decisions/0020`), kept for simplicity now that the pause is gone (`decisions/0026`) |
| Auth | Cognito + a **backend-for-frontend** | Managed accounts; the BFF owns the token exchange and the refresh cookie once a balance exists (`decisions/0017`) |
| Live odds / bet feeds | API Gateway WebSockets — **later** | Shape depends on the unwritten core loop |

Single region plus the CDN. Infrastructure is defined as code (CDK) from the
first deploy, so environments are reproducible.

**The cost model is now "credits pay for always-on" (`decisions/0026`).**
Through the ledger, crates, tasks and closet milestones the cluster ran
scale-to-zero (minimum capacity 0, 10-minute auto-pause, ~15-second
resume, `decisions/0020`) and the client machinery built for it — 503 +
Retry-After, idempotent retries, the waking screen — remains in place,
now exercised only by restarts and failovers. At minimum capacity 0.5 the
cluster answers instantly and scheduled work no longer sabotages a pause.
`data-model.md` still puts hot game state in Postgres because Lambdas
have no resident memory; at real volume that argues for pooling, and the
pre-launch database migration is where that gets decided.

The database arrives with the ledger; nothing before it touches one.

## Rules

- **The server is the only authority on the economy.** Every Shell and Pearl
  mutation — wager settlement, crate RNG, salvage, fusion, marketplace —
  executes server-side inside a transaction. The client submits intents and
  renders results; it never computes an outcome.
- **Every crate open is logged** with its roll and drop table version. This
  is what makes the published-odds commitment in `06-risks/compliance.md`
  auditable.
- **Currency mutations are ledger entries, not balance overwrites.** Balances
  are derivable from the ledger; disputes and bug forensics depend on this.
- **Every economic request is idempotent and per-player serialised.** The
  transaction rule above is atomicity, which says nothing about a request
  arriving twice — and over a mobile network they do. The mechanisms
  (client idempotency keys, a player row lock, non-negative balance
  constraints) are specified in `data-model.md` rules 3 and 4.

## What this deliberately does not do

- **No real-money payment infrastructure.** Shells are not purchasable, so
  there is no PCI scope, no store billing, no payment provider. This is
  the compliance wall (`../06-risks/compliance.md`); adding a payment
  path requires a decision entry and legal review first.
- No multi-region, no Kubernetes, no microservices. One API, one database,
  until scale forces otherwise.
- **No connection pooling, and no VPC-attached compute.** Chosen for
  auto-pause (`decisions/0020`), kept for simplicity: no pool to exhaust,
  no VPC networking, no NAT. If traffic ever makes per-statement HTTP
  round trips the bottleneck, that is a question for the pre-launch
  database migration (`decisions/0026`), not for this stack.
- **Scheduled database work is now permitted but not preferred**
  (`decisions/0026` removed the pause a cron would have sabotaged).
  Reconciliation stays event-driven regardless — drift can only occur
  when the ledger is written, so the check belongs on the write path, not
  on a clock — and time-indexed lazy rounds remain the first choice for
  shared games where they also buy provable fairness.

## Open questions

- WebSocket architecture waits on `01-game/core-loop.md` — what players
  wager on determines what must be pushed live.

## Numbers

Cost estimates are deliberately not recorded here — they drift too fast to
be authoritative. Economy figures live in `02-economy/currency-model.md`.

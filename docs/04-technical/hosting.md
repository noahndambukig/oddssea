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
| Database | Aurora Serverless v2 (Postgres) | The economy is a ledger — wagers, marketplace escrow and crate opens need ACID transactions. **Minimum capacity 0**, so an idle cluster pauses and bills nothing but storage |
| Database access | **RDS Data API** | An HTTPS endpoint instead of a connection. No VPC attachment for Lambda, therefore no NAT gateway; no connection pool to exhaust; and — decisively — nothing holding a connection open, so the cluster can actually reach zero (`decisions/0020`) |
| Auth | Cognito + a **backend-for-frontend** | Managed accounts; the BFF owns the token exchange and the refresh cookie once a balance exists (`decisions/0017`) |
| Live odds / bet feeds | API Gateway WebSockets — **later** | Shape depends on the unwritten core loop |

Single region plus the CDN. Infrastructure is defined as code (CDK) from the
first deploy, so environments are reproducible.

**Scale-to-zero is the cost model, not a detail.** `data-model.md` puts hot
game state — live tables, wheels, open bets — in Postgres precisely because
Lambdas have no resident memory, which makes every request a database
round-trip. At real volume that argues for pooling; at this volume the
database is idle almost always, and the only figure that matters is what an
idle cluster costs. Anything holding a persistent connection prevents the
pause, which is why RDS Proxy is **not** used here — AWS lists it by name
among the conditions that block auto-pause. The accepted cost: a paused
cluster takes ~15 seconds to resume, or 30+ after a day asleep, so clients
set long timeouts and the UI says so honestly.

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
- **No connection pooling, and no VPC-attached compute.** Both follow from
  the Data API choice above rather than being independent positions. If
  traffic ever makes per-statement HTTP round trips the bottleneck, the exit
  is a VPC with RDS Proxy — and the price of that exit is the idle bill,
  paid every hour of every day the game is quiet (`decisions/0020`).
- **No scheduled work that touches the database on a timer.** A cron that
  wakes an idle cluster converts "pauses almost always" into "awake most of
  the time", and it does so silently. Reconciliation is event-driven for
  this reason: drift can only occur when the ledger is written, so the check
  belongs on the write path, not on a clock.

## Open questions

- WebSocket architecture waits on `01-game/core-loop.md` — what players
  wager on determines what must be pushed live.

## Numbers

Cost estimates are deliberately not recorded here — they drift too fast to
be authoritative. Economy figures live in `02-economy/currency-model.md`.

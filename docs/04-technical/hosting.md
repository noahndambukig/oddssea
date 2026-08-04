---
status: agreed
purpose: The AWS architecture serving the game.
depends-on: ../decisions/0006-web-first-on-a-web-native-stack.md
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
| Database | Aurora Serverless v2 (Postgres) | The economy is a ledger — wagers, marketplace escrow and crate opens need ACID transactions; scales to zero in dev |
| Auth | Cognito | Managed accounts; free tier covers early scale |
| Live odds / bet feeds | API Gateway WebSockets — **later** | Shape depends on the unwritten core loop |

Single region plus the CDN. Infrastructure is defined as code (CDK) from the
first deploy, so environments are reproducible.

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

## What this deliberately does not do

- **No real-money payment infrastructure.** Shells are not purchasable, so
  there is no PCI scope, no store billing, no payment provider. Adding one
  is a decision-entry-level change (see `00-project/roadmap.md`, question 5).
- No multi-region, no Kubernetes, no microservices. One API, one database,
  until scale forces otherwise.

## Open questions

- WebSocket architecture waits on `01-game/core-loop.md` — what players
  wager on determines what must be pushed live.

## Numbers

Cost estimates are deliberately not recorded here — they drift too fast to
be authoritative. Economy figures live in `02-economy/currency-model.md`.

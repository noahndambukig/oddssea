# oddssea

A social-casino / gambling simulator. Players earn a wagerable currency
(**Shells**) through tasks, wagering earns the cosmetic currency (**Pearls**),
and an avatar cosmetic collection system is the primary sink.

**Specs lead; code follows.**

| Directory | What lives there |
|---|---|
| `docs/` | Every spec. What is true *now*. Edited constantly. |
| `journal/` | Append-only record of what happened and when. Never edited. |
| `infra/` | AWS CDK — all cloud infrastructure, defined as code |
| `web/` | The React + TypeScript client (Vite, PWA-bound) |

Start with [docs/README.md](docs/README.md) for the spec index, and
[CLAUDE.md](CLAUDE.md) for the working rules.

## Current milestone

An authenticated skeleton, built in three increments:

- **A — a live URL.** Static page at `https://dev.oddssea.xyz`, deployed by a
  pipeline with no stored credentials. *(in progress)*
- **B — login.** Cognito Hosted UI, hand-written PKCE, real accounts.
- **C — the API.** One Lambda; a public `/health` and a token-guarded `/me`.

## Running it

Requires Node 22+.

```bash
npm install
npm run dev          # local dev server on http://localhost:5173
npm run build        # typecheck + production build of web/
npm run synth        # build, then synthesise the CloudFormation templates
```

**Deploying needs one-time AWS setup.** [infra/README.md](infra/README.md) is
the guided walkthrough — it explains every concept as it appears, splits the
work between console and terminal, and says what to inspect after each step.
Work through it once; afterwards a push to `main` deploys on its own.

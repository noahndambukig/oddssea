# Project context for Claude

This repository is the design documentation for the avatar cosmetic and collection
system of an arcade game with an earned in-game currency.

## Read these first

1. `00-overview/pillars.md` — the five goals every decision traces back to
2. `00-overview/doc-conventions.md` — **the rules for editing these docs; follow them**
3. `01-systems/core-model.md` — the gear × skin structure everything hangs off
4. `05-roadmap/open-questions.md` — what is currently undecided

## Rules for working in this repo

- **Every coin figure lives in `02-economy/currency-model.md`.** Never restate a number
  in another file; link to it instead.
- **Decisions are append-only.** When something changes — especially a reversal —
  add a dated entry in `decisions/` rather than editing history away.
- **Re-run the simulations before changing an economy number.**
  `python3 02-economy/simulations/set-completion.py` and `crate-rates.py`.
  Update the results-of-record table in `02-economy/simulations/README.md`.
- **Update the frontmatter `status` field** when a file's state changes
  (`draft` → `agreed` → `locked`).
- Keep one topic per file. If a file needs "and" to describe it, split it.

## Current state

- Core systems and economy: agreed, simulated, not playtested
- Gear and skin rosters: **awaiting selection** from the candidate files in `03-content/`
- Dyes were considered and rejected — see `decisions/0003-no-dye-axis.md`

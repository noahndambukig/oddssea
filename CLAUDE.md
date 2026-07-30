# oddssea

A social-casino / gambling-simulator game with an earned in-game currency and an
avatar cosmetic collection system as its primary currency sink.

**Specs live in `docs/`. Code lives in `src/`.** Specs lead; code follows.

## Read these first

1. `docs/00-project/pillars.md` — what this project is optimising for
2. `docs/00-project/doc-conventions.md` — **the rules for editing specs; follow them**
3. `docs/00-project/spec-workflow.md` — how specs get written here
4. `docs/README.md` — index of every spec and its status
5. `docs/00-project/roadmap.md` — what is undecided right now

## Working rules

**Numbers have exactly one home.** Every coin, price and rate lives in
`docs/02-economy/currency-model.md`. Never restate a number in another file —
link to it. A figure that appears in four docs will be wrong in three of them
within a month.

**Decisions are append-only.** When something changes, especially a reversal,
add a dated entry in `docs/decisions/`. Do not edit the old rationale away.

**Re-run simulations before changing an economy number**, then update the
results-of-record table in `docs/02-economy/simulations/README.md`:

```bash
python3 docs/02-economy/simulations/set-completion.py
python3 docs/02-economy/simulations/crate-rates.py
```

**Verify before declaring done.** Every spec session ends with a verification
pass — simulate the numbers, grep for contradictions against existing specs,
confirm nothing restates a figure that lives elsewhere. This is not optional;
it has caught real errors every time it has been run.

**One topic per file.** If a file needs "and" to describe it, split it.

**Update frontmatter `status`** when a file's state changes:
`draft` -> `agreed` -> `locked`. Locked means it is built against; changing it
requires a decision entry.

## Current state

| Area | Status |
|---|---|
| Cosmetic system | Agreed, simulated, not playtested |
| Gear + skin rosters | Awaiting selection — `docs/03-cosmetics/content/` |
| Core game loop | **Not yet specced** |
| Technical architecture | **Not yet specced** |
| Compliance | Draft, written before the genre was settled — **needs revisiting** |

## Context worth knowing

Dyes were considered as a third cosmetic axis and rejected —
`docs/decisions/0003-no-dye-axis.md`. The reasoning matters: player-controlled
recolouring breaks rarity legibility, which is a core pillar.

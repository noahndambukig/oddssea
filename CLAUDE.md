# oddssea

A social-casino / gambling-simulator game with an earned in-game currency and an
avatar cosmetic collection system as its primary currency sink.

**Specs live in `docs/`. History lives in `journal/`. Code lives in `src/`.**
Specs lead; code follows.

## Read these first

1. `docs/00-project/pillars.md` — what this project is optimising for
2. `docs/00-project/doc-conventions.md` — **the rules for editing specs; follow them**
3. `docs/00-project/spec-workflow.md` — how specs get written here
4. `docs/README.md` — index of every spec and its status
5. `docs/00-project/roadmap.md` — what is undecided right now
6. `journal/README.md` — how the journal works

## The journal — read this before doing anything else

`journal/` is an append-only record of what actually happened, and it is the
raw material for the write-up that comes later — paper, blog, whatever form it
takes. It is **completely separate from `docs/`** and the two must never be
confused:

- `docs/` = what is true now. Edited constantly. Numbers are authoritative.
- `journal/` = what happened and when. **Never edited.** Numbers are historical.

Links go one way: **journal → docs, never docs → journal.**

### Log automatically

When something significant happens or is discussed, **write the journal entry
without being asked.** Do not wait for permission and do not ask first — write
it, then tell me.

Log when:

- A design decision is made, changed or reversed
- A number in `docs/02-economy/currency-model.md` changes, or is
  validated/contradicted by a simulation
- A simulation produces a result — including a null result
- Something breaks and diagnosing it reveals something
- An approach is tried and abandoned (**type `discarded` — the most valuable
  and most easily lost**)
- A spec's status changes: draft → agreed → locked
- An open question in `docs/00-project/roadmap.md` is resolved
- Something surprising is observed — in a simulation, or later in playtests
- We discuss something at length and reach a conclusion, even if no file changed

Do **not** log: routine edits, refactors, formatting, dependency bumps, or
questions answered from existing docs. If everything is logged, nothing is
findable.

Format, types and rules are in `journal/README.md`. Entries go in
`journal/entries/YYYY-MM-DD.md`. The `/log` skill writes one correctly.

### Always tell me, on its own line

Every response where something was logged — or where something arguably should
be — ends with a line of its own, so I can scan for it and never miss anything:

```
Journal — logged [finding] Set completion tail 3x longer than assumed → journal/entries/2026-08-03.md
```

And when it is borderline and you did not log it:

```
Journal — worth logging? The pity-floor edge case we just worked around.
```

Put these last in the response, after everything else. One or two per response
at most — if there are more, the threshold for "significant" is being applied
too loosely.

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

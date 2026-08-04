# oddssea

A social-casino / gambling-simulator game. Players earn a wagerable currency
(Shells) through tasks, wagering earns the cosmetic currency (Pearls), and an
avatar cosmetic collection system is the primary sink.

**Specs live in `docs/`. History lives in `journal/`. Code lives in the npm
workspaces: `web/` (React client), `infra/` (AWS CDK), and later `api/`
(Lambda handlers).** Specs lead; code follows.

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

## Teach as you build

This project is also how I learn. Every response that makes a change — code,
spec, simulation, config — ends with a short **Learning** section: a paragraph
explaining what was just done and, more importantly, the underlying concepts
behind it. Ground it in the general idea (the pattern, the algorithm, the
trade-off, the language/tool feature), not just a restatement of the diff. The
test: after reading it, I should be able to explain *why* it was done this way
to someone else, and recognise the concept next time it appears.

- One paragraph per change or coherent group of changes; brief, not a tutorial.
- Name the concepts explicitly so I can look them up (e.g. "this is memoisation",
  "this is a foreign-key constraint", "this is regression to the mean in the
  crate simulation").
- If a change involved a choice between approaches, say what the alternative
  was and why it lost.
- Trivial mechanical edits (typo fixes, renames) don't need one.
- This is separate from the journal. The Learning section teaches me; the
  journal records project history. The `Journal —` line still goes last.

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
| Gear roster | Chosen — 11 families (`docs/decisions/0013`), `docs/03-cosmetics/content/gear-roster.md` |
| Skin roster | Chosen — 11 families, cosmic is Void Weave — `docs/03-cosmetics/content/skin-roster.md` |
| Content data | Shipped — `docs/03-cosmetics/content/data/*.json`, version 1.0.0; racers in `docs/01-game/racers.md` |
| Economy | Agreed — wager economy simulated (`docs/decisions/0005`–`0011`), **not playtested** |
| Launch game roster | Chosen — 7 games (`docs/decisions/0007`) — specs drafted, `docs/01-game/game-modes.md` |
| Core game loop | Drafted — `docs/01-game/` (core-loop + tasks), awaiting review |
| Platform + hosting | Agreed — web-first PWA on AWS, `docs/04-technical/` |
| Deployment skeleton | Increment A built (`web/`, `infra/`, CI/CD) — **first deploy pending**; walkthrough in `infra/README.md` |
| Data model | Drafted — `docs/04-technical/data-model.md` (`decisions/0015`), awaiting review |
| Compliance | Agreed — no-real-money wall, v1 posture (`docs/06-risks/compliance.md`) |

## Context worth knowing

Dyes were considered as a third cosmetic axis and rejected —
`docs/decisions/0003-no-dye-axis.md`. The reasoning matters: player-controlled
recolouring breaks rarity legibility, which is a core pillar.

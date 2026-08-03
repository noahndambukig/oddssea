# Journal

Append-only record of what actually happened while building this project.

Raw material for the write-up that comes later — paper, blog post, whatever
form it takes. Not a spec, not documentation, and **not part of `docs/`**.

## Why this is separate from `docs/`

They answer different questions and mixing them destroys both.

| | `docs/` | `journal/` |
|---|---|---|
| Answers | What is true now | What happened, and when |
| Edited? | Constantly — it tracks current truth | **Never.** Append only |
| Numbers | Authoritative (`docs/02-economy/currency-model.md`) | Historical record of what a number *was* |
| Audience | Someone building the thing | Someone writing about the thing |

`docs/` deliberately destroys history — when a crate price changes, you edit
`currency-model.md` and the old value is gone. That is correct for a spec and
useless for a write-up. This folder is where the old value, the reason it
changed, and the simulation that forced it all survive.

**Links go one way only: journal → docs. Never docs → journal.** The specs must
stay readable without this folder, and nothing in `docs/` may depend on an
entry here.

`docs/decisions/` stays authoritative for *why a design choice was made* — it
is cross-referenced throughout the spec tree. Journal entries about a decision
**link to the decision entry rather than restating it**, and add what the
decision entry deliberately omits: what it felt like, what else was on the
table, what nearly happened.

## Format

One file per day: `journal/entries/YYYY-MM-DD.md`. Multiple entries per file.

```markdown
## 14:20 — finding — Set completion tail 3x longer than assumed

**What happened:** Re-ran set-completion.py after the pity change. Median
completion time is fine, but the 95th percentile takes ~3x the sessions the
crate spec assumed when the set sizes were chosen.

**Why it matters:** Either pity tightens or the last-piece experience is
miserable for one player in twenty — and that trade is exactly the open
question flagged in the crates spec.

**Refs:** `docs/03-cosmetics/crates.md`, `docs/02-economy/simulations/README.md`
```

### Types

| Type | For |
|---|---|
| `decision` | A choice was made or reversed. Links to the decision entry if one exists |
| `finding` | An empirical result — a simulation output, a measurement, a playtest outcome |
| `incident` | Something broke, and what diagnosing it revealed |
| `discarded` | An approach tried and abandoned |
| `observation` | Something surprising or qualitative, with no number attached yet |
| `milestone` | A build-order phase shipped, a spec tree completed, a roster locked |

**`discarded` is the most valuable type and the one always lost.** Papers and
blog posts are written from what worked, which makes the work look far more
linear than it was. The approach that failed for an interesting reason is
usually the better story, and it is unrecoverable three months later.

## Rules

1. **Append only.** Never edit or delete a past entry. If something recorded
   turns out to be wrong, write a new entry saying so and link back. The
   append-only ethos of `docs/decisions/` applies here too — a journal quietly
   rewritten to match how things turned out is worth nothing as evidence.

2. **Record the number as it was.** Including the wrong ones. "We assumed the
   95th percentile was fine" is the interesting part of the story.

3. **Timestamp and attribute.** Every entry gets a time. Anything tied to a
   simulation gets the commit hash of the scripts that produced it, so a
   finding can be traced to exactly what generated it.

4. **Link to specs, don't restate them.** An entry that duplicates a spec will
   be wrong within a month and there is no one-home-per-number protection here.

5. **Write it at the time.** An entry written a week later is a reconstruction.
   The details worth having — the wrong assumption, the thing that looked
   broken but wasn't — are gone within hours.

6. **Uncertainty is content.** "No idea why this works" is a legitimate and
   useful entry. Do not tidy it into false confidence.

## What does not belong here

Routine file edits, refactors, formatting, dependency bumps, and questions
answered from existing docs. If everything is logged, nothing is findable, and
the folder stops being minable for the one thing it exists for.

## Writing from this later

Entries are typed and dated, so the material sorts itself:

- `grep '— discarded —'` → the "what we tried" section, and the best blog post
  in here
- `grep '— finding —'` → simulation and playtest results, in the order they
  were actually discovered
- `grep '— incident —'` → the honest caveats
- `grep '— decision —'` → the narrative spine, cross-referenced to
  `docs/decisions/`

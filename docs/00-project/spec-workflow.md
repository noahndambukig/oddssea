---
status: agreed
purpose: How specs get written in this repo, so the process survives memory loss on both sides.
---

# Spec Workflow

Claude starts every session with no memory of the last one. This file, plus
`CLAUDE.md`, is what makes that a non-issue: the process lives in the repo
rather than in anyone's head.

## Where to do the work

**Claude Code, in the repo, for anything that touches files.** It reads the
whole tree, edits in place, runs the simulations, and makes commits. No
uploading, no downloading, no copy-paste. Install it once and run `claude` from
the repo root.

**Cowork for thinking, research and non-repo deliverables** — brainstorming
before a spec exists, competitive research, building a deck or spreadsheet for
someone else. With this repo folder connected in the desktop app, Cowork can
edit the files too, though it cannot push: the bridge to the local machine has
no network access, so commits happen from your side or from Claude Code.

The split in practice: **ideate in Cowork, write in Claude Code.** The messy
divergent half of designing a system is conversational; the "now edit 33 files
consistently" half is not.

## The three-pass rhythm

This is the part that matters most. Every spec goes through three passes, and
they should not be collapsed into one.

**Pass 1 — talk, write nothing.** Bounce ideas, argue, converge on the shape.
No files. Ending this pass early is the most common way to get a spec that
looks finished and is subtly wrong.

**Pass 2 — write the spec.** One file, or one tight cluster of files. Follow
`_templates/spec-template.md`.

**Pass 3 — verify, adversarially.** Simulate any numbers. Grep the other specs
for contradictions. Check that no figure has been restated instead of linked.
Ask explicitly: *what in here is wrong?*

Pass 3 is not ceremony. On the cosmetics spec it caught a set-completion time
that locked casual players out of every season, an earn-rate estimate that was
40% low, and a retirement policy that would have generated more resentment than
prestige. All three would have shipped.

## Scoping a session

**One spec per session.** "Write `docs/01-game/core-loop.md`" produces a far
better document than "flesh out the docs", and costs less.

Good opening prompts:

- *"Read CLAUDE.md and docs/README.md, then let's talk through the core game loop. Don't write anything yet."*
- *"Write docs/04-technical/data-model.md from the cosmetics specs. Follow the template."*
- *"Read every spec and find contradictions between them. Report, don't fix."*

That last one deserves its own session every few weeks. Cross-spec drift is
invisible until you go looking, and it is cheap to find.

## Committing

**One commit per spec, not per session.** The message records the decision,
not the activity:

```
Lock headgear roster; drop set crate to 900 for casual reachability
```

not

```
Update docs
```

Six months from now `git log` is how you reconstruct why the economy looks the
way it does. Write for that reader.

## When code arrives

Add `implemented-by:` to the spec's frontmatter pointing at the module, and
link back from the module. When a spec and its code disagree, one of them is a
bug — the frontmatter link is what makes that checkable.

---
name: log
description: Write an entry to the project journal at journal/entries/YYYY-MM-DD.md. Use when the user says "/log", "log this", "journal this", "add that to the journal", or when something significant happens that CLAUDE.md says should be logged automatically — a decision, a finding, an incident, a discarded approach, an observation or a milestone.
---

# Log a journal entry

Appends to `journal/entries/YYYY-MM-DD.md`. The journal is append-only raw
material for the eventual write-up — see `journal/README.md` for the full
rules.

## Before writing

**Get today's real date and time.** Do not infer them from context or from
other entries.

```bash
date +"%Y-%m-%d %H:%M"
```

**Find the file.** `journal/entries/<today>.md`. If it does not exist, create
it with a single `# YYYY-MM-DD` heading, then append. If it does exist,
**append to the end — never edit or reorder what is already there.**

**Attribute it.** If the entry relates to a simulation run or to code, get the
commit hash (`git rev-parse --short HEAD`) and include it. A finding that
cannot be traced to what produced it is much less useful later.

## Choosing the type

One of: `decision`, `finding`, `incident`, `discarded`, `observation`,
`milestone`. Definitions in `journal/README.md`.

When torn between `decision` and `finding`: a finding is something the world
told you, a decision is something you chose. If a simulation forced a choice,
that is usually two entries — or one `finding` with the decision as a
consequence.

**Reach for `discarded` more than feels natural.** An abandoned approach is the
type most worth having later and the one that never gets written down, because
at the time it feels like failure rather than material.

## Format

```markdown
## HH:MM — <type> — <specific title>

**What happened:** What was done, decided or observed. Concrete. Include the
actual numbers, commands and outputs — not a summary of them.

**Why it matters:** The consequence. What changes, what is now blocked or
unblocked, what this means for the write-up.

**Refs:** `docs/...` paths, decision entries, commit hash.
```

`Why it matters` may be dropped when the entry genuinely has no consequence yet
— an `observation` often does not. Do not invent one.

## Rules

- **Append only.** Never edit or delete an existing entry. If something
  recorded earlier turns out to be wrong, write a *new* entry saying so and
  link back to it by time and date.
- **Record numbers as they were**, including wrong ones. The superseded value
  is the interesting part of the story.
- **Link to specs, do not restate them.** `docs/` is authoritative for what is
  true now; the journal is authoritative for what happened.
- **Never write into `docs/` from this skill.** If an entry implies a spec
  should change, say so in the response and let the user decide — the two trees
  stay separate. The only exception is when the user explicitly asks for both.
- **Titles are specific.** "Set completion tail 3x longer than assumed", not
  "Simulation update". Titles are what makes the journal minable later.
- **Preserve uncertainty.** "No idea why this works" is a legitimate entry. Do
  not tidy it into false confidence.

## After writing

End the response with the notification line on its own, as required by
`CLAUDE.md`:

```
Journal — logged [<type>] <title> → journal/entries/<date>.md
```

## If invoked with no argument

Look at what the session has actually done and propose the entry — type, title
and body — then write it. Do not ask the user to supply the content they just
spent the session producing.

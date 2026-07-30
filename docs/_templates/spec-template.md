---
status: draft          # draft | agreed | locked | superseded
owner:
updated: YYYY-MM-DD
purpose: One sentence. If it needs "and", split the file.
depends-on:            # paths to specs this one assumes
implemented-by:        # paths to code, once code exists
---

# <Title>

## What this is

Two or three sentences. What problem does this solve, and for whom.

## How it works

The substance. Tables for anything enumerable. Prose for anything with
reasoning behind it — a bullet list of decisions loses the *why*, and the why
is what stops the decision being relitigated in three months.

## Rules

The non-negotiable constraints, stated plainly enough that someone can check
an implementation against them.

## What this deliberately does not do

Scope boundaries. Cheaper to write now than to argue about later.

## Open questions

Anything undecided, and what it blocks. These roll up into
`00-project/roadmap.md`.

## Numbers

If this spec involves figures, they live in `02-economy/currency-model.md`.
Link to them here rather than restating them.

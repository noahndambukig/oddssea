---
status: agreed
purpose: The rules that keep this docs tree navigable as it grows.
---

# Doc Conventions

Six rules. They exist because design docs fail in predictable ways, and each rule blocks one of those failures.

## 1. One file, one sentence of purpose

Every file opens with a frontmatter block stating what it is for. If you cannot write that sentence without using "and", the file is doing two jobs and should be split.

```
---
status: draft | agreed | locked | superseded
owner: name
updated: YYYY-MM-DD
purpose: One sentence.
depends-on: path/to/other.md
---
```

`locked` means the numbers are in the build and changing them requires a decision entry.

## 2. Every number lives in exactly one file

This is the most important rule here. When a price appears in four documents, three of them will be wrong within a month, and nobody will know which one the engineer read.

Numbers live in `02-economy/`. Everywhere else **links** to them rather than restating them. If you catch yourself typing a figure into a systems doc, replace it with a pointer.

## 3. Numbered folders, unnumbered files

Folders are numbered so the reading order is meaningful and stable in any file browser. Files inside are named for their topic, because they get renamed and reordered far more often.

## 4. Separate stable from volatile

`01-systems` should change rarely — it describes how things work. `03-content` changes constantly — it lists what exists. Mixing the two means every content addition touches a systems doc, and the systems docs stop feeling authoritative.

## 5. Decisions are append-only

When something is decided — especially when something is *reversed* — write a dated entry in `decisions/`. Never quietly edit the old text to match the new reality. Six months from now somebody will ask "why don't we have dyes?" and the answer needs to exist somewhere. Rationale that lives only in someone's head gets relitigated every quarter.

## 6. Catalogue data graduates to machine-readable

Markdown tables are the right format for *deciding* what the catalogue contains. They are the wrong format for *shipping* it.

Once the gear and skin rosters are locked, move them to `03-cosmetics/content/data/*.json` and have both the game and the docs read from that file. A markdown table and a game database will drift apart; a generated table cannot. Until the roster is locked, markdown is fine — do not build the pipeline before the content exists.

## Where things go when you're unsure

| You're writing about... | It goes in |
|---|---|
| How a mechanic behaves | `03-cosmetics/` |
| What something costs | `02-economy/` |
| A specific item or set | `03-cosmetics/content/` |
| How art gets made | `04-production/` |
| When something ships | `00-project/roadmap.md` |
| Why we chose X over Y | `decisions/` |

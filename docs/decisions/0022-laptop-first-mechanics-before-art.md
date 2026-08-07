---
date: 2026-08-07
status: accepted
supersedes: the mobile-first rules in 04-technical/platform.md
---

# 0022 — Laptop-first, and mechanics before art

**Decision (Noah, 2026-08-07):** Two related reprioritisations of
presentation, made together before the crates milestone.

1. **The laptop is the primary target.** Screens are designed for desktop
   and must remain *usable* on a phone — the reverse of `platform.md`'s
   "designed for a ~375px portrait phone first and expanded for desktop —
   never the reverse". Phone-viewable is still a requirement; phone-first
   is not.
2. **Mechanics ship before art.** Until the mechanics of the game are
   complete, the UI stays deliberately barebones — buttons, text, lists.
   No reveal ceremonies, no PixiJS surfaces, no visual polish. Art begins
   as its own phase once the mechanics work end to end.

**Why:**

*Laptop-first.* Phone-first design is expensive — every screen needs a
second layout pass, bottom sheets instead of panels, tab bars instead of
sidebars — and v1 is a website whose primary visitors will arrive on a
laptop. The original rule bought quality for a mobile audience this project
does not yet have, at a cost paid on every screen. The PWA layer, the
store-wrap path and the no-hover caution all survive; what changes is which
form factor drives the design and which merely has to work.

*Mechanics before art.* The build so far has repeatedly shown that the
mechanics are where the real risk lives (the ledger milestone's ten
execution-found bugs, none of them visual). A barebones UI makes each
milestone smaller, keeps verification focused on behaviour, and means the
art phase starts against a finished, stable game rather than a moving one.
This also sequences the ~220–380h art track (`05-production/asset-budget.md`)
as a distinct phase instead of a per-milestone tax.

**What this does NOT change:**

- The 8-animated-avatar load test still runs on a low-end phone
  (`06-risks/compliance.md`) — phones remain supported, so the budget
  still binds there.
- Server-side authority, the economy rules, and every data-model
  invariant are untouched.
- Touch targets and no-hover interactions remain constraints for the
  phone-usable pass, demoted from design drivers to checks.

**Consequences:** `platform.md` rewritten accordingly (same status,
`agreed`). Milestones from crates onward are planned barebones-first; the
art phase is scheduled after mechanics completion rather than alongside it.

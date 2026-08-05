---
date: 2026-08-05
status: accepted
---

# 0019 — Pass 3 on the game specs: the faucet was overstated, and the simulations were not reproducible

**Decision:** The four remaining draft specs (`core-loop`, `tasks`,
`game-modes`, `racers`) move draft → agreed after adversarial
verification, with seven substantive changes:

1. **The committed earn rate is 3,400 Shells/week (~486/day)**, derived
   from the task table rather than estimated. It read ~3,550/week
   (~500/day), and `bankroll.py` used a third figure.
2. **Every simulation carries a fixed seed**, and `bankroll.py` runs
   before `crate-game.py`, which takes its crates/week and Pearl income
   as chained constants.
3. **The login streak caps on day 6**, at the value the currency model
   already stated; `tasks.md` said day 7 and was wrong.
4. **Weeks start Monday 00:00 UTC**, completing `decisions/0018`, which
   settled days but not weeks.
5. **Task completion targets exist**, in the currency model.
6. **The onboarding grant is three Basic crates**, named in the currency
   model — matching the window `crates.md`'s first-session guarantee
   already covers.
7. **`racers.json` now matches the prose**: Sure Thing carries the
   highest base weight, and Second Wind the second-highest drift. The
   file moves to **content version 1.1.0** — `data-model.md` makes the
   catalogue immutable per version, and although no roll has been logged
   against 1.0.0 (no database exists yet), following the rule while it is
   free is the point of having it.

**Why:**

*The earn rate.* Pricing `tasks.md`'s structure with the currency model's
own figures gives 550 login + 175 first-bet + 1,575 dailies + 1,100
weeklies = 3,400/week. The casual profile reconciled to 1,400 exactly;
committed did not reconcile to anything. That asymmetry is the evidence —
one profile was computed and the other was estimated, and the round
numbers (500/day, ~3,550/week) are what estimation looks like. Correcting
it moved every committed simulation figure down 2–3% and changed no design
conclusion: destruction still lands near 1.0, busts stay at zero under
typical sizing, set completion holds its 3-week median.

*The seeds.* This is the more serious finding. No simulation set a seed,
so re-running `bankroll.py` moved committed crates/week across a 54.0–58.1
range — ±4%, larger than most real changes. The project's own working rule
is "re-run simulations before changing an economy number, then update the
results of record"; without a seed that rule cannot detect a change, and
the results-of-record table could not be verified by anyone, which is the
only thing such a table is for. A fixed seed bakes one sample's luck into
the headline figures; that is an acceptable trade for a reference table
and a bad one for a proof, and these are reference figures.

*The week.* `decisions/0018` made days UTC and stopped there. Weekly
tasks, weekly caps and the weekly draw all need a start day, and the draw
is one shared pot with one deadline, so it cannot be per-player. Monday is
ISO-8601 and every date library's default; any other choice is an explicit
offset in every calculation, forever.

*The racer data.* `racers.md` called Sure Thing "the favourite" while
`racers.json` gave Riptide the higher base weight — so the odds board
would have contradicted the roster's own description on most race days.
The prose is the design intent and the data was adjustable, so the data
moved. The archetypes are now defined by a parameter rather than by
assertion: anchors are lowest volatility, chaos is highest volatility,
cyclical is highest drift, and membership is checkable against the file.

**Also fixed, mechanically:** four figures restated in `game-modes.md`
(crash cap, pot split, house-match multiplier, roster size) and one in
`racers.md`, against `doc-conventions` rule 2 — `game-modes.md` declared
in its own Numbers section that those live in the currency model, then
restated them; the referral ladder moved to the currency model; both
`core-loop.md` and `tasks.md` still described figures as "pending the
bankroll-ruin simulation" that ran two days earlier; `core-loop.md`
claimed every interval lived in the currency model, where no interval
lives — game timings are mechanics and stay in `game-modes.md`; and
missing template sections were added, `racers.md` having had only *Design
notes*.

**Consequences:** every game spec is now `agreed`, so the ledger milestone
has no draft dependencies. `CLAUDE.md`'s working-rules block was pointing
at the two simulations the README marks **Historical** while omitting the
two that produce every current number — corrected.

**Provenance:** Pass 3 adversarial verification (`spec-workflow.md`),
2026-08-05, immediately after the same pass on `data-model.md`
(`decisions/0018`). Sixteen findings, all resolved.

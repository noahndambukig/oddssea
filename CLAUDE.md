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
python docs/02-economy/simulations/bankroll.py     # run first — the other chains off it
python docs/02-economy/simulations/crate-game.py
```

Every simulation is **seeded**, so a re-run reproduces the results of
record exactly and any difference is a real change. `set-completion.py`
and `crate-rates.py` are historical (pre-revamp coin economy) and produce
no current figure — this block named those two until `decisions/0019`.

**Verify before declaring done.** Every spec session ends with a verification
pass — simulate the numbers, grep for contradictions against existing specs,
confirm nothing restates a figure that lives elsewhere. This is not optional;
it has caught real errors every time it has been run.

**One topic per file.** If a file needs "and" to describe it, split it.

**Clean up tooling artefacts when finished.** Anything a tool writes into the
repo as a side effect of *doing* the work — never as the work itself — is
deleted in the same session that created it. Browser automation is the usual
offender: Playwright MCP drops `.playwright-mcp/` (console logs, page
snapshots) and screenshots wherever it is pointed. Close the browser, stop any
dev server that was started for it, and remove the files. Do not gitignore them
instead — an ignore rule makes the mess permanent and invisible, whereas the
files are evidence for exactly one session and worthless after it. If something
a tool produced genuinely matters, it earns a real home in `docs/` or
`journal/` under its own name.

**Update frontmatter `status`** when a file's state changes:
`draft` -> `agreed` -> `locked`. Locked means it is built against; changing it
requires a decision entry.

## Current state

| Area | Status |
|---|---|
| Cosmetic system | Agreed, simulated, not playtested |
| Gear roster | Chosen — 11 families (`docs/decisions/0013`), `docs/03-cosmetics/content/gear-roster.md` |
| Skin roster | Chosen — 11 families, cosmic is Void Weave — `docs/03-cosmetics/content/skin-roster.md` |
| Content data | Shipped — `docs/03-cosmetics/content/data/*.json` at 1.0.0, `racers.json` at **1.1.0** (`decisions/0019`); racers in `docs/01-game/racers.md` |
| Economy | Agreed — wager economy simulated and **seeded/reproducible** (`docs/decisions/0005`–`0011`, `0019`), **not playtested** |
| Launch game roster | **Agreed** — 7 games (`docs/decisions/0007`), Pass 3 verified (`docs/decisions/0019`) |
| Core game loop | **Agreed** — `docs/01-game/` (core-loop, tasks, game-modes, racers) all Pass 3 verified (`docs/decisions/0019`) |
| Platform + hosting | Agreed — web-first PWA on AWS, **laptop-first, barebones UI until mechanics complete** (`docs/decisions/0022`), `docs/04-technical/` |
| Deployment skeleton | **Complete — A, B and C live and verified.** oddssea.xyz on keyless CI/CD; Cognito login on auth.oddssea.xyz; api.oddssea.xyz with a JWT-guarded API. Branding deferred to late polish |
| Ledger milestone | **LIVE** — real Shell/Pearl balances on Aurora Serverless v2 (scale-to-zero, Data API), a backend-for-frontend, and every write behind a `SECURITY DEFINER` function (`decisions/0020`, `0021`). Verified in production over 32 economic events: balances match the ledger sum, and `UPDATE ledger_entries` as the app role is `permission denied`. Walkthrough Part 8 in `infra/README.md` |
| Crates milestone | **LIVE and verified** — all five crate kinds, starter grant (SQL-gated), barebones dex with transactional page/set bonuses, four pity mechanisms, full-draw audit trail (`decisions/0023`). Node pre-rolls, `open_crate()` decides under the lock; 006 retrofits the 003 idempotency race and 007 closes the PUBLIC-execute hole the adversarial suite caught. Harness 32/32 pre-deploy; production suite 37/37 on a dedicated test player (concurrency, drought boundary, append-only). PR #10. Walkthrough Part 9 |
| Tasks milestone | **LIVE and verified** — the faucet: first-bet-of-day, 2-challenge shared stateless draw (`available_from`-frozen), consistency + volume weeklies, tour chain, first dice bet (`decisions/0024` — interim ≈2,575/wk vs spec 3,400, bust-proof waiver recorded). Zero new tables; progress derived, never stored; numbers via `docs/01-game/data/tasks.json`. Draw harness 10/10. Walkthrough Part 10 |
| Closet milestone | **LIVE and verified** — barebones equipping: `loadouts` (instance refs, preset-ready keys), `set_equipment` (no idempotency key — naturally idempotent, non-economic), `first_equipped_at` as event evidence, 4-step tour with the equip step, `first_equip` feature-first (`decisions/0025`). 009 is expand-only; **migration 010 (chain contract) is a forward obligation opening the NEXT milestone's branch**. Two-event UI bus. Walkthrough Part 11 |
| Plinko milestone | **LIVE and verified** — the second game: three derived multiplier tables (exact RTPs 97.0703/97.0889/97.1521%, `decisions/0027`) with a load-time RTP-recompute tripwire; `bit_count` bucket derivation; the win-a-bet predicate fixed to `payout > stake`; migration 010 (tour-chain contract) paid; `challenge:play_two_games` dated 2026-08-09 grows the draw to 3. Games harness 14/14. Walkthrough Part 12 |
| Crash milestone | **LIVE and verified** — the first shared round (`decisions/0028`): time-indexed lazy rounds (round = UTC minute, bust = HMAC(secret, index) through `P(B≥m)=0.97/m`, uniform exact 97.00% multiplier RTP, whole-Shell floor published); both cash-out verbs, ties pay; decided-not-elapsed settlement; keyless settle with derived-state response; CrashRoundSecret RETAINed; ~1 s flight poll is the feed. Migration 012; harness 40/40 (analytic tail); production suite 44 checks green — it reads the secret and PLANS rounds; 2 handler-seam defects found and fixed (positional params, rule allow-list). PR #15. Walkthrough Part 13 |
| Roulette milestone | **LIVE and verified** — the shared table (`decisions/0029`): 40 s rounds on the 0028 doctrine, pocket exactly 1/37 by deterministic rejection, domain-separated under the shared secret; full standard bet matrix from a derived layout registry; `payout × coverage = 36` load-checked; **one authority clock** (the round view runs on Postgres's now() — Codex caught the reveal/close skew exploit); many bets one outcome; `settle_round_bet` extraction (forward-only, waiting for races); time-based settle window. Migration 013; harness 58/58; production suite 37/37 with deterministic exact payouts planned from the secret; **zero code defects** (both crash lessons held; the first run's 2 fails were the fixture tripping over the defensive settle working). PR #16. Walkthrough Part 14 |
| Data model | **Agreed** — `docs/04-technical/data-model.md`; Pass 3 found 11 issues, 4 that would have shipped broken (`decisions/0015`, `0018`) |
| Compliance | Agreed — no-real-money wall, v1 posture (`docs/06-risks/compliance.md`) |

## Context worth knowing

Dyes were considered as a third cosmetic axis and rejected —
`docs/decisions/0003-no-dye-axis.md`. The reasoning matters: player-controlled
recolouring breaks rarity legibility, which is a core pillar.

---
date: 2026-08-07
status: accepted
relates-to: 0005, 0008, 0019, 0022, 0023
---

# 0024 — The tasks milestone: interim scope of a priced structure

**Decision (Noah + review, 2026-08-07):** Ship every task `tasks.md`
supports with the features that exist today, and record precisely how the
interim state differs from the full structure. Four scope calls (Noah),
one derivation, one waiver. Three Codex review rounds (13 findings, all
applied) preceded the build.

1. **The daily draw is 2/day, honestly.** Only `place N bets` and
   `win a bet` are buildable — races, closets and a second game do not
   exist. The draw takes what the pool supports rather than padding with
   same-category variants; it grows to 3 automatically as deferred pool
   entries land with their features.

2. **The draw is shared and stateless.** Every player sees the same slate
   on a UTC date because the slate is a pure function of the date
   (hash-seeded selection) — no stored rolls, no per-player table. Each
   pool entry carries `available_from` and the draw filters on it, so a
   deploy cannot reshuffle a day in progress; **pool additions ship
   effective ≥ deploy day + 2**, closing the realistic rollback window
   before activation.

3. **Weekly volume ships at 100 bets with the 4-games clause waived**
   until the roster milestone provides a fourth game. Full payout — the
   target that makes it multi-game arrives with the games.

4. **The tour ships its 3 buildable steps** (economy intro → starter
   crates → first bet, as a server-enforced chain); the equip and race
   steps append in their milestones, completing the 400-Shell chain.

5. **Derived, not chosen — the "daily set"**: a qualifying day for the
   consistency weekly is a `login` claim + a `first_bet` claim + **≥2**
   challenge claims, all that UTC day. `currency-model.md`'s own casual
   arithmetic (4 × [50 + 25 + 2×75] + 500 = 1,400/week) is inconsistent
   with any stricter definition.

6. **Waiver — the bust-proof rule runs partial.** `tasks.md` rule 1
   funds a busted day through the login claim *plus zero-Shell pool
   tasks*; those tasks (attend races, visit a closet) are deferred with
   their features. Until they land, a player who busts after claiming
   login has no same-day Shell recovery. Accepted, temporary, revisited
   when races/closets ship — recorded here rather than discovered in a
   playtest.

**Consequences:** Committed interim faucet ≈ 2,575 Shells/week vs the
full-spec 3,400 (`currency-model.md`). **No number changes anywhere and
no sim re-runs** — partial rollout of a priced structure is not a spec
change; the reference earn rates continue to describe the full structure.
Numbers reach the runtime via a new shipping copy
(`docs/01-game/data/tasks.json`, 1.0.0) as function parameters, the
crates precedent. No new tables: `bets` is the evidence, `task_claims`
and `one_time_claims` are the records, and progress is derived by
counting, never stored.

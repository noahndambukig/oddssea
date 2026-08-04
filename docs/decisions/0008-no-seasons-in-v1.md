---
date: 2026-08-03
status: accepted
---

# 0008 — No seasons in v1

**Decision:** The season construct is cut from v1 entirely. No season pass,
no seasonal sets, no rotation, no season-scoped anything. The longest
rhythm in the launch game is the week (weekly tasks, the weekly lottery
draw). Launch cosmetic sets are a permanent pool. Seasons are deferred, not
rejected — they return post-v1 when there is a live game to pace.

**Why:** Scope. Seasons were inherited from the pre-revamp economy and
everything about them — length, rotation cadence, vault returns, season
badges, a pass track — is machinery for pacing a game that does not exist
yet. Building it before launch means tuning it blind. A weekly cadence
delivers the retention rhythm v1 needs at a fraction of the complexity.

**Consequence:** Several things quietly assumed seasons and now need
reframing when their specs are rewritten:

- `02-economy/currency-model.md`'s set-completion targets were expressed as
  "fits inside an 8-week season" — the pacing targets survive, the deadline
  framing does not.
- `03-cosmetics/crates.md`'s Set Crate "only contains pieces from the
  currently active set" — with a permanent pool there is no active set; the
  crate needs a new targeting rule (player-chosen vs rotating spotlight) —
  now roadmap question 3.
- `02-economy/guardrails.md` rule 2 leaned on seasonal rotation for sink
  capacity, and rule 3 (vault returns, season badges) is deferred wholesale.
- The task faucet has no season-pass track; weekly is the top of the
  cadence hierarchy.

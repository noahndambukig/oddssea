---
date: 2026-08-03
status: accepted
supersedes: 0004-dust-is-a-closed-loop.md
---

# 0005 — Wagering earns the cosmetic currency; dust is removed

**Decision:** The economy is rebuilt around two currencies named **Shells**
and **Pearls**. Shells are earned through tasks and are the only wagerable
currency; a winning bet returns odds × stake in Shells. Pearls are earned
**exclusively through wagering** — scaled to stake and odds, more for wins
than losses — and are what buy crates and cosmetics. Dust is removed
entirely.

Consequential sub-decisions, made together:

- **Pearl rewards are stake-proportional and odds-scaled** (win ∝ stake ×
  odds, loss consolation ∝ stake), never flat per bet — otherwise
  minimum-stake favourite-grinding becomes the dominant strategy.
- **Duplicate salvage pays Pearls** at a deliberately lossy ratio.
- **Set completion pays a one-time Shell bonus**, never a recurring stipend.
  Ongoing veteran rewards are deferred, not rejected.
- **The marketplace trades in Pearls only.** A Shell marketplace would let
  crate luck convert into bankroll.

**Why:** The project is a gambling simulator, but the previous economy was
written for a flat-payout match game: cosmetics were bought with the same
currency players would wager, and dust existed only to contain collection
rewards. Making the cosmetic currency wager-exclusive turns gambling into
the engine of the collection game rather than a sibling to it — and because
losing bets still pay a little, a losing streak drains bankroll without ever
halting collection progress, which is a pity mechanism the old design needed
separate machinery for.

The one-time completion bonus (rather than the per-day stipend initially
considered) is what keeps this safe: a per-day reward on a
never-decreasing set count is a perpetuity that compounds through the core
loop (sets → Shells/day → handle → Pearls → crates → sets) and eventually
dwarfs the task faucet for veterans.

**Consequence:** `02-economy/dust.md` is superseded. `currency-model.md`
and `guardrails.md` must be rewritten around the new structural identity —
house edge is now the Shell sink, and lifetime handle ≈ task income ÷ house
edge, which is what sizes Pearl income and crate prices. A bankroll-ruin
simulation replaces set-completion as the core simulation, and a comeback
floor (task income guaranteeing a minimum number of bets) is required so
that a busted bankroll cannot lock a player out of the entire game. What
visitor tips pay is now an open question — see `00-project/roadmap.md`.

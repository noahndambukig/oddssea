---
status: agreed — v1 posture; requires legal review before any real-money path or store submission
purpose: Regulatory and operational risks of a gambling simulator, and the wall that keeps them small.
depends-on: ../decisions/0005-wagering-earns-the-cosmetic-currency.md, ../decisions/0014-lottery-house-match.md
---

# Compliance and Risk

## The wall: no real money, in any direction

**v1 has no real-money path at all.** Shells are earned only. Pearls come
only from wagering Shells. Nothing is purchasable, nothing cashes out,
and no item, currency or account has a sanctioned monetary value.

This single wall is what keeps a gambling simulator out of gambling
regulation in most jurisdictions: the legal tests generally require
money in (consideration) or money out (a prize of value), and v1 has
neither. It is also what distinguishes us from the social-casino
lawsuits (the *Big Fish Casino* line of cases): those turned on
players *buying* chips — purchased virtual chips were held to be a
"thing of value." Our chips cannot be bought, which is precisely the
fact pattern those cases lacked.

**Adding any purchase path — even direct cosmetic sales — tears the
wall down** and converts crates into paid loot boxes (odds-disclosure
laws, minors restrictions, some outright bans) and the game into a
candidate for real-money gambling analysis. Doing so requires a decision
entry *and* legal advice first, in that order. This resolves the old
roadmap question 5 for v1: Shells are never purchasable; post-v1 is a
separate decision.

## Age and content rating

Simulated gambling is age-restricted content regardless of the wall:
expect **17+ on Apple and 18+ under IARC in several regions**, and some
jurisdictions restrict the category entirely. Posture:

- **Self-imposed 18+ age attestation at signup**, from day one on the
  web. It costs one screen, matches the rating the stores will apply
  anyway, and is the responsible default for the genre.
- Store submission (post-v1, via the Capacitor wrap —
  `../04-technical/platform.md`) fills the IARC/Apple questionnaires
  honestly as simulated gambling; expect a small list of excluded
  storefronts and treat it as the cost of the genre, not a problem to
  engineer around.
- No marketing that targets minors; no ad placements in child-directed
  contexts.

## Crates, odds and disclosure

Because no crate is ever bought with money, loot-box statutes generally
do not attach. **Disclose everything anyway** — drop tables, pity
counters, effective rates, race overround, the lottery match — because
it is already the design's rule (`../03-cosmetics/crates.md`,
`../01-game/game-modes.md`) and because a paper trail of good-faith
transparency is the cheapest possible insurance if the regulatory
weather changes. Every crate roll and bet settlement is already logged
server-side (`../04-technical/hosting.md`); keep those logs auditable.

## Trading is the leak in the wall

The marketplace (Pearls-only, burn on every sale) is where off-platform
real-money trading will try to grow: rare items with visible scarcity
invite cash sales of accounts and items *outside* the game, which is
how "skins gambling" scandals started. Mitigations, all already in the
design or cheap to add:

- Ship trading late (build order phase 3) and with the burn.
- Restrict trade to higher tiers so a bot economy in Commons never
  starts.
- **No cash-out, ever, including "gifting" flows that simulate one.**
- Account trading prohibited in the ToS; provenance display on Mythics
  makes laundered ownership visible.
- **Mythics are tradeable** (`../decisions/0016`) — decided against this
  document's recommendation, with eyes open. A tradeable one-of-one is
  the single strongest RMT magnet the game can create. The accepted
  mitigations: site-wide sale announcements, permanent public
  provenance including prices paid, a re-listing cooling-off window,
  ToS prohibition on account trading, and a **platform-wide
  Mythic-listing suspension switch that must exist in the code from
  launch**. Mythic transfers are the highest-priority signal to monitor
  for off-platform cash trading.

## Our own risky patterns, named honestly

These mechanics are fine behind the wall, and are listed so nobody
rediscovers them as surprises:

- **Loss consolation Pearls** (`decisions/0005`) are structurally a
  loss-rebate — an inducement pattern regulators watch in real
  gambling. Harmless without money; keep it proportionate to stake.
- **The +EV lottery** (`decisions/0014`) is a free-play inducement.
  The per-player ticket caps are its compliance boundary as much as its
  economic one.
- **Referral rewards for joining a gambling simulator** are
  milestone-gated (`../01-game/tasks.md`) — keep them gated, and keep
  referral marketing away from minors.
- **Streaks and daily tasks are habit mechanics.** v1 carries no legal
  duty here, but cheap responsible-play gestures — a session-length
  reminder, an optional self-set daily wager cap — are on the post-v1
  list and would be read favourably in any future review.

## Operational risks

- **The 8-animated-avatar cap needs load testing on a low-end phone
  before Phase 2 ships** — on mobile browsers, not desktop
  (`../04-technical/platform.md`).
- **Salvage is irreversible and players will misclick it.**
  Confirmations at Legendary and above, a short undo window, and the
  bulk-salvage UI must not make bulk mistakes easy.
- **Lottery pot integrity is a headline risk**: the pot is displayed
  site-wide, so a settlement bug is a public event. Pot accounting is
  ledger-native and reconciled per draw.
- **Retired content returns** (`../02-economy/guardrails.md`) — vault
  rotation, never permanent exclusion.

## Numbers

None live here. Ticket caps, taxes and burns are in
`../02-economy/currency-model.md`.

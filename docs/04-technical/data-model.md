---
status: draft
purpose: The persistent data the game runs on, and the rules that keep it trustworthy.
depends-on: hosting.md, ../decisions/0015-data-model-choices.md, ../02-economy/currency-model.md
---

# Data Model

Postgres (Aurora Serverless v2 — `hosting.md`), UUIDv7 keys. Three
foundations from `decisions/0015`: **every owned item is an instance**,
**the catalogue is versioned JSON in the repo**, **every random outcome
is logged with its roll and content version**.

## Identity and profile

**players** — Cognito subject, display name, created/age-attested
timestamps, login-streak state (current run, last claim date), referral
code, `referred_by`, referral-payout state. Cached `shells_balance` and
`pearls_balance`, maintained transactionally; the ledger is the source
of truth.

## The ledger

**ledger_entries** — append-only, never updated or deleted. Player,
currency (`shells`|`pearls`), signed amount, kind (`task_claim`,
`bet_stake`, `bet_payout`, `pearl_award`, `crate_purchase`, `salvage`,
`fusion`, `lottery_ticket`, `lottery_payout`, `lottery_match`,
`qol_purchase`, `completion_bonus`, `referral_reward`, `tip_received`,
`marketplace_sale`, `marketplace_burn`, `adjustment`), a reference to
the causing row (bet, crate open, draw, listing), timestamp. Balances
are derivable by summation; a reconciliation job compares cached
balances against the ledger and alarms on drift.

## Wagering

**bets** — player, game, optional round reference (instant games have
none), stake, decimal odds at placement, state
(`open`|`settled`|`voided`), payout, Pearl base and bonus awarded,
timestamps. Placement debits the stake; settlement credits payout and
Pearls and closes the bet — each is **one transaction**.

**rounds** — shared-event games (races, crash, roulette spins, lottery
draws): schedule, state (`betting`|`running`|`settled`), result, RNG
roll(s), content version.

**races** — round subtype: the field (racer references), closing odds
per racer, finish order. Odds history retained for the form UI.

**lottery_draws** — kind (`daily`|`weekly`), close time, ticket count,
pot from sales, pot from the house match (`decisions/0014`), winners
and splits. **lottery_tickets** — draw, player, source
(`purchase`|`task`); per-player caps enforced on insert.

**blackjack_tables / roulette_rooms** — dynamically spawned rows holding
seat assignments and hand/spin state. Hot state lives in Postgres for
v1 — Lambdas have no resident memory; a cache tier is a scale-time
addition, not a launch requirement.

## Racers

**racers** — roster identity: name, personality, active flag (content
JSON defines them; the row anchors references). **racer_state** — the
hidden true win weight, drifted by a daily job. **Hidden weights never
leave the server**; the API exposes only derived odds and form (recent
finishes, win rate), which are computed from race results.

## Catalogue — content-as-code

`03-cosmetics/content/data/*.json`: gear, skins, sets, drop tables,
racers — each file carrying a `content_version`. Validated at deploy;
the server loads it read-only. Database rows store catalogue IDs plus
the content version in force at the time. The catalogue is immutable
per version — changing content means a new version, never editing what
a logged roll referenced.

## Inventory

**items** — one row per owned instance: player, catalogue ID, kind
(`gear`|`skin`), acquisition source and time, state
(`owned`|`escrowed`|`consumed`), and for Mythics a provenance list
(ordered owner history — a display requirement, `rarity-tiers.md`).
Salvage and fusion set `consumed`; rows are never deleted.

**loadouts** — up to the preset cap (`currency-model.md`): per slot, an
equipped gear instance + skin instance; one active. QoL unlocks (closet
expansion, pedestals, extra presets) as flags/rows against the player.

## Crates, pity, dex, tasks

**crate_opens** — player, crate kind (basic/premium × gear/skin, set),
target set where applicable, price paid, **roll, drop-table version**,
resulting catalogue ID and created item, whether pity fired. This log
is the odds-disclosure audit trail (`../06-risks/compliance.md`).

**pity_counters** — stored counters per player: account-wide basic,
account-wide premium, and one per active set chase (`decisions/0011`).
Fast to read, reconcilable against `crate_opens`.

**dex_entries** — player × catalogue ID: discovered/first-owned
timestamps. Page completion is derived; one-time rewards are recorded
as ledger entries plus a claim row.

**task state** — daily assignments (player, date, task key, progress,
target, claimed), weekly equivalents, and a one-time-claims table
(onboarding steps, firsts, dex pages, set completions). Streaks live on
the player row.

## Marketplace — phase 3, shaped now

**listings** — item (moved to `escrowed`), seller, Pearl price, state.
A sale is one transaction: item transfer, buyer debit, seller credit,
burn entry. Schema detail deferred until the phase.

**Mythic trading is launch-blocking machinery, not a nicety**
(`decisions/0016`): provenance must append owner *and price paid* on
every transfer, sales raise a site-wide announcement, listings carry a
re-listing cooling-off window, and a **platform-wide Mythic-listing
suspension switch must exist from launch** as the response lever if
off-platform cash trading appears.

**tips** — sender, recipient, closet/outfit context, day; one tip per
sender per recipient per day, and a daily cap on Shells received
(`../02-economy/currency-model.md`). Enforced on insert, like lottery
ticket caps.

## Rules

1. **The ledger is append-only** and every currency movement goes
   through it. No balance is ever written except alongside its entry.
2. **One transaction per economic event** — a bet settlement, crate
   open, salvage, fusion, draw settlement or sale either fully happens
   or doesn't.
3. **Every random outcome stores its roll and content version.**
4. **Item instances are never deleted** — `consumed` is a state.
5. **Hidden racer weights are server-only.**

## What this deliberately does not do

- No event-sourcing framework — the ledger is the event log where it
  matters; game state is plainly relational.
- No admin CMS — content changes are commits (`decisions/0015`).
- No commit-reveal RNG in v1 — flagged upgrade.
- No cache tier, no sharding, no multi-region (`hosting.md`).

## Open questions

None. (Visitor tips and Mythic tradeability, formerly open here, are
settled by `decisions/0016` and specced above.)

## Numbers

None here — caps, prices and rates live in
`../02-economy/currency-model.md`.

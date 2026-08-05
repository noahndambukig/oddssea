---
status: agreed
purpose: The persistent data the game runs on, and the rules that keep it trustworthy.
depends-on: hosting.md, ../decisions/0015-data-model-choices.md, ../decisions/0018-ledger-integrity-rules.md, ../02-economy/currency-model.md
---

# Data Model

Postgres (Aurora Serverless v2 — `hosting.md`), UUIDv7 keys. Three
foundations from `decisions/0015`: **every owned item is an instance**,
**the catalogue is versioned JSON in the repo**, **every random outcome
is logged with its roll and content version**. Four integrity rules from
`decisions/0018` — idempotency, per-player serialisation, UTC days, and
full game fidelity in the bet model — are specified in Rules below.

## Identity and profile

**players** — Cognito subject, display name, created/age-attested
timestamps, login-streak state (current run, last claim date), referral
code, `referred_by`, referral-payout state. Cached `shells_balance` and
`pearls_balance`, maintained transactionally; the ledger is the source
of truth. Both balances carry a **non-negative CHECK constraint** — the
backstop that makes an overdraft impossible rather than unlikely.

The Cognito subject is the join to identity; `age_attested_at` starts
life as a Cognito custom attribute (Increment B) and migrates to this
row when the table exists.

## The ledger

**ledger_entries** — append-only, never updated or deleted. Player,
currency (`shells`|`pearls`), signed amount, kind (`task_claim`,
`bet_stake`, `bet_payout`, `pearl_award`, `crate_purchase`,
`direct_purchase`, `salvage`, `fusion`, `lottery_ticket`,
`lottery_payout`, `lottery_match`, `qol_purchase`, `completion_bonus`,
`referral_reward`, `tip_received`, `marketplace_sale`,
`marketplace_burn`, `adjustment`), a reference to the causing row (bet,
crate open, draw, listing), timestamp. Balances are derivable by
summation; a reconciliation job compares cached balances against the
ledger and alarms on drift.

`direct_purchase` covers the weekly rotation's buy-it-outright route,
which is a priced sink in its own right (`../02-economy/currency-model.md`)
and not a crate open.

## Wagering

**bets** — what all seven games share: player, game, optional round
reference (instant games have none), stake, state
(`open`|`settled`|`voided`), payout, Pearl base and bonus awarded,
idempotency key, timestamps. Placement debits the stake; settlement
credits payout and Pearls and closes the bet — each is **one
transaction**.

Decimal odds at placement is **nullable**, because for crash the price
does not exist until the player acts. Games whose shape does not fit
those common columns carry a detail row rather than bending them:

- **bet_crash** — the player's auto-cashout multiplier (if set) and the
  multiplier actually achieved. A bust is a settled bet with no cashout.
- **bet_blackjack_hands** — one row per hand: cards, stake (a double
  raises this hand's stake), outcome, payout. **A split is two rows**,
  which is the only honest way to model one bet becoming two hands.

**rounds** — shared-event games (races, crash, roulette spins, lottery
draws): schedule, state (`betting`|`running`|`settled`), result, RNG
roll(s), content version.

**races** — round subtype: the field (racer references), **the racer
weights in force when odds were set**, closing odds per racer, finish
order. Odds history retained for the form UI. Storing the weights is
what makes a settled race reconstructable — `game-modes.md` promises
publicly that odds are never mispriced on purpose, and proving that
later requires the inputs, not just the outputs.

**lottery_draws** — kind (`daily`|`weekly`), close time, ticket count,
pot from sales, pot from the house match (`decisions/0014`), winners
and splits. **lottery_tickets** — draw, player, source
(`purchase`|`task`); per-player caps enforced **under the player row
lock**, like every other economic event. The cap is a compliance
boundary as much as an economic one (`../06-risks/compliance.md`), so a
concurrency bug here is a compliance bug.

**blackjack_tables / roulette_rooms** — dynamically spawned rows holding
seat assignments and hand/spin state, **and the RNG rolls behind them**:
the shoe shuffle seed and every card dealt, every wheel spin. These are
the highest-volume random outcomes in the game and Rule 5 covers them
like any other. Hot state lives in Postgres for v1 — Lambdas have no
resident memory; a cache tier is a scale-time addition, not a launch
requirement.

## Racers

**racers** — roster identity: name, personality, active flag (content
JSON defines them; the row anchors references). **racer_state** — the
hidden true win weight, drifted by a daily job. **racer_drift_log** —
one row per drift: the roll, the resulting weights, content version.
The drift is a random outcome and Rule 5 applies to it.

**Hidden weights never leave the server**; the API exposes only derived
odds and form (recent finishes, win rate), which are computed from race
results.

## Catalogue — content-as-code

`03-cosmetics/content/data/*.json`: gear, skins, sets, drop tables,
racers — each file carrying a `content_version`. Validated at deploy;
the server loads it read-only. Database rows store catalogue IDs plus
the content version in force at the time. The catalogue is immutable
per version — changing content means a new version, never editing what
a logged roll referenced.

## Inventory

**items** — one row per owned instance: player, catalogue ID, **the
content version in force at acquisition**, kind (`gear`|`skin`),
acquisition source and time, state (`owned`|`escrowed`|`consumed`), and
for Mythics a provenance list — **ordered owner history including the
Pearl price paid at every transfer**, which is what `rarity-tiers.md`
requires displayed forever. Salvage and fusion set `consumed`; rows are
never deleted.

**loadouts** — up to the preset cap (`currency-model.md`): per slot, an
equipped gear instance + skin instance; one active. QoL unlocks (closet
expansion, pedestals, extra presets) as flags/rows against the player.

## Crates, pity, dex, tasks

**crate_opens** — player, crate kind (basic/premium × gear/skin, set),
target set where applicable, price paid, **roll, drop-table version**,
resulting catalogue ID and created item, whether pity fired,
idempotency key. This log is the odds-disclosure audit trail
(`../06-risks/compliance.md`).

**pity_counters** — stored counters per player: account-wide basic,
account-wide premium, and one per active set chase (`decisions/0011`).
Fast to read, reconcilable against `crate_opens`.

**dex_entries** — player × catalogue ID: discovered/first-owned
timestamps. Page completion is derived; one-time rewards are recorded
as ledger entries plus a claim row.

**discoveries** — one row per catalogue ID, ever: the first finder, the
timestamp, and **a snapshot of their display name at that moment**.
`dex.md` calls first-discovery credit the strongest flex in the system
precisely because it cannot be bought, traded or repeated — so it
cannot be derived from `dex_entries` either, where a deleted account
would silently hand the credit to whoever came second. Permanent means
it outlives the player row.

**task state** — daily assignments (player, **UTC date**, task key,
progress, target, claimed), weekly equivalents, and a one-time-claims
table (onboarding steps, firsts, dex pages, set completions). Streaks
live on the player row.

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

**tips** — sender, recipient, closet/outfit context, **UTC day**; one
tip per sender per recipient per day, and a daily cap on Shells
received (`../02-economy/currency-model.md`). Enforced under the
recipient's row lock, like lottery ticket caps.

## Rules

1. **The ledger is append-only** and every currency movement goes
   through it. No balance is ever written except alongside its entry.
2. **One transaction per economic event** — a bet settlement, crate
   open, salvage, fusion, draw settlement or sale either fully happens
   or doesn't.
3. **Every economic event carries a client-supplied idempotency key**,
   unique per player, and a replay returns the original result instead
   of repeating the work. Rule 2 is *atomicity* — all-or-nothing for one
   execution. It says nothing about a request that arrives twice, and
   over a mobile network requests do: a client that never hears back
   cannot distinguish a lost request from a lost response, so it must
   retry. Without a key the retry is a second, perfectly atomic, second
   debit. Natural keys cannot substitute — repeating an identical dice
   bet is normal play, not a duplicate.
4. **One player's economic events are serialised.** Any transaction that
   moves currency takes a row lock on the player (`SELECT … FOR UPDATE`)
   for its duration; different players never contend. This is what makes
   the cached balances safe, and it is what enforces every count-based
   cap — lottery tickets per draw, tips received per day. The
   non-negative CHECK on both balances is the backstop underneath it.
   The design requires this rather than merely benefiting from it:
   `game-modes.md` rule 2 keeps all-in as a legitimate play, so two
   concurrent all-ins are a case the schema must survive.
5. **Every random outcome stores its roll and content version** — crate
   opens, race results, crash busts, lottery draws, racer weight drift,
   and every card dealt or wheel spun at a table.
6. **Days are UTC, and weeks start Monday 00:00 UTC.** Every
   calendar-scoped rule — daily and weekly tasks, login streaks, tip
   caps, ticket caps, both lottery draws — resolves against that
   boundary, for every player, everywhere. One boundary is auditable and
   cannot be shopped by changing a timezone; the shared lottery draws
   need a single global boundary regardless of what players might prefer
   individually. Monday is the ISO-8601 week, which is what every date
   library defaults to — choosing anything else means an explicit offset
   in every calculation forever. The cost is a reset at an awkward local
   hour for some players, accepted knowingly (`decisions/0018`, week
   start added by `decisions/0019`).
7. **Item instances are never deleted** — `consumed` is a state.
8. **Hidden racer weights are server-only.**

## What this deliberately does not do

- No event-sourcing framework — the ledger is the event log where it
  matters; game state is plainly relational.
- No admin CMS — content changes are commits (`decisions/0015`).
- No commit-reveal RNG in v1 — flagged upgrade.
- No cache tier, no sharding, no multi-region (`hosting.md`).
- **No optimistic concurrency.** Rule 4's pessimistic row lock was
  chosen over a version-and-retry scheme because retry logic has to be
  correct at every call site, and when it is wrong it fails silently.
  Per-player locking is the right granularity here: contention within
  one player is real and rare, across players is nil.
- **No responsible-play tooling in v1** — session reminders and
  self-set wager caps are explicitly post-v1 in
  `../06-risks/compliance.md`. Named here so their absence reads as a
  decision rather than an oversight.

## Open questions

- **The per-season Mythic for first full-set completion** (`dex.md`) is
  a one-of-one awarded at runtime. If it is a pre-defined catalogue
  entry, this model handles it; if it is *named after the winning
  player*, it is a runtime-minted catalogue row, which contradicts
  content-as-code and "no admin CMS". Seasons are post-v1
  (`roadmap.md` Q4), so this resolves with them — flagged so it is not
  rediscovered as a surprise.

(Visitor tips and Mythic tradeability, formerly open here, are settled
by `decisions/0016` and specced above.)

## Numbers

None here — caps, prices and rates live in
`../02-economy/currency-model.md`.

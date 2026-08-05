---
date: 2026-08-05
status: accepted
---

# 0018 — Ledger integrity: idempotency, per-player serialisation, UTC days, and full game fidelity

**Decision:** Four rules become part of the data model rather than
implementation detail, because each one changes the schema and therefore
has to be settled before tables exist:

1. **Every economic event carries a client-supplied idempotency key**,
   unique per player. A replay returns the original result instead of
   repeating the work.
2. **One player's economic events are serialised** by a row lock on the
   player for the duration of any currency-moving transaction, with a
   non-negative CHECK on both balances as the backstop. Count-based caps
   — lottery tickets per draw, tips received per day — are enforced under
   the same lock.
3. **Days are UTC**, for every calendar-scoped rule and every player.
4. **The bet model represents all seven games honestly**: odds-at-placement
   becomes nullable, and crash and blackjack get detail tables rather than
   having their shapes forced into the common row.

**Why:**

*Idempotency.* The existing rule — one transaction per economic event —
guarantees atomicity, which is all-or-nothing for a single execution. It
says nothing about the same request arriving twice, and over a mobile
network it will: a client that never receives a response cannot tell a
lost request from a lost response, so it must retry. Without a key, the
retry is a second debit that is itself perfectly atomic. Natural
uniqueness cannot substitute, because repeating an identical dice bet is
ordinary play rather than a duplicate.

*Serialisation.* Cached balances "maintained transactionally" still allow
two concurrent reads of the same balance to both succeed. This is not a
theoretical concern here: `game-modes.md` rule 2 keeps all-in a
legitimate play with no maximum bet, so two concurrent all-ins are a case
the schema must survive. Pessimistic locking was chosen over
optimistic-and-retry because retry logic must be correct at every call
site and fails silently when it is not; per-player granularity means
contention across players is nil. The ticket cap deserves special note —
`compliance.md` calls it the +EV lottery's compliance boundary, so a
concurrency bug there is a compliance failure, not merely an economic one.

*UTC.* No spec defined a day boundary, yet streaks, daily and weekly
tasks, tip caps, ticket caps and both lottery draws all depend on one.
A single global boundary is auditable and cannot be shopped by changing
timezone; the shared lottery draw requires one regardless, since there is
one pot and one draw. The cost — a reset at an awkward local hour for
some players — is accepted knowingly, and revisiting it is a decision
entry, not a config change.

*Game fidelity.* Crash has no price until the player cashes out, so
odds-at-placement is unfillable; blackjack's specced double and split
turn one bet into a changing stake and two hands, which one stake and one
payout column cannot express. Two of the seven launch games did not fit
the model. Detail tables were chosen over a JSONB column because a JSONB
payload carries neither constraints nor foreign keys — the two things a
ledger-backed schema exists to provide — and over one table per game
because that makes the ledger's reference to its causing row polymorphic
across seven tables.

**Also settled in the same pass**, without needing their own entries: a
`direct_purchase` ledger kind (the weekly rotation's buy-outright route
is a priced sink with no home in the enum); a `discoveries` table so
first-discovery credit survives account deletion instead of silently
moving to the second finder; the content version stored on `items` as the
catalogue rule already required; provenance recorded with the price paid
at every transfer, as `rarity-tiers.md` requires displayed; racer drift
logged with its roll, and the weights in force stored on each race, so a
settled race is reconstructable; table games logging their shuffles and
deals like every other random outcome; and RDS Proxy named in
`hosting.md`, since putting hot state in Postgres makes every request a
database round-trip.

**Consequences:** `data-model.md` moves draft → agreed. Nothing built so
far is affected — no API touches a database yet — and that is exactly why
this was worth doing now: every rule here is cheap as a schema decision
and expensive as a migration.

**Provenance:** Pass 3 adversarial verification of `data-model.md`
(`spec-workflow.md`), 2026-08-05. Eleven findings, all resolved.

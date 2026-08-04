---
date: 2026-08-04
status: accepted
---

# 0015 — Item instances, catalogue-as-code, logged CSPRNG

**Decision:** The three forks in the data model, chosen together:

1. **Every owned item is a unique instance**, not a per-type count. One
   uniform ownership model that natively supports Mythic provenance
   (ordered owner history is a spec requirement), marketplace escrow of
   a specific item, fusion consuming specific pieces, and the
   wear/condition axis later. Instances are never deleted — salvage and
   fusion set a `consumed` state, preserving audit and provenance.
2. **The catalogue is content-as-code**: rosters, drop tables and racer
   definitions live as versioned JSON in the repo, validated at deploy;
   the database stores catalogue references plus the content version.
   Shipping a family is a commit, not a migration — and doc-conventions
   rule 6 already required JSON as the shipping format.
3. **RNG is logged CSPRNG in v1**: server-side rolls, every roll stored
   with its drop-table/content version, RTP published. Provably-fair
   commit-reveal (players cryptographically verify race results and
   crash curves) is flagged as a post-v1 trust upgrade, not built now —
   its value peaks when real money is involved, which it never is behind
   the compliance wall.

**Why:** Counts-based inventory is the classic premature optimisation in
collection games — it saves rows at launch scale (trivial) and blocks
three specced features that all need item identity. A database-resident
catalogue needs admin tooling nobody has scheduled; JSON-in-repo gets
versioning, review and rollback from git for free. And the crate-open
audit trail (roll + version per open) was already a hosting rule — the
CSPRNG choice just names the ceiling of v1's verifiability honestly.

**Consequence:** `04-technical/data-model.md` is written against these.
The rosters must actually move to `03-cosmetics/content/data/*.json`
(next content chore). Crate logs referencing drop-table versions become
load-bearing: the content version must be stamped on every random
outcome, not just crates.

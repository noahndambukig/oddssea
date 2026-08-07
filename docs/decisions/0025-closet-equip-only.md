---
date: 2026-08-07
status: accepted
relates-to: 0022, 0023, 0024
---

# 0025 — The closet milestone: equip-only, and the contract that waits

**Decision (Noah + review, 2026-08-07):** Barebones equipping ships alone;
two Codex rounds (7 findings, all applied) reshaped the deploy story.

1. **Equip only, private (Noah).** One live loadout per player: per slot,
   a gear instance + a skin instance (`data-model.md`'s loadouts shape,
   preset in the key at a constant 1 so presets later add rows, not a PK
   rebuild). The public closet — player URLs, display names, visit
   tracking, and the visit-closet zero-Shell challenge that would shrink
   0024's bust-proof waiver — is its own flex-layer milestone.

2. **Tour order per spec (Noah).** The equip step inserts third:
   intro → starter crates → equip → first bet.

3. **Expand now; contract NEXT milestone.** The chain rewire
   (`tour:first-bet` requiring `tour:equip`) is NOT in 009. Review round
   1 split the change expand/contract because migrations land minutes
   before the handler; round 2 caught that a same-branch second deploy
   was still wrong — after the contract, an app-stack ROLLBACK lands on
   a handler with no closet route and no `tour:equip` in its valid set,
   stranding the chain. So: **migration 010 (the one-line rewire) ships
   as the first commit of the next milestone's branch**, the earliest
   point where the rollback target itself can equip. Interim, accepted:
   the tour's order is UI-presented but SQL-permissive for one milestone
   gap — both steps exist and pay; only a direct-POST caller can
   sequence around the order.

4. **Equip evidence is an event, not state.** `players.first_equipped_at`
   (COALESCE'd on first equip, never unset) is what `tour:equip`,
   `first_equip`, and the UI claimable flags all read — equipping then
   unequipping before claiming must not erase the credit, and the UI
   must read the same evidence as the SQL or the button lies.

5. **No idempotency key on `set_equipment`.** Overwriting a loadout slot
   is naturally idempotent and moves no currency; the keyed machinery
   exists for economic retries. The two task payouts ride the existing
   keyed claim rails.

**Forward obligations:** migration 010 (chain contract) opens the next
milestone's branch; economy pass 2 must unequip or refuse to consume an
equipped instance when salvage lands.

**Consequences:** `tasks.json` → 1.1.0 (four tour steps,
`feature_firsts`). Slot-fit validation lives in the handler (catalogue
knowledge); ownership/kind/state stay in SQL. The web panels get a
two-event bus: `collection-changed` (items/equipment) and
`tasks-changed` (progress), every producer dispatching.

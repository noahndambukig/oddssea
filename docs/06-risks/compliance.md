---
status: draft — needs legal review before monetisation
purpose: Regulatory and operational risks in the crate and trading systems.
---

# Compliance and Risk

## If coins become purchasable with real money, crates become a regulated product

Loot box rules vary considerably by jurisdiction. Several markets require published drop odds; some restrict randomised purchases for minors outright; a few treat them as gambling.

Two things follow:

**Publish the drop rates in the UI regardless of whether you are legally required to.** It is also better design — disclosed odds plus a visible pity counter turns a black box into a system players can reason about, and reasoning about it is most of the fun.

**Get advice before adding a real-money path.** If the currency stays strictly earned-only, this risk drops dramatically. That is worth weighing as a design decision, not just a legal one.

## Trading is a step change in complexity, not a feature

A marketplace brings fraud, bots, duplicate-farming and account theft with real stakes attached. Ship it late, ship it with the burn, and consider restricting trade to items above a certain tier so the low-value bot economy never gets started.

## Operational risks

**The 8-animated-avatar cap needs load testing on a low-end device before Phase 2 ships**, not after. If the real number is 4, the whole social display design changes.

**Salvage is irreversible and players will misclick it.** Confirmations on Legendary and above, and a short undo window, are cheaper than the support tickets.

**Set retirement generates resentment if handled badly.** The vault rotation in `02-economy/guardrails.md` is the mitigation; do not ship retirement without it.

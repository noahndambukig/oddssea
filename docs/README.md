# Avatar Cosmetic & Collection System — Design Docs

Everything about the cosmetic economy lives here. One topic per file, one owner per file, one source of truth per number.

## Map

| Folder | What's in it | Change frequency |
|---|---|---|
| **00-overview** | Pillars, glossary, and the rules these docs follow | Rarely |
| **01-systems** | How each mechanic works — slots, tiers, animation, crates, dex, sets, flex | Occasionally |
| **02-economy** | Prices, earn rates, dust, guardrails, and the simulations behind them | Often |
| **03-content** | The actual catalogue — gear, skins, seasonal sets, naming | Constantly |
| **04-production** | Art pipeline and asset budget | Occasionally |
| **05-roadmap** | Build order and open questions | Often |
| **06-risks** | Compliance and things that could go wrong | Rarely |
| **decisions** | Dated log of decisions made and reversed | Append-only |

## Start here

New to the project? Read in this order:

1. `00-overview/pillars.md` — why any of this exists
2. `01-systems/core-model.md` — the gear × skin structure everything else hangs off
3. `01-systems/rarity-tiers.md` and `01-systems/animation-ladder.md` — how value is signalled
4. `02-economy/currency-model.md` — how it pays for itself

## Current status

| Area | Status |
|---|---|
| Core systems | Agreed |
| Economy model | Agreed, simulated, not yet playtested |
| Gear catalogue | **Awaiting selection** — see `03-content/gear-candidates.md` |
| Skin catalogue | **Awaiting selection** — see `03-content/skin-candidates.md` |
| Seasonal sets | Draft |
| Production pipeline | Draft |

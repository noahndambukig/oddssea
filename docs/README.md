---
status: agreed
purpose: Index of every spec and its current state. Keep this current — it is the map.
---

# oddssea — Specs

| Folder | Scope | Change frequency |
|---|---|---|
| `00-project/` | Pillars, glossary, conventions, workflow, roadmap — feature-agnostic | Rarely |
| `01-game/` | The game itself: core loop, modes, progression | Occasionally |
| `02-economy/` | Currency, dust, guardrails, simulations — **all numbers live here** | Often |
| `03-cosmetics/` | The avatar collection system and its content | Constantly |
| `04-technical/` | Architecture, data model, stack | Occasionally |
| `05-production/` | Art pipeline and asset budget | Occasionally |
| `06-risks/` | Compliance and operational risk | Rarely |
| `decisions/` | Dated log of decisions and reversals | Append-only |
| `_templates/` | The spec template | Rarely |

## Status

| Spec | Status |
|---|---|
| `00-project/pillars.md` | Agreed |
| `00-project/doc-conventions.md` | Agreed |
| `00-project/spec-workflow.md` | Agreed |
| `00-project/glossary.md` | Agreed |
| `01-game/core-loop.md` | **Not written** |
| `01-game/game-modes.md` | **Not written** |
| `02-economy/currency-model.md` | Agreed — simulated, not playtested |
| `02-economy/dust.md` | Agreed |
| `02-economy/guardrails.md` | Agreed |
| `03-cosmetics/*` | Agreed |
| `03-cosmetics/content/gear-candidates.md` | **Awaiting selection** |
| `03-cosmetics/content/skin-candidates.md` | **Awaiting selection** |
| `03-cosmetics/content/set-list.md` | Draft — structural decision needed |
| `04-technical/*` | **Not written** |
| `05-production/*` | Draft |
| `06-risks/compliance.md` | Draft — **written before the genre was settled, needs revisiting** |

## Suggested order for what's next

1. **`01-game/core-loop.md`** — everything else assumes it and nothing has specced it. The economy currently has faucet numbers with no described activity generating them.
2. **`06-risks/compliance.md`** — rewrite for a gambling simulator. Age rating, store category and whether coins are ever purchasable all constrain the design, and they are cheaper to know now than after the economy is built.
3. **`04-technical/data-model.md`** — the cosmetics spec implies a schema (items, skins, ownership, provenance, dex progress). Write it down before code starts guessing.
4. Lock the gear and skin rosters, then move the catalogue to JSON.

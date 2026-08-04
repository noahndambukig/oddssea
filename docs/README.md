---
status: agreed
purpose: Index of every spec and its current state. Keep this current — it is the map.
---

# oddssea — Specs

| Folder | Scope | Change frequency |
|---|---|---|
| `00-project/` | Pillars, glossary, conventions, workflow, roadmap — feature-agnostic | Rarely |
| `01-game/` | The game itself: core loop, modes, progression | Occasionally |
| `02-economy/` | Currencies, wagering, guardrails, simulations — **all numbers live here** | Often |
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
| `00-project/identity.md` | Agreed — icon is the sailboat |
| `01-game/core-loop.md` | Draft |
| `01-game/tasks.md` | Draft |
| `01-game/game-modes.md` | Draft |
| `02-economy/currency-model.md` | Agreed — simulated, not playtested |
| `02-economy/dust.md` | Superseded (`decisions/0005`) |
| `02-economy/guardrails.md` | Agreed — simulated, not playtested |
| `03-cosmetics/*` | Agreed |
| `03-cosmetics/content/gear-roster.md` | Agreed — 11 families chosen (`decisions/0013`) |
| `03-cosmetics/content/gear-candidates.md` | Superseded — backlog |
| `03-cosmetics/content/skin-roster.md` | Agreed — 11 families, cosmic is Void Weave, 3 launch sets designated |
| `03-cosmetics/content/skin-candidates.md` | Superseded — backlog |
| `03-cosmetics/content/set-list.md` | Backlog — post-v1 seasonal concepts |
| `04-technical/platform.md` | Agreed — implementation begun (`web/`) |
| `04-technical/hosting.md` | Agreed — implementation begun (`infra/`) |
| `04-technical/data-model.md` | **Not written** |
| `05-production/*` | Draft |
| `06-risks/compliance.md` | Draft — **written before the genre was settled, needs revisiting** |

## Suggested order for what's next

1. **`06-risks/compliance.md`** — rewrite for a gambling simulator. Age rating, store category and whether Shells are ever purchasable all constrain the design, and they are cheaper to know now than after the economy is built.
2. **`04-technical/data-model.md`** — the cosmetics, economy and game specs imply a schema (ledger, inventory, dex progress, tables, racer form). Write it down before code starts guessing.
3. Move the locked rosters to `03-cosmetics/content/data/*.json` (doc-conventions rule 6), and write the racer roster content pass.
4. Validate the lottery subsidy in the bankroll sim (roadmap question 11), then review the `01-game/` drafts to `agreed`.

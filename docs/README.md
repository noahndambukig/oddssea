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
| `01-game/racers.md` | Draft — 14-racer roster authored |
| `03-cosmetics/content/data/*.json` | Shipped — content version 1.0.0 (`decisions/0015`) |
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
| `04-technical/data-model.md` | Draft (`decisions/0015`) |
| `05-production/*` | Draft |
| `06-risks/compliance.md` | Agreed — v1 posture (no real-money path); legal review before monetisation or store submission |

## Suggested order for what's next

1. Review the drafts (`01-game/core-loop`, `tasks`, `game-modes`, `racers`, `04-technical/data-model`) to `agreed`.
2. First deploy, then build against the specs — every planned spec now exists and all content is chosen and shipped as data.

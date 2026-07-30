# Owner: core.config

> Auto-generated scaffold from `architecture-owners.config.json`. The manifest is the canonical truth source; this page narrates the model and records hard-to-automate rationale. Update it when the owner boundary or its non-obvious invariants change.

- **Layer:** `core` (may import layers: shared, core)
- **Risk:** medium
- **Include:** `src/core/config/**`

## Responsibilities
- merge local config and server catalogs (ModelConfigService, OpencodeConfigManager)
- model catalog state, selection, pricing, formatter and MCP config
- slash command catalog and plugin management service

## Canonical state (truth home)
- model catalog assembly (baseEffective vs effective)
- opencode config manager state
- slash command catalog

> Cross-owner access is read-only snapshot/command/event. Do not replicate this state as a second writable truth source.

## Entrypoints
- `src/core/config/index.ts`
- `src/core/config/ModelConfigService.ts`
- `src/core/config/OpencodeConfigManager.ts`

## Dependency surface
- **Allowed owner dependencies:** `shared.foundation`, `core.types`
- **Forbidden dependencies:** `feature`, `app`
- **Adjacent owners** (prefer editing these when out of scope): `feature.settings-model-catalog`, `feature.chat-shell`

## Focused tests
- `tests/unit/core/config/**`

## Required gates
Run before merge: `npm run typecheck`, `npm run module-docs`.

## Hard invariants
- Do not cross `forbiddenDependencies`.
- Do not replicate canonical state in another owner.
- Changes here must update the matching `docs/modules/**` page (via `module-docs.config.json`).
- Run `npm run inspect:owner -- <this owner or a path>` for an always-fresh summary.

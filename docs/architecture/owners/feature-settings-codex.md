# Owner: feature.settings-codex

> Auto-generated scaffold from `architecture-owners.config.json`. The manifest is the canonical truth source; this page narrates the model and records hard-to-automate rationale. Update it when the owner boundary or its non-obvious invariants change.

- **Layer:** `feature` (may import layers: shared, core, feature)
- **Risk:** medium
- **Include:** `src/features/settings/SettingsCodexSection.ts`, `src/features/settings/SettingsCodexProjectConfigSection.ts`, `src/features/settings/SettingsCodexAccountSurface.ts`, `src/features/settings/SettingsCodexLegacyCredentialControl.ts`, `src/features/settings/SettingsCodexReadbackControls.ts`, `src/features/settings/SettingsCodexResourcesSection.ts`, `src/features/settings/CodexMcpServerDetailModal.ts`, `src/features/settings/CodexMcpServerDetailRenderers.ts`, `src/features/settings/CodexProjectConfigFormModel.ts`, `src/features/settings/CodexReadbackModal.ts`

## Responsibilities
- Codex settings sections, project config, account surface, credentials, readback controls, resources
- Codex MCP server detail modal

## Entrypoints
- `src/features/settings/SettingsCodexSection.ts`

## Dependency surface
- **Allowed owner dependencies:** `shared.foundation`, `core.types`
- **Forbidden dependencies:** `app`
- **Adjacent owners** (prefer editing these when out of scope): `feature.settings-shell`

## Focused tests
- `tests/unit/features/settings/**Codex*`

## Required gates
Run before merge: `npm run typecheck`, `npm run module-docs`.

## Hard invariants
- Do not cross `forbiddenDependencies`.
- Do not replicate canonical state in another owner.
- Changes here must update the matching `docs/modules/**` page (via `module-docs.config.json`).
- Run `npm run inspect:owner -- <this owner or a path>` for an always-fresh summary.

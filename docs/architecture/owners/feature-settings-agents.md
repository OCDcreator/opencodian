# Owner: feature.settings-agents

> Auto-generated scaffold from `architecture-owners.config.json`. The manifest is the canonical truth source; this page narrates the model and records hard-to-automate rationale. Update it when the owner boundary or its non-obvious invariants change.

- **Layer:** `feature` (may import layers: shared, core, feature)
- **Risk:** medium
- **Include:** `src/features/settings/SettingsAgentsSection.ts`, `src/features/settings/AgentSwitcherChips.ts`, `src/features/settings/AgentSwitcherFloatingIcons.ts`, `src/features/settings/SettingsSkillSection.ts`, `src/features/settings/SlashCommandCatalogRenderer.ts`, `src/features/settings/SettingsToolSection.ts`, `src/features/settings/SettingsToolDetailModal.ts`, `src/features/settings/SettingsToolFileService.ts`, `src/features/settings/capabilityDisclosureRow.ts`, `src/features/settings/capabilityLabBackendTabs.ts`, `src/features/settings/capabilityLabBackendWorkspace.ts`, `src/features/settings/SettingsCapabilityLabSection.ts`

## Responsibilities
- agents, skill, tool and capability-lab settings sections
- agent switcher chips and floating icons, slash command catalog renderer

## Entrypoints
- `src/features/settings/SettingsAgentsSection.ts`
- `src/features/settings/SettingsCapabilityLabSection.ts`

## Dependency surface
- **Allowed owner dependencies:** `shared.foundation`, `core.agents`, `core.config`, `core.types`
- **Forbidden dependencies:** `app`
- **Adjacent owners** (prefer editing these when out of scope): `feature.settings-shell`, `core.agents`

## Focused tests
- `tests/unit/features/settings/**Agent*`
- `tests/unit/features/settings/**Capability*`

## Required gates
Run before merge: `npm run typecheck`, `npm run module-docs`.

## Hard invariants
- Do not cross `forbiddenDependencies`.
- Do not replicate canonical state in another owner.
- Changes here must update the matching `docs/modules/**` page (via `module-docs.config.json`).
- Run `npm run inspect:owner -- <this owner or a path>` for an always-fresh summary.

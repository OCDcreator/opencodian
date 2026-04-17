# Feature Agents / Commands Phase 6

> Date: 2026-04-17
> Status: completed
> Slice: ordered plan item 5 — Agents settings default-agent and visibility shell

## Completed slice

- Added a dedicated `SettingsAgentsSection` owner for the first Agents settings shell.
- Loaded the agent catalog by combining:
  - runtime agents from `openCodeService.sdk.app.agents()`
  - project overrides from `OpencodeConfigManager.getAgentConfig()`
  - project default agent from `OpencodeConfigManager.getDefaultAgent()`
- Surfaced a default primary-agent dropdown that writes project-level `default_agent` through `OpencodeConfigManager.updateDefaultAgent()`.
- Added basic subagent visibility controls for `mode: 'subagent'` entries:
  - hiding writes `agent.<id>.hidden = true`
  - unhiding removes an empty hidden-only override, or preserves other project agent fields
- Kept the slice limited to item 5’s shell; did not start full agent CRUD fields or slash-command work.

## Scope and boundaries

- Added a dedicated settings owner instead of growing `OpenCodianSettings` with agent catalog/runtime state.
- Reused `OpencodeConfigManager` project helpers for all `.opencode/opencode.json` writes.
- Kept `OpenCodianView.ts` and `OpenCodeService.ts` untouched; the new behavior is settings/config only.
- Limited docs updates to the new settings owner and the settings panel owner map.
- Did not touch `reference-projects/`, deployment flow, or unrelated feature tracks.

## Files changed

- `src/features/settings/SettingsAgentsSection.ts`
- `src/features/settings/OpenCodianSettings.ts`
- `src/i18n/locales/en.ts`
- `src/i18n/locales/zh.ts`
- `tests/unit/features/settings/SettingsAgentsSection.test.ts`
- `docs/modules/features/settings/SettingsAgentsSection.md`
- `docs/modules/features/settings/OpenCodianSettings.md`
- `docs/status/feature-agents-commands-phase-6.md`

## Validation

- Targeted: `npm test -- --runInBand tests/unit/features/settings/SettingsAgentsSection.test.ts tests/unit/features/settings/OpenCodianSettings.test.ts`
- Lint: `npm run lint`
- Typecheck: `npm run typecheck`
- Full tests: `npm test`
- Build: `npm run build`

## Next recommended slice

- Continue ordered plan item 5 by extending `SettingsAgentsSection` with the smallest full-edit step: create/edit/delete project agents for core fields (`mode`, `description`, `prompt`, `model`, `temperature`, `top_p`, `steps`, `color`) while continuing to write only project `.opencode/opencode.json`; leave `permission.task` allowlists and commands/slash runtime for later slices.

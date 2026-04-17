# Feature Agents / Commands Phase 7

> Date: 2026-04-17
> Status: completed
> Slice: ordered plan item 5 — Agents settings core project-agent CRUD

## Completed slice

- Extended the Agents settings flow from the phase 6 shell into full project-agent core-field CRUD.
- Added a dedicated project-agent editor under the existing Agents section that can create, edit, and delete project `agent.<id>` entries for:
  - `mode`
  - `description`
  - `prompt`
  - `model`
  - `temperature`
  - `top_p`
  - `steps`
  - `color`
- Kept all writes project-scoped through `OpencodeConfigManager` so edits stay in the current vault’s `.opencode/opencode.json`.
- Preserved unrelated agent fields by continuing to write through `upsertAgentConfig()` merge semantics, while allowing cleared core fields to be removed via `undefined` patch values.
- Split the new form logic into a companion settings owner so `SettingsAgentsSection.ts` remains under lint maintainability limits instead of growing into a larger monolith.

## Scope and boundaries

- Kept the slice inside ordered plan item 5 only; did not start `permission.task` allowlists, slash commands, or command-owned hidden agents.
- Reused the existing `SettingsAgentsSection` and `OpencodeConfigManager` seam instead of adding runtime ownership to `OpenCodianView.ts` or `OpenCodeService.ts`.
- Limited docs updates to the directly related settings owner/module docs plus this phase note.
- Did not touch `reference-projects/`, deployment flow, or unrelated feature tracks.

## Files changed

- `src/features/settings/SettingsAgentsSection.ts`
- `src/features/settings/SettingsProjectAgentEditor.ts`
- `src/i18n/locales/en.ts`
- `src/i18n/locales/zh.ts`
- `tests/unit/features/settings/SettingsAgentsSection.test.ts`
- `docs/modules/features/settings/SettingsAgentsSection.md`
- `docs/modules/features/settings/SettingsProjectAgentEditor.md`
- `docs/modules/features/settings/OpenCodianSettings.md`
- `docs/status/feature-agents-commands-phase-7.md`

## Validation

- Targeted: `npm test -- --runInBand tests/unit/features/settings/SettingsAgentsSection.test.ts tests/unit/features/settings/OpenCodianSettings.test.ts`
- Lint: `npm run lint`
- Typecheck: `npm run typecheck`
- Full tests: `npm test`
- Build: `npm run build`

## Next recommended slice

- Continue ordered plan item 5 with the next smallest coherent Agents step: add project-agent `permission.task` allowlist editing in the Agents settings flow, keeping writes project-scoped to `.opencode/opencode.json` and leaving commands/slash runtime for the later ordered item 6 slices.

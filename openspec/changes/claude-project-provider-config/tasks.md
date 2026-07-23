# Tasks

## 1. Core: settings-file read/write owner

- [x] 1.1 Add `ClaudeProviderSettings` + `ClaudeProviderPreset` types, defaults, and normalization to `src/core/types/settings.ts` (official preset constant, `activePresetId` default `'official'`).
- [x] 1.2 Create the settings-file owner (`src/core/agents/backend/ClaudeProjectProviderConfig.ts` or extend `ClaudeProjectSettingsDiscovery.ts` per review): layered read of user/project/local settings + shell `ANTHROPIC_*` / `CLAUDE_CODE_*` env, with secret masking.
- [x] 1.3 Implement managed-key apply/remove (merge-write, unknown-key preservation, extra-env key tracking via `lastAppliedManagedEnvKeys`, empty-`env` cleanup, invalid-JSON backup) with atomic writes through `ProjectResourceSecureWrite.ts`.
- [x] 1.4 Unit tests: apply/remove matrix, restore-official cleanup, invalid JSON backup, masking helpers.

## 2. Providers tab UI

- [x] 2.1 Create `src/features/settings/SettingsClaudeProvidersSection.ts`: preset list (row cards), create/edit modal, activate/switch, official restore, with optional `fallbackModel`, following the `SettingsClaudeResourcesSection` layout pattern.
- [x] 2.2 Inline global effective-value display per field (masked) + "View global configuration" read-only modal (three layers + shell env).
- [x] 2.3 Guidance banners as pure evaluator functions + UI: settingSources-`local` fix button, baseUrl-without-token warning, OAuth coexistence note, legacy `settings.env` ANTHROPIC_* duplicate warning, baseUrl `/v1` and `Bearer `-prefix inline validation.
- [x] 2.4 One-time model/fallbackModel migration on first Providers-tab render after the local-source gate (merge-write, clear plugin fields, notice, done flag).
- [x] 2.5 Styles + zh/en locale keys; register the `providers` tab in `settingsLayoutRegistry.ts` and wire render in `SettingsClaudeCodeSection.ts`.
- [x] 2.6 DOM/mutation tests for CRUD + activate + migration notice + guidance banners.

## 3. Tab restructure

- [x] 3.1 Parameterize `SettingsClaudeResourcesSection.ts` by resource-kind subset (`['skill','command']` / `['agent']`).
- [x] 3.2 Move the `mcp-runtime` group out of the tools tab into a new `mcp` tab render path; keep `tool-policy` + `question-ux` in `tools`.
- [x] 3.3 Update `settingsLayoutRegistry.ts` secondary tabs: add `providers` / `mcp` / `skills-commands` / `agents`, remove `resources`; update locale keys and `data-claude-code-section` attributes.
- [x] 3.4 Remove model selection UI from `model-thinking` (L2021-2089, L2540-2600 in `SettingsClaudeCodeSection.ts`); keep thinking/effort; verify `ClaudeCodeOptionsBuilder.ts` omits empty model options.
- [x] 3.5 Update existing settings-section tests for the new tab layout.

## 4. Gates

- [x] 4.1 `node scripts/run-jest.js tests/unit/features/settings/ tests/unit/core/agents/backend/ tests/unit/core/types/` green.
- [x] 4.2 Sync `docs/modules/**` pages for every added/changed module; `npm run check:module-docs` green.
- [x] 4.3 `npm run graphify:update:src` and `npm run check:graphify` green.
- [x] 4.4 `npm run verify` green (lint 0 warnings, typecheck, full tests, build).

## Notes

- Implementation is complete; see the checked gates above for build, test, graph, and Test Vault evidence.
- The preceding resources WIP was committed before this implementation began (`c6d3e003`).

# Feature Agents / Commands Phase 9

> Date: 2026-04-17
> Status: completed
> Slice: ordered plan item 5 — Agents settings project-agent `permission.task` allowlist editing

## Completed slice

- Extended the existing project-agent editor with project-scoped `permission.task` allowlist editing.
- Added multiline allowlist normalization: each non-empty unique line writes to `permission.task` as `'*': 'deny'` plus explicit `allow` rules for the listed agent IDs / glob patterns.
- Preserved non-task permission behavior by leaving untouched `permission` configs alone when the allowlist field is not edited, merging onto shorthand string permissions when needed, and clearing only `permission.task` when the allowlist is emptied.

## Scope and boundaries

- Stayed inside ordered plan item 5 and did not start project-agent `options`, commands settings, slash runtime, or other later feature tracks.
- Kept ownership in the existing `SettingsProjectAgentEditor` / `SettingsAgentsSection` seam and continued routing writes through `OpencodeConfigManager.upsertAgentConfig()`.
- Kept all writes limited to the current vault’s `.opencode/opencode.json`; no global OpenCode config or Test Vault deployment changes.
- Updated only the directly related settings module docs, locales, focused tests, and this phase note.

## Files changed

- `src/features/settings/SettingsProjectAgentEditor.ts`
- `src/i18n/locales/en.ts`
- `src/i18n/locales/zh.ts`
- `tests/unit/features/settings/SettingsAgentsSection.test.ts`
- `tests/unit/features/settings/SettingsProjectAgentEditor.test.ts`
- `docs/modules/features/settings/SettingsProjectAgentEditor.md`
- `docs/modules/features/settings/SettingsAgentsSection.md`
- `docs/modules/features/settings/OpenCodianSettings.md`
- `docs/status/feature-agents-commands-phase-9.md`

## Validation

- Targeted: `npm test -- --runInBand tests/unit/features/settings/SettingsAgentsSection.test.ts tests/unit/features/settings/SettingsProjectAgentEditor.test.ts`
- Lint: `npm run lint`
- Typecheck: `npm run typecheck`
- Full tests: `npm test`
- Build: `npm run build`

## Next recommended slice

- Continue ordered plan item 5 with project-agent `options` editing in the Agents settings flow, keeping writes project-scoped to `.opencode/opencode.json` and leaving commands/slash runtime for the later ordered item 6 slices.

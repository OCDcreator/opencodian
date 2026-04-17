# Feature Agents / Commands Phase 12

> Date: 2026-04-17
> Status: completed
> Slice: ordered plan item 6 — project command editor shell for project `command.<id>` core fields

## Completed slice

- Added a dedicated `SettingsProjectCommandEditor` companion owner and mounted it above the existing Commands catalog in `SettingsCommandsSection`.
- Enabled create/edit/delete flows for project `.opencode/opencode.json` `command.<id>` entries covering `template`, `description`, `agent`, `model`, and `subtask`.
- Prefilled the editor from the merged runtime/project command catalog so runtime slash commands can be turned into project overrides without starting from a blank form.
- Kept slash visibility toggles on plugin setting `hiddenSlashCommands`, leaving command execution, placeholder expansion, and command-owned hidden agents for later slices.

## Scope and boundaries

- Stayed inside ordered plan item 6 and only delivered the Commands settings editor shell on top of the existing catalog seam.
- Kept ownership in adjacent settings owners: `SettingsCommandsSection` continues to own catalog loading / visibility, while `SettingsProjectCommandEditor` owns project command form state, notices, and CRUD writeback.
- Wrote project command changes only through `OpencodeConfigManager.upsertCommandConfig()` / `removeCommandConfig()` against the current vault `.opencode/opencode.json`.
- Did not start slash autocomplete, `OpenCodeService.runSessionCommand()` execution wiring, OpenCodian placeholder runtime expansion, or command-owned hidden agent generation.
- Updated only directly related module docs, locale strings, focused tests, and this phase note. No Test Vault deployment was run.

## Files changed

- `src/features/settings/SettingsCommandsSection.ts`
- `src/features/settings/SettingsProjectCommandEditor.ts`
- `src/i18n/locales/en.ts`
- `src/i18n/locales/zh.ts`
- `tests/unit/features/settings/SettingsCommandsSection.test.ts`
- `tests/unit/features/settings/SettingsProjectCommandEditor.test.ts`
- `docs/modules/features/settings/SettingsCommandsSection.md`
- `docs/modules/features/settings/SettingsProjectCommandEditor.md`
- `docs/modules/features/settings/OpenCodianSettings.md`
- `docs/modules/README.md`
- `docs/status/feature-agents-commands-phase-12.md`

## Validation

- Targeted: `npm test -- --runInBand tests/unit/features/settings/SettingsProjectCommandEditor.test.ts tests/unit/features/settings/SettingsCommandsSection.test.ts`
- Lint: `npm run lint`
- Typecheck: `npm run typecheck`
- Full tests: `npm test`
- Build: `npm run build`

## Next recommended slice

- Continue ordered plan item 6 with the command placeholder preview/reference shell: show the supported OpenCodian placeholder tokens (`{{vault_path}}`, `{{current_note_path}}`, `{{current_selection}}`, `{{external_context_paths}}`, `{{conversation_title}}`) inside the Commands settings/editor UI, while still leaving runtime placeholder expansion, slash autocomplete/execution, and command-owned hidden agent generation for later slices.

# Feature Agents / Commands Phase 11

> Date: 2026-04-17
> Status: completed
> Slice: ordered plan item 6 — Commands settings catalog shell + `hiddenSlashCommands` visibility wiring

## Completed slice

- Added a dedicated `SettingsCommandsSection` owner and mounted it in the main settings tab between Agents and Plugins.
- Loaded the slash-command catalog from `sdk.command.list()` plus project `command` entries from `.opencode/opencode.json`, filtering out MCP / skill prompts and keeping project-only commands visible even when the runtime does not return them.
- Wired per-command visible/hidden toggles to the existing plugin setting `hiddenSlashCommands`, with deduped sorted persistence so later slash-menu/runtime slices can reuse the same visibility source of truth.

## Scope and boundaries

- Stayed inside ordered plan item 6 and did not start command template editing, placeholder previews, command-owned hidden agent generation, slash autocomplete, or `runSessionCommand()` execution wiring.
- Kept ownership in a new adjacent settings owner `SettingsCommandsSection`, without pushing new command-settings logic into `OpenCodianSettings`, `OpenCodianView`, or `OpenCodeService`.
- Limited writes to plugin settings `hiddenSlashCommands`; this round does not mutate project `command` templates and does not touch global OpenCode config.
- Updated only the directly related settings docs, locale strings, module index baseline, focused tests, and this phase note.
- Ran the required validation chain and did not deploy to any Test Vault.

## Files changed

- `src/features/settings/SettingsCommandsSection.ts`
- `src/features/settings/OpenCodianSettings.ts`
- `src/i18n/locales/en.ts`
- `src/i18n/locales/zh.ts`
- `tests/unit/features/settings/SettingsCommandsSection.test.ts`
- `docs/modules/features/settings/SettingsCommandsSection.md`
- `docs/modules/features/settings/OpenCodianSettings.md`
- `docs/modules/README.md`
- `docs/status/feature-agents-commands-phase-11.md`

## Validation

- Targeted: `npm test -- --runInBand tests/unit/features/settings/SettingsCommandsSection.test.ts`
- Lint: `npm run lint`
- Typecheck: `npm run typecheck`
- Full tests: `npm test`
- Build: `npm run build`

## Next recommended slice

- Continue ordered plan item 6 with the project command editor shell: create/edit/delete `.opencode/opencode.json` `command.<id>` fields (`template`, `description`, `agent`, `model`, `subtask`) on top of the new catalog, while still leaving slash execution, OpenCodian placeholder expansion, and command-owned hidden agent generation for later slices.

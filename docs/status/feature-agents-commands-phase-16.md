# Feature Agents / Commands Phase 16

> Date: 2026-04-17
> Status: completed
> Slice: ordered plan item 6 — command-owned hidden agent generation for command-local sampling

## Completed slice

- Added command-local `temperature` / `top_p` fields to the Commands settings editor and validated them as optional numbers.
- Implemented command-owned hidden agent generation in `OpencodeConfigManager`: explicit sampling patches now create or update a stable hidden project agent at `agent["opencodian-command:<id>"]`, point the command at that generated agent, and clean it up when sampling is cleared or the command is removed.
- Preserved project-agent-based command behavior when possible by seeding generated agents from the current project agent entry before applying hidden/sampling overrides, and stored base-agent metadata in `options.opencodianCommand`.
- Updated the Commands catalog/editor merge so generated hidden agent IDs stay hidden from the UI while their sampling values and stored base agent still round-trip through the editor.
- Documented the new config/settings ownership and added focused coverage for manager lifecycle, editor save/validation, and catalog backfill behavior.

## Scope and boundaries

- Stayed inside ordered plan item 6 and completed only the command-owned hidden agent slice hinted for command-local sampling.
- Kept slash execution ownership in the existing runtime seam; no autocomplete UI, slash menu rendering, or hidden-menu behavior changes were started.
- Kept new logic out of `OpenCodianView` and `OpenCodeService`; the work lives in config/settings owners plus the small shared command-scoped-agent helper.
- No Test Vault deployment was run.

## Files changed

- `src/core/config/commandScopedAgent.ts`
- `src/core/config/OpencodeConfigManager.ts`
- `src/core/types/opencodeConfig.ts`
- `src/features/settings/SettingsCommandsSection.ts`
- `src/features/settings/SettingsProjectCommandEditor.ts`
- `src/i18n/locales/en.ts`
- `src/i18n/locales/zh.ts`
- `tests/unit/core/config/OpencodeConfigManager.commandScopedAgent.test.ts`
- `tests/unit/core/config/OpencodeConfigManager.test.ts`
- `tests/unit/features/settings/SettingsCommandsSection.test.ts`
- `tests/unit/features/settings/SettingsProjectCommandEditor.test.ts`
- `docs/modules/core/config/OpencodeConfigManager.md`
- `docs/modules/core/types/opencodeConfig.md`
- `docs/modules/features/settings/OpenCodianSettings.md`
- `docs/modules/features/settings/SettingsCommandsSection.md`
- `docs/modules/features/settings/SettingsProjectCommandEditor.md`
- `docs/status/feature-agents-commands-phase-16.md`

## Validation

- Targeted: `npm test -- --runInBand tests/unit/core/config/OpencodeConfigManager.test.ts tests/unit/core/config/OpencodeConfigManager.commandScopedAgent.test.ts tests/unit/features/settings/SettingsProjectCommandEditor.test.ts tests/unit/features/settings/SettingsCommandsSection.test.ts`
- Lint: `npm run lint`
- Typecheck: `npm run typecheck`
- Full tests: `npm test`
- Build: `npm run build`

## Next recommended slice

- Continue ordered plan item 6 by wiring slash autocomplete / menu UI to the merged runtime + project command catalog, respecting `hiddenSlashCommands` and the existing slash execution seam.

# Feature Agents / Commands Phase 17

> Date: 2026-04-17
> Status: completed
> Slice: ordered plan item 6 — slash autocomplete/menu UI on merged command catalog

## Completed slice

- Extracted the shared runtime+project slash command catalog merge into `src/core/config/slashCommandCatalog.ts`, including runtime filtering, project overrides, hidden-command flags, and command-owned hidden-agent backfill.
- Reused the shared catalog from the Commands settings section so settings visibility toggles and chat autocomplete now read the same merged command semantics.
- Wired the composer input shell to load visible slash menu items from the merged catalog, excluding `hiddenSlashCommands`, locally filter while the first `/...` command token is active, and support mouse plus `ArrowUp` / `ArrowDown` / `Enter` / `Tab` / `Escape` interactions.
- Kept slash execution on the existing send pipeline and `SlashCommandExecutionService` seam: selecting a menu item only inserts `/<id> ` into the textarea, and manual execution remains unchanged.
- Added focused coverage for shared catalog merging/visibility and composer slash menu rendering, filtering, selection, and close behavior.

## Scope and boundaries

- Stayed inside ordered plan item 6 and completed only the slash autocomplete/menu slice hinted by phase 16.
- Did not change `OpenCodeService` or add new slash execution ownership to `OpenCodianView`; the view only supplies a small host callback that assembles the shared catalog for the existing composer owner.
- Did not edit `reference-projects/` and did not deploy or copy to any Test Vault.

## Files changed

- `src/core/config/slashCommandCatalog.ts`
- `src/features/chat/OpenCodianView.ts`
- `src/features/chat/services/ComposerInputShellCoordinator.ts`
- `src/features/settings/SettingsCommandsSection.ts`
- `src/style/features/chat-assistant.css`
- `styles.css`
- `tests/unit/core/config/slashCommandCatalog.test.ts`
- `tests/unit/features/chat/ComposerInputShellCoordinator.test.ts`
- `docs/modules/core/config/index.md`
- `docs/modules/core/config/slashCommandCatalog.md`
- `docs/modules/features/chat/services/ComposerInputShellCoordinator.md`
- `docs/modules/features/settings/SettingsCommandsSection.md`
- `docs/modules/style/features/chat-assistant.md`
- `docs/status/feature-agents-commands-phase-17.md`

## Validation

- Targeted: `npm test -- --runInBand tests/unit/core/config/slashCommandCatalog.test.ts tests/unit/features/chat/ComposerInputShellCoordinator.test.ts tests/unit/features/settings/SettingsCommandsSection.test.ts`
- Lint: `npm run lint`
- Typecheck: `npm run typecheck`
- Full tests: `npm test`
- Build: `npm run build`

## Next recommended slice

- Start ordered plan item 7 with a feature-completion audit and final verification pass across session settings, persistent context paths, Agents settings, and Commands/slash runtime; close only any directly discovered docs/test gaps before declaring the feature objective complete.

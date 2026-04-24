# Phase 1 — Slash runtime catalog and execution alignment

## Round Design

- **Exact `[NEXT]` slice**: `C1 - Complete runtime slash catalog and execution alignment` from `docs/status/lanes/s2-slash-sdk/autopilot-round-roadmap.md`.
- **Targeted files/modules**:
  - `src/core/config/slashCommandCatalog.ts` — change the chat-visible projection so autocomplete only receives backend prompt commands that are runtime-available now; keep project-only entries in the merged settings catalog.
  - `src/features/chat/services/SlashCommandExecutionService.ts` — change manual slash interception so project config alone does not make a command executable before the runtime exposes it.
  - `src/features/chat/services/slashCommandMenuFilter.ts` — audit-only; confirm the existing `direct` vs `/skills` filtering still works once project-only menu items disappear.
  - `src/features/chat/services/SlashCommandMenuCatalogCache.ts` — audit-only; confirm the existing cache/invalidation behavior remains correct after the visible projection tightens.
  - `tests/unit/core/config/slashCommandCatalog.test.ts`
  - `tests/unit/features/chat/SlashCommandExecutionService.test.ts`
  - `tests/unit/features/chat/SlashCommandMenuCatalogCache.test.ts`
  - `tests/unit/features/chat/ComposerInputShellCoordinator.test.ts`
  - matching module docs for `slashCommandCatalog`, `SlashCommandExecutionService`, and `SlashCommandMenuCatalogCache` if their documented runtime semantics change
- **Current gaps this slice will fix**:
  - chat autocomplete currently includes `runtimeAvailable: false` project-only commands even though `sdk.command.list()` is the upstream runtime truth for backend prompt commands.
  - manual `/command ...` execution currently trusts project config alone and can call `session.command()` for commands the runtime has not registered yet.
  - the related tests/docs currently encode those runtime-truth mismatches, so they need to move with the code.
- **Upstream SDK/command contract to confirm**:
  - `sdk.command.list()` is the executable backend-command source of truth for runtime prompt commands; project config may describe future commands, but not all of them are immediately runnable.
  - skills are still backend prompt commands, distinct from frontend/TUI slash commands, and remain eligible for direct or `/skills <name>` invocation based on `slashCommandSkillMode`.
  - `slashCommandMenuFilter.ts` is audit-only for this slice because its job is still local filtering of whatever runtime-backed menu items it receives plus the synthetic `/skills` entry.
  - cache invalidation/warm-preload semantics in `SlashCommandMenuCatalogCache.ts` are audit-only unless tightened runtime visibility exposes a real stale-menu bug during implementation.
- **Tests to run**:
  - `npm test -- --runTestsByPath tests/unit/core/config/slashCommandCatalog.test.ts tests/unit/features/chat/SlashCommandExecutionService.test.ts tests/unit/features/chat/SlashCommandMenuCatalogCache.test.ts tests/unit/features/chat/ComposerInputShellCoordinator.test.ts`
  - `npm run verify`
- **Non-goals / boundaries**:
  - do not change permission behavior or lane `s1-permission-sdk`
  - do not rewrite command-settings wording or broader settings UX; that stays in queued slice `C2`
  - do not add frontend/TUI slash commands or alter unrelated composer UX
  - do not introduce server-restart/config-invalidate machinery unless the focused runtime-alignment fix proves it is strictly necessary for this slice

## Review Log

- Plan review: PASS — confirmed the two concrete C1 gaps were (1) project-only commands leaking into chat autocomplete via `buildVisibleSlashCommandMenuItems()` and (2) manual slash execution trusting project config before runtime registration.
- Code review: PASS — confirmed the runtime-first catalog/execution fix, unchanged audit-only files, updated docs, and passing targeted tests.

## Implementation Notes

- `src/core/config/slashCommandCatalog.ts` now drops `runtimeAvailable: false` entries from the chat-visible slash menu projection while keeping them in the merged settings catalog.
- `src/features/chat/services/SlashCommandExecutionService.ts` now requires runtime catalog confirmation before intercepting manual `/command ...` execution; project overrides still adjust semantics once the runtime entry exists.
- `src/features/chat/services/slashCommandMenuFilter.ts` and `src/features/chat/services/SlashCommandMenuCatalogCache.ts` stayed code-identical for this slice after audit; only their tests/docs were updated around the tighter runtime-visible projection.
- Module docs were updated so settings/catalog semantics still mention project-only commands, while chat/runtime docs now describe runtime-backed visibility and execution truth.

## Validation

- Targeted tests: `npm test -- --runTestsByPath tests/unit/core/config/slashCommandCatalog.test.ts tests/unit/features/chat/SlashCommandExecutionService.test.ts tests/unit/features/chat/SlashCommandMenuCatalogCache.test.ts tests/unit/features/chat/ComposerInputShellCoordinator.test.ts`
- Full validation: `npm run verify`
- Build result from `npm run verify`: `BUILD_ID=autopilot-sdk-permission-slash-sdk.202604241236`

## Round Summary

- **Status**: success
- **Changed files**:
  - `src/core/config/slashCommandCatalog.ts`
  - `src/features/chat/services/SlashCommandExecutionService.ts`
  - `tests/unit/core/config/slashCommandCatalog.test.ts`
  - `tests/unit/features/chat/SlashCommandExecutionService.test.ts`
  - `tests/unit/features/chat/SlashCommandMenuCatalogCache.test.ts`
  - `tests/unit/features/chat/ComposerInputShellCoordinator.test.ts`
  - `docs/modules/core/config/slashCommandCatalog.md`
  - `docs/modules/features/chat/services/SlashCommandExecutionService.md`
  - `docs/modules/features/chat/services/SlashCommandMenuCatalogCache.md`
  - `docs/modules/features/settings/SettingsCommandsSection.md`
  - `docs/status/lanes/s2-slash-sdk/autopilot-round-roadmap.md`
- **Behavior outcome**: chat slash autocomplete now only advertises runtime-backed prompt commands, and manual slash execution no longer treats project config alone as executable authority.
- **Design review result**: PASS
- **Code review result**: PASS
- **Tests run**:
  - `npm test -- --runTestsByPath tests/unit/core/config/slashCommandCatalog.test.ts tests/unit/features/chat/SlashCommandExecutionService.test.ts tests/unit/features/chat/SlashCommandMenuCatalogCache.test.ts tests/unit/features/chat/ComposerInputShellCoordinator.test.ts`
  - `npm run verify`
- **Next recommended slice**: `C2 - Align command settings wording and human-facing semantics`

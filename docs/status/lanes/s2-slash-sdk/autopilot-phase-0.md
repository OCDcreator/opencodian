# Phase 0 — Slash SDK Lane Baseline

- **Lane**: `s2-slash-sdk`
- **Status**: waiting on `s1-permission-sdk`
- **Objective**: align runtime slash command behavior and command settings semantics with the upstream command architecture doc
- **Seed plan**: `docs/superpowers/plans/2026-04-24-opencode-sdk-permission-slash-alignment.md`
- **Entry modules**:
  - `src/core/config/slashCommandCatalog.ts`
  - `src/features/chat/services/SlashCommandMenuCatalogCache.ts`
  - `src/features/chat/services/slashCommandMenuFilter.ts`
  - `src/features/settings/OpenCodianSettings.ts`
  - `src/main.ts`

## Notes

- This lane must distinguish backend prompt commands from frontend/TUI commands per the upstream architecture doc.

# Autopilot Round Roadmap — `s2-slash-sdk`

## Queue

### [DONE] C1 - Complete runtime slash catalog and execution alignment

- **Lane**: Slash runtime
- **Goal**: Confirm runtime/project/skill command loading and invalidation behavior matches the upstream slash command architecture and current OpenCodian SDK integration goals.
- **Priority entrypoints**:
  - `src/core/config/slashCommandCatalog.ts`
  - `src/features/chat/services/SlashCommandMenuCatalogCache.ts`
  - `src/features/chat/services/slashCommandMenuFilter.ts`
  - `src/main.ts`
  - `tests/unit/main.test.ts`
- **Constraints**:
  - Preserve current foreground UX and menu flow unless the slice explicitly changes it
  - Keep runtime/project/skill distinctions visible
- **Acceptance**:
  - Slash catalog/runtime behavior matches the queue item and upstream contract
  - Cache invalidation / warm preload behavior stays coherent
  - The post-change OpenCode CLI review passes

### [DONE] C2 - Align command settings wording and human-facing semantics

- **Lane**: Slash settings
- **Goal**: Make the command settings/editor surface reflect the real runtime behavior, including skill mode and generated command-local agent semantics.
- **Priority entrypoints**:
  - `src/features/settings/OpenCodianSettings.ts`
  - `src/i18n/locales/en.ts`
  - `src/i18n/locales/zh.ts`
  - directly related settings tests and docs
- **Constraints**:
  - Keep product language understandable to humans
  - Avoid changing unrelated settings sections
- **Acceptance**:
  - The command settings UI is internally consistent and accurate
  - Related tests/docs are updated
  - The post-change OpenCode CLI review passes

## Lane state

- When this roadmap has no remaining `[NEXT]` or `[QUEUED]` items, the controller switches to `s3-checkpoint`.

# Autopilot Round Roadmap — `m3-checkpoint`

## Queue

### [NEXT] Task 7 - Rework reload/finalization as canonical compensation

- **Plan source**: `docs/superpowers/plans/2026-04-21-opencode-session-message-alignment.md` Task 7.
- **Goal**: Make authoritative reload and finalization replace/compare canonical state, add blank-block diagnostics, and cover the real failure classes with regressions.
- **Key files**:
  - `src/features/chat/services/ConversationAuthoritativeSyncCoordinator.ts`
  - `src/features/chat/services/ConversationSyncBridge.ts`
  - `src/features/chat/services/MessageFinalizationService.ts`
  - `src/features/chat/services/ConversationRenderService.ts`
  - `src/core/opencode/OpenCodeService.ts`
  - matching regression tests and module docs from the plan.
- **Validation**: `npm test -- --runInBand tests/unit/features/chat/MessageFinalizationService.test.ts tests/unit/features/chat/ConversationSyncBridge.test.ts tests/unit/features/chat/ConversationRenderService.renderFlows.test.ts tests/unit/core/opencode/OpenCodeService.messageCompatibility.test.ts tests/unit/core/opencode/OpenCodeService.omoCompatibility.test.ts`
- **Final gates after this task**:
  - `npm run verify`
  - `npm run check:module-docs`
- **Acceptance**: reload/finalization is a compensation path over canonical turns; blank-block and plugin synthetic-part regressions are covered.

## Lane State

- When Task 7 is complete and no `[NEXT]` or `[QUEUED]` items remain here, the overall session-message-alignment autopilot queue is complete.

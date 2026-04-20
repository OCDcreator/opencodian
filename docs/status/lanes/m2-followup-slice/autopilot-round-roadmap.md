# Autopilot Round Roadmap — `m2-followup-slice`

## Queue

### [NEXT] Task 4 - Make stream processing update canonical parts

- **Plan source**: `docs/superpowers/plans/2026-04-21-opencode-session-message-alignment.md` Task 4.
- **Goal**: Convert stream events into canonical message/part mutations instead of only loose text chunks.
- **Key files**:
  - `src/core/opencode/OpenCodeStreamEventTransformer.ts`
  - `src/core/opencode/OpenCodeService.ts`
  - `src/core/opencode/types.ts`
  - `src/features/chat/services/ConversationSessionSignalRuntime.ts`
  - matching stream tests and module docs from the plan.
- **Validation**: `npm test -- --runInBand tests/unit/core/opencode/OpenCodeStreamEventTransformer.test.ts tests/unit/core/opencode/OpenCodeStreamingRuntimeCoordinator.test.ts tests/unit/core/opencode/OpenCodeService.sdkStreamEvents.test.ts`
- **Acceptance**: blank assistant blocks no longer come from loose stream text drifting away from sync/reload facts.

### [QUEUED] Task 5 - Introduce a turn view-model builder while keeping the UI shell

- **Plan source**: `docs/superpowers/plans/2026-04-21-opencode-session-message-alignment.md` Task 5.
- **Goal**: Build OpenCode-style turn view-models from canonical state while preserving OpenCodian DOM/CSS rendering helpers.
- **Key files**:
  - Create `src/features/chat/services/ConversationTurnViewModelBuilder.ts`
  - Modify `src/features/chat/services/ConversationRenderService.ts`
  - Add `tests/unit/features/chat/ConversationTurnViewModelBuilder.test.ts`
  - Update render tests and module docs from the plan.
- **Validation**: `npm test -- --runInBand tests/unit/features/chat/ConversationTurnViewModelBuilder.test.ts tests/unit/features/chat/ConversationRenderService.test.ts tests/unit/features/chat/ConversationRenderService.renderFlows.test.ts`
- **Acceptance**: live and reloaded canonical states produce the same turn structure while existing styling remains intact.

### [QUEUED] Task 6 - Align command, shell, and plugin-injection semantics

- **Plan source**: `docs/superpowers/plans/2026-04-21-opencode-session-message-alignment.md` Task 6.
- **Goal**: Distinguish prompt sends from session command/shell execution and preserve plugin-injected material as structured synthetic parts.
- **Key files**:
  - `src/core/opencode/OpenCodePromptRequestBuilder.ts`
  - `src/core/opencode/OpenCodeSessionControlOrchestrator.ts`
  - `src/core/opencode/OpenCodeService.ts`
  - `src/features/chat/services/ComposerInputShellCoordinator.ts`
  - `src/features/chat/services/MessageSendPreparationService.ts`
  - matching command/plugin tests and module docs from the plan.
- **Validation**: `npm test -- --runInBand tests/unit/core/opencode/OpenCodeSessionControlOrchestrator.test.ts tests/unit/core/opencode/OpenCodePromptRequestBuilder.test.ts tests/unit/features/chat/ComposerInputShellCoordinator.test.ts tests/unit/features/chat/ComposerInputShellCoordinatorSkills.test.ts`
- **Acceptance**: ordinary input, slash command, shell command, and plugin-injected synthetic parts all follow structured semantics.

## Lane State

- When Task 4-6 are complete and no `[NEXT]` or `[QUEUED]` items remain here, the controller switches to `m3-checkpoint`.

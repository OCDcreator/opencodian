# Autopilot Round Roadmap — `m1-hotspot-slice`

## Queue

### [DONE] Task 1 - Introduce the canonical session graph owner

- **Plan source**: `docs/superpowers/plans/2026-04-21-opencode-session-message-alignment.md` Task 1.
- **Goal**: Add `OpenCodeSessionStateStore` as the canonical `session/message/part` graph owner and wire `OpenCodeService` snapshots into it.
- **Key files**:
  - Create `src/core/opencode/OpenCodeSessionStateStore.ts`
  - Modify `src/core/opencode/types.ts`
  - Modify `src/core/opencode/OpenCodeService.ts`
  - Add `tests/unit/core/opencode/OpenCodeSessionStateStore.test.ts`
  - Update `tests/unit/core/opencode/OpenCodeService.sdkCrudSync.test.ts`
  - Add `docs/modules/core/opencode/OpenCodeSessionStateStore.md`
  - Update `docs/modules/core/opencode/OpenCodeService.md`
- **Validation**: `npm test -- --runInBand tests/unit/core/opencode/OpenCodeSessionStateStore.test.ts tests/unit/core/opencode/OpenCodeService.sdkCrudSync.test.ts`
- **Acceptance**: OpenCodian has a stable canonical `session/message/part` truth layer and reducer-style tests pass.

### [NEXT] Task 2 - Reshape send preparation around stable `messageID + parts[]`

- **Plan source**: `docs/superpowers/plans/2026-04-21-opencode-session-message-alignment.md` Task 2.
- **Goal**: Make send preparation return structured payloads with stable message and part IDs for optimistic seed and SDK request.
- **Key files**:
  - `src/core/opencode/OpenCodePromptRequestBuilder.ts`
  - `src/core/opencode/OpenCodeContextPartSerializer.ts`
  - `src/core/opencode/OpenCodeService.ts`
  - `src/features/chat/services/MessageSendPreparationService.ts`
  - matching tests and module docs from the plan.
- **Validation**: `npm test -- --runInBand tests/unit/core/opencode/OpenCodePromptRequestBuilder.test.ts tests/unit/core/opencode/OpenCodeService.sdkPromptTransport.test.ts tests/unit/features/chat/MessageSendPreparationService.test.ts`
- **Acceptance**: ordinary text, context/file, system/tools/agent options, and optimistic seed use the same stable structured IDs.

### [QUEUED] Task 3 - Convert sync-event handling from reload signal to graph mutation

- **Plan source**: `docs/superpowers/plans/2026-04-21-opencode-session-message-alignment.md` Task 3.
- **Goal**: Let `message.updated`, `message.removed`, `message.part.updated`, `message.part.removed`, and `session.diff` mutate canonical state directly.
- **Key files**:
  - `src/core/opencode/OpenCodeSyncEventRuntimeCoordinator.ts`
  - `src/core/opencode/OpenCodeService.ts`
  - `src/features/chat/services/ConversationSessionSignalRuntime.ts`
  - `src/features/chat/services/ConversationSyncBridge.ts`
  - matching tests and module docs from the plan.
- **Validation**: `npm test -- --runInBand tests/unit/core/opencode/OpenCodeSyncEventRuntimeCoordinator.test.ts tests/unit/core/opencode/OpenCodeService.sdkCrudSync.test.ts tests/unit/features/chat/ConversationSyncBridge.test.ts`
- **Acceptance**: sync-event becomes the first local merge channel instead of only triggering authoritative reload.

## Lane State

- When Task 1-3 are complete and no `[NEXT]` or `[QUEUED]` items remain here, the controller switches to `m2-followup-slice`.

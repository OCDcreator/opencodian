# Feature Agents / Commands Phase 3

> Date: 2026-04-17
> Status: completed
> Slice: ordered plan item 3 — persistent session context paths

## Completed slice

- Resolved persisted `Conversation.externalContextPaths` into real `PromptContextItem[]` before send by extending the existing composer-context send seam and context attachment builder.
- Merged persistent file-context items with one-off composer draft context during send preparation, with one-off items overriding same-target persisted file entries.
- Kept raw `QueryOptions.externalContextPaths` deprecated and unused; the send transport now receives only merged `contextItems`.
- Preserved stored `externalContextPaths` in conversation persistence and added focused regression coverage around storage, send preparation, and send transport behavior.

## Scope and boundaries

- Stayed inside existing chat/runtime owners: `ContextAttachmentBuilder`, `ComposerContextViewFacade`, `MessageSendPreparationService`, and `SendPipelineRuntime`.
- Did not add new runtime ownership to `src/features/chat/OpenCodianView.ts` or `src/core/opencode/OpenCodeService.ts`.
- Kept the slice focused on persistent context-path resolution and merge behavior only; did not start session settings UI, Agents UI, or slash-command work.
- Updated only the directly related module docs under `docs/modules/features/chat/**`.

## Files changed

- `src/features/chat/services/ContextAttachmentBuilder.ts`
- `src/features/chat/services/ComposerContextViewFacade.ts`
- `src/features/chat/services/MessageSendPreparationService.ts`
- `src/features/chat/runtime/SendPipelineRuntime.ts`
- `tests/unit/features/chat/ContextAttachmentBuilder.test.ts`
- `tests/unit/features/chat/MessageSendPreparationService.test.ts`
- `tests/unit/features/chat/SendPipelineRuntime.test.ts`
- `tests/unit/core/storage/StorageService.test.ts`
- `docs/modules/features/chat/services/ContextAttachmentBuilder.md`
- `docs/modules/features/chat/services/ComposerContextViewFacade.md`
- `docs/modules/features/chat/services/MessageSendPreparationService.md`
- `docs/modules/features/chat/runtime/SendPipelineRuntime.md`

## Validation

- Targeted: `npm test -- --runInBand tests/unit/features/chat/ContextAttachmentBuilder.test.ts tests/unit/features/chat/MessageSendPreparationService.test.ts tests/unit/features/chat/SendPipelineRuntime.test.ts tests/unit/core/storage/StorageService.test.ts`
- Lint: `npm run lint`
- Typecheck: `npm run typecheck`
- Full tests: `npm test`
- Build: `npm run build`

## Next recommended slice

- Ordered plan item 4: implement session settings UI/runtime by adding global defaults in the settings conversation section, introducing per-conversation overrides through a dedicated session-settings owner/modal, applying chat font size via a scoped conversation CSS variable, and wiring compaction settings writes through project `.opencode/opencode.json`.

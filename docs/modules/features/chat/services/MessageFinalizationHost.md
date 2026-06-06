# `src/features/chat/services/MessageFinalizationHost.ts`

## Responsibility

- Defines the host contract, shared option/result types, and host factory used by `MessageFinalizationService`.
- Keeps dependency-wiring details separate from the service's stream-finalization logic so the service file can focus on runtime behavior.

## Key Exports

- `shouldSyncAfterStream()`: shared gate for deciding whether a finished stream should converge through authoritative sync.
- `FinalizeMessageOptions`, `MessageFinalizationSyncResult`, `AssistantErrorRenderOptions`: typed inputs/outputs shared with `MessageFinalizationService`.
- `MessageFinalizationHost` / `MessageFinalizationHostDependencies`: the runtime contract between the service and `OpenCodianView`-owned coordinators.
- `createMessageFinalizationHost()`: assembles the host object from view/runtime dependencies.

## Claude User Message Backfill

- The host contract now includes `backfillClaudeUserMessageIdentities(conversation)`.
- `createMessageFinalizationHost()` registers the existing conversation-write helpers as the module-level fallback persistence host through `setBackfillPersistenceHost()`.
- The returned `backfillClaudeUserMessageIdentities()` still uses `ClaudeUserMessageIdentityBackfillService`, but registry lookup now comes from `getAgentServiceRegistry()` instead of a new `OpenCodianView` injection seam.
- This keeps fresh-send Claude `sourceMessageId` backfill available to `MessageFinalizationService` while also letting load/reopen recovery reuse the same serialized persistence path without growing the guarded view shell.

## Prompt Suggestion Session Resync

- `setActiveTabConversation(conversation, tabId?)` now also calls `deps.promptSuggestionSessionResync(tabId, sessionId)` after the lightweight bridge sync.
- This closes the identity race: after `LocalStreamMessagePersistence` writes the final SDK session id to `conversation.backendSessionId`, the finalization host propagates it to the prompt-suggestion service so stored suggestions can be matched and rendered.
- The emission is **scoped by channel** (not global): the `promptSuggestionSessionResync` dep is wired in `OpenCodianView` to find the tab's messages container, discover the channel via `findPromptSuggestionScope`, and emit `emitPromptSuggestionSessionChange(sessionId, channelId)`.
- This preserves multi-leaf isolation: only the target tab's coordinator receives the session change. Other leaves are unaffected.
- `MessageFinalizationService` passes `tabId` to `setActiveTabConversation` so the scoped seam knows which tab's channel to target.

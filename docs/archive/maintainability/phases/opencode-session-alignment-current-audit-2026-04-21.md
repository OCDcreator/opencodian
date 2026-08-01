# OpenCode Session Alignment Current Audit

> Date: 2026-04-21
> Scope: current-code audit only; no runtime code changes.
> Current project: `C:\Users\lt\Desktop\Write\custom-project\opencodian`
> Reference project: `C:\Users\lt\Desktop\Write\open-source-project\AI-tools-agents\opencode`

## Verdict

**Conclusion:** `大体对齐但仍有关键差异`

OpenCodian now has a real local canonical `session/message/part` graph, and current code writes reload, sync, and stream events into that graph. It is not yet the same session mechanism as the reference OpenCode project because render, reload, finalization, local persistence, and some extension paths still pass through OpenCodian-owned `ChatMessage[]` / `Conversation.messages` compensation layers.

Key reasons:

1. `OpenCodeSessionStateStore` is a genuine canonical graph, but `Conversation.messages` still participates in send, stream finalization, authoritative sync, fingerprinting, and render fallback.
2. Non-`session.diff` sync events mutate canonical state first, but the UI still schedules local conversation sync and merge work instead of rendering only from the canonical graph.
3. `session.diff` is not a canonical message/part correction in OpenCodian; it triggers a sync path, while reference OpenCode stores diff separately from message graph updates.
4. Finalization still performs post-stream server sync, fingerprint comparison, and render follow-up, proving the live stream path is not yet guaranteed to equal reload/post-sync output.
5. Live stream rendering still consumes converted local stream chunks, even though stream mutations also update canonical state.
6. Plugin synthetic prompt handling is improved, but server-side OpenCode plugin hooks still own message transformation in the reference implementation.
7. Shell submission is not unified in the stable OpenCodian view, while reference OpenCode routes shell through the session API.

## Evidence Summary

| Dimension | OpenCodian Current Implementation | OpenCode Reference Implementation | Equivalent? | Evidence |
| --- | --- | --- | --- | --- |
| session source of truth | `OpenCodeSessionStateStore` stores canonical sessions, messages, and parts; `Conversation.messages` remains a runtime field. | Session/message/part state is owned by service-side Session APIs and SyncEvent projectors. | Partial | `src/core/opencode/OpenCodeSessionStateStore.ts:45`; `src/core/types/chat.ts:335`; `C:\Users\lt\Desktop\Write\open-source-project\AI-tools-agents\opencode\packages\opencode\src\session\session.ts:476`; `C:\Users\lt\Desktop\Write\open-source-project\AI-tools-agents\opencode\packages\opencode\src\session\projectors.ts:83` |
| message/part lifecycle | Reload snapshots, sync events, and stream mutations upsert/remove canonical messages and parts. | `updateMessage`, `updatePart`, `removeMessage`, and `removePart` emit SyncEvents projected to durable tables. | Mostly aligned, different owner | `src/core/opencode/OpenCodeService.ts:1103`; `src/core/opencode/OpenCodeService.ts:1111`; `src/core/opencode/OpenCodeService.ts:1168`; `C:\Users\lt\Desktop\Write\open-source-project\AI-tools-agents\opencode\packages\opencode\src\session\session.ts:476`; `C:\Users\lt\Desktop\Write\open-source-project\AI-tools-agents\opencode\packages\opencode\src\session\session.ts:625` |
| send flow | `MessageSendPreparationService` builds structured parts, seeds canonical user state, then also pushes an optimistic user `ChatMessage`. | `SessionPrompt.prompt()` resolves parts, triggers plugin hooks, then saves user message/parts through Session APIs. | Partial | `src/features/chat/services/MessageSendPreparationService.ts:199`; `src/features/chat/services/MessageSendPreparationService.ts:209`; `src/features/chat/services/MessageSendPreparationService.ts:217`; `C:\Users\lt\Desktop\Write\open-source-project\AI-tools-agents\opencode\packages\opencode\src\session\prompt.ts:941`; `C:\Users\lt\Desktop\Write\open-source-project\AI-tools-agents\opencode\packages\opencode\src\session\prompt.ts:1234`; `C:\Users\lt\Desktop\Write\open-source-project\AI-tools-agents\opencode\packages\opencode\src\session\prompt.ts:1270` |
| stream flow | Stream mutations update canonical state, but visible streaming still uses converted local chunks. | Processor/session updates create assistant message/parts and publish message/part events used by the TUI store. | Partial | `src/core/opencode/OpenCodeService.ts:1162`; `src/core/opencode/OpenCodeService.ts:1216`; `src/features/chat/runtime/StreamChunkRouter.ts:194`; `src/features/chat/OpenCodianView.ts:4923`; `C:\Users\lt\Desktop\Write\open-source-project\AI-tools-agents\opencode\packages\opencode\src\session\prompt.ts:1408`; `C:\Users\lt\Desktop\Write\open-source-project\AI-tools-agents\opencode\packages\opencode\src\cli\cmd\tui\context\sync.tsx:287` |
| sync events | `OpenCodeService` applies `message.updated`, `message.removed`, `message.part.updated`, `message.part.removed`, and `message.part.delta` to canonical state; UI then syncs conversations from canonical or server fallback. | TUI store directly upserts/removes messages and parts from events. | Partial | `src/core/opencode/OpenCodeService.ts:280`; `src/core/opencode/OpenCodeService.ts:1111`; `src/features/chat/services/ConversationSyncBridge.ts:203`; `C:\Users\lt\Desktop\Write\open-source-project\AI-tools-agents\opencode\packages\opencode\src\cli\cmd\tui\context\sync.tsx:234`; `C:\Users\lt\Desktop\Write\open-source-project\AI-tools-agents\opencode\packages\opencode\src\cli\cmd\tui\context\sync.tsx:287` |
| `session.diff` | Canonical message/part state ignores `session.diff`; view runtime schedules conversation sync. | TUI writes `session.diff` into `session_diff` state; message state is not reloaded from that event. | Not equivalent | `src/core/opencode/OpenCodeService.ts:1157`; `src/features/chat/services/ConversationSessionSignalRuntime.ts:75`; `src/features/chat/services/ConversationSyncBridge.ts:204`; `C:\Users\lt\Desktop\Write\open-source-project\AI-tools-agents\opencode\packages\opencode\src\cli\cmd\tui\context\sync.tsx:198`; `C:\Users\lt\Desktop\Write\open-source-project\AI-tools-agents\opencode\packages\opencode\src\session\session.ts:238` |
| reload / authoritative sync | Server or canonical snapshots are hydrated to `ChatMessage[]`, merged with `conversation.messages`, fingerprinted, and persisted. | `sync(sessionID)` loads session/messages/todo/diff and writes the TUI store from service data. | Partial, still dual path | `src/features/chat/services/ConversationAuthoritativeReloadCoordinator.ts:85`; `src/features/chat/services/ConversationAuthoritativeReloadCoordinator.ts:142`; `src/features/chat/services/ConversationAuthoritativeReloadCoordinator.ts:272`; `src/features/chat/services/ConversationAuthoritativeReloadCoordinator.ts:427`; `C:\Users\lt\Desktop\Write\open-source-project\AI-tools-agents\opencode\packages\opencode\src\cli\cmd\tui\context\sync.tsx:499`; `C:\Users\lt\Desktop\Write\open-source-project\AI-tools-agents\opencode\packages\opencode\src\cli\cmd\tui\context\sync.tsx:507` |
| finalization | `MessageFinalizationService` can request server sync, compare fingerprints, and apply synced render updates. | Reference TUI derives pending/completed state from message/part state; no equivalent local post-stream repair layer. | Not equivalent | `src/features/chat/services/MessageFinalizationService.ts:89`; `src/features/chat/services/MessageFinalizationService.ts:155`; `src/features/chat/services/MessageFinalizationService.ts:212`; `C:\Users\lt\Desktop\Write\open-source-project\AI-tools-agents\opencode\packages\opencode\src\cli\cmd\tui\routes\session\index.tsx:147` |
| render input | Render prefers canonical-derived `ChatMessage[]` when canonical state exists, otherwise falls back to `Conversation.messages`; render still groups/merges local chat messages. | TUI renders from `messages()` produced by sync store message state. | Mostly aligned, not unique input | `src/features/chat/services/ConversationRenderService.ts:252`; `src/features/chat/services/ConversationTurnViewModelBuilder.ts:46`; `src/features/chat/services/ConversationRenderRuntime.ts:312`; `src/features/chat/OpenCodianView.ts:4575`; `C:\Users\lt\Desktop\Write\open-source-project\AI-tools-agents\opencode\packages\opencode\src\cli\cmd\tui\routes\session\index.tsx:1064` |
| turn assembly | Local `ConversationTurnViewModelBuilder` groups by user messages and attaches following assistant messages. | TUI iterates canonical messages directly and derives pending/last assistant from message state. | Different local implementation | `src/features/chat/services/ConversationTurnViewModelBuilder.ts:45`; `src/features/chat/services/ConversationTurnViewModelBuilder.ts:76`; `C:\Users\lt\Desktop\Write\open-source-project\AI-tools-agents\opencode\packages\opencode\src\cli\cmd\tui\routes\session\index.tsx:147`; `C:\Users\lt\Desktop\Write\open-source-project\AI-tools-agents\opencode\packages\opencode\src\cli\cmd\tui\routes\session\index.tsx:1064` |
| persistence | `Conversation.messages` is persisted and still participates in runtime decisions. | Durable message/part tables are maintained by SyncEvent projectors; TUI store is a view cache. | Not equivalent | `src/core/types/chat.ts:343`; `src/features/chat/runtime/LocalStreamMessagePersistence.ts:77`; `src/features/chat/services/ConversationAuthoritativeReloadCoordinator.ts:427`; `C:\Users\lt\Desktop\Write\open-source-project\AI-tools-agents\opencode\packages\opencode\src\session\projectors.ts:83`; `C:\Users\lt\Desktop\Write\open-source-project\AI-tools-agents\opencode\packages\opencode\src\session\projectors.ts:115` |
| plugin / injected prompt / synthetic parts | Synthetic text can be sent as structured parts, but OpenCodian prepares this client-side before service send. | Server-side plugin hooks can mutate message/parts before save and transform model messages before processing. | Partial | `src/features/chat/services/MessageSendPreparationService.ts:199`; `C:\Users\lt\Desktop\Write\open-source-project\AI-tools-agents\opencode\packages\opencode\src\session\prompt.ts:1234`; `C:\Users\lt\Desktop\Write\open-source-project\AI-tools-agents\opencode\packages\opencode\src\session\prompt.ts:1471`; `C:\Users\lt\Desktop\Write\open-source-project\AI-tools-agents\opencode\packages\opencode\src\session\prompt.ts:1640` |
| shell / command / question paths | Stable OpenCodian view ignores shell composer submissions; command/question paths are bridged locally. | Prompt UI routes shell, command, and normal prompt through session API calls. | Not equivalent for shell | `src/features/chat/OpenCodianView.ts:766`; `C:\Users\lt\Desktop\Write\open-source-project\AI-tools-agents\opencode\packages\opencode\src\cli\cmd\tui\component\prompt\index.tsx:725`; `C:\Users\lt\Desktop\Write\open-source-project\AI-tools-agents\opencode\packages\opencode\src\cli\cmd\tui\component\prompt\index.tsx:751`; `C:\Users\lt\Desktop\Write\open-source-project\AI-tools-agents\opencode\packages\opencode\src\server\routes\instance\session.ts:963` |

## Critical Differences

### 1. `Conversation.messages` is still runtime truth, not just cache

- **Where:** `src/features/chat/services/MessageSendPreparationService.ts:217`, `src/features/chat/runtime/LocalStreamMessagePersistence.ts:49`, `src/features/chat/services/ConversationAuthoritativeReloadCoordinator.ts:272`, `src/features/chat/services/ConversationAuthoritativeReloadCoordinator.ts:427`.
- **Why not equivalent:** Reference OpenCode treats service-side message/part state as the canonical graph. OpenCodian still pushes, merges, fingerprints, and persists `ChatMessage[]` as part of runtime state.
- **Type:** Architecture difference.
- **Risk:** Live render, reload, and post-sync can disagree; fallback/client-only fields can preserve stale content, tool cards, stream state, or structured payloads.

### 2. Authoritative sync is still a local compensation path

- **Where:** `src/features/chat/services/ConversationAuthoritativeReloadCoordinator.ts:85`, `src/features/chat/services/ConversationAuthoritativeReloadCoordinator.ts:142`, `src/features/chat/services/ConversationAuthoritativeReloadCoordinator.ts:267`, `src/features/chat/services/ConversationAuthoritativeReloadCoordinator.ts:422`.
- **Why not equivalent:** Even canonical sync is converted into `ChatMessage[]`, merged with existing `conversation.messages`, and persisted. Reference reload/sync hydrates canonical message and part stores directly.
- **Type:** Architecture difference.
- **Risk:** Reload can be a second truth path rather than a correction pass over canonical state; interrupted notices or client-only assistant messages can survive in ways not represented in the OpenCode graph.

### 3. `session.diff` still schedules reload-like work

- **Where:** `src/core/opencode/OpenCodeService.ts:1157`, `src/features/chat/services/ConversationSessionSignalRuntime.ts:75`, `src/features/chat/services/ConversationSyncBridge.ts:204`.
- **Why not equivalent:** OpenCodian ignores `session.diff` in canonical message/part state but uses it as a signal to schedule conversation sync. Reference TUI stores `session_diff` separately from message/part graph updates.
- **Type:** Architecture difference.
- **Risk:** File diff changes can accidentally drive message reload/merge work and contribute to double-truth behavior.

### 4. Finalization still repairs drift after streaming

- **Where:** `src/features/chat/services/MessageFinalizationService.ts:89`, `src/features/chat/services/MessageFinalizationService.ts:155`, `src/features/chat/services/MessageFinalizationService.ts:212`.
- **Why not equivalent:** OpenCodian compares `Conversation.messages` fingerprints after a server sync and conditionally applies synced render updates. Reference OpenCode render state converges through message/part events and store state.
- **Type:** Architecture difference.
- **Risk:** Blank assistant blocks, tool-first responses, and structured payload drift can still be masked until finalization or reload repairs the view.

### 5. Live stream rendering still has a local chunk path

- **Where:** `src/core/opencode/OpenCodeService.ts:1162`, `src/features/chat/runtime/StreamChunkRouter.ts:194`, `src/features/chat/OpenCodianView.ts:4923`.
- **Why not equivalent:** Canonical state is updated, but visible live rendering still depends on `convertToStreamingChunk()` and the streaming controller. Reference TUI store is updated by message/part events and render reads the store.
- **Type:** Architecture plus implementation-detail difference.
- **Risk:** Text-late, reasoning-first, tool-first, and internal-tool cases can render differently live than after reload.

### 6. Plugin and shell paths are not fully native-equivalent

- **Where:** `src/features/chat/services/MessageSendPreparationService.ts:199`, `src/features/chat/OpenCodianView.ts:766`.
- **Why not equivalent:** OpenCodian supports structured synthetic prompt parts, but reference OpenCode plugins mutate messages/parts inside server-side prompt flow. Shell is ignored in stable OpenCodian view while reference OpenCode routes shell through `session.shell`.
- **Type:** Architecture difference.
- **Risk:** Plugin-injected prompt parts may not replay identically after reload; shell command parity remains absent.

## Direct Answers

1. **Is canonical `session/message/part` state the only input for render / reload / finalization?** No. Render prefers canonical when available, but reload and finalization still operate on `Conversation.messages`.
2. **Is `Conversation.messages` persistence/cache metadata only?** No. It still participates in runtime truth decisions, sync fingerprints, local finalization, fallback render, and saved conversation state.
3. **Is `session.diff` only canonical state correction?** No. It is ignored by canonical message/part state and schedules sync work from the view layer.
4. **Is finalization native-equivalent and free of local compensation?** No. It still performs post-stream sync and render follow-up.
5. **Do live stream, reload, and post-sync converge to one session truth?** Not yet. They all touch canonical state, but local `ChatMessage[]` compensation remains in the convergence path.

## Audit Notes

- This report is based on current source inspection, not only on the previous report at `docs/status/opencode-session-alignment-audit-2026-04-21.md`.
- One previous wording should be narrowed: current `ConversationRenderService.resolveConversationRenderMessages()` chooses canonical messages when available and uses fallback only when canonical messages are empty; the bigger divergence is reload/finalization/merge/fingerprint behavior, not direct canonical+fallback render merging.
- No source or runtime files were changed while producing this audit.

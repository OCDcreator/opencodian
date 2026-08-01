# Tier 5 Canonical Read-Path Inventory: Conversation.messages Runtime Accesses

> **Date**: 2026-05-10 (revision 3, 2026-05-11; migration revision 4, 2026-05-11)
> **Scope**: `src/features/chat/`, `src/core/opencode/`, `src/core/storage/`, `src/utils/streaming/`
> **Purpose**: Source-grounded audit of every runtime path that directly reads `conversation.messages` (including aliased forms: `targetConversation.messages`, `preparedSend.conversation.messages`, `options.conversation.messages`, `loadedConversation.messages`, `currentConversation.messages`, `this.conversation?.messages`), classified for canonical-only complexity reduction.
> **Constraint**: This lane does NOT change runtime code.
> **Exclusion**: This audit covers only **direct** `conversation.messages` access points (conversation-typed objects). It does NOT count:
> - `state.messages` / `sessionState.messages` (canonical session state in `OpenCodeSessionStateStore`)
> - `group.messages` (render-group internal structure)
> - `previousMessages` / `nextMessages` / `messages: ChatMessage[]` (function parameters)
> - `data.messages` / `stored.messages` / `incoming.messages` / `parsed.messages` (storage-layer deserialized objects — covered separately in Section 8)
> - Event objects (`session.diff` entries)
> - `syncResult.messages` / `syncMerge.merged` / `canonicalSyncResult.messages` (sync result outputs)

---

## Classification Legend

| Classification | Meaning |
|---|---|
| **canonical-now** | Already delegates to `OpenCodeSessionStateStore` canonical state, or IS the canonical store itself. No migration needed. |
| **migrated** | Previously projection-needed; now reads from canonical projection first, falling back to `conversation.messages` only when canonical is unavailable. Migration complete. |
| **projection-needed** | Currently reads `conversation.messages` directly but could be refactored to consume a projected/canonical view inside its existing owner. |
| **persistence/fallback-only** | Must remain reading `conversation.messages` because it is in the persistence, serialization, fallback, or write-path layer. |

---

## Aggregate Summary

| Metric | Count |
|---|---|
| Unique files with direct `conversation.messages` access | **25** |
| Total direct `conversation.messages` access points (conversation objects) | **62** |
| READ-only access points | **53** (85%) |
| WRITE access points | **9** (15%) |
| `src/utils/streaming/` accesses | **0** — clean parameter-based boundary |
| Pre-write snapshot pattern (`[...conv.messages]`) | **4** instances |

| Classification | READ | WRITE | Total |
|---|---|---|---|
| migrated | 2 | 0 | 2 |
| canonical-now | 0 | 0 | 0 |
| projection-needed | 18 | 0 | 18 |
| persistence/fallback-only | 33 | 9 | 42 |
| **Total** | **53** | **9** | **62** |

**Note on "canonical-now = 0"**: The previous revision incorrectly classified `state.messages` / `sessionState.messages` reads (in `OpenCodeSessionStateStore`, `ConversationTurnViewModelBuilder`, `OpenCodeService`, `OpenCodeSyncEventRuntimeCoordinator`) as "canonical-now" `conversation.messages` accesses. Those files read **canonical session state**, not `conversation.messages`. No file that directly accesses `conversation.messages` is already fully canonical.

---

## 1. Fingerprint Paths

Paths that compute a fingerprint, hash, or identity from conversation messages for change detection.

### 1.1 canonical-now

None — all fingerprint paths read `conversation.messages` directly.

### 1.2 projection-needed

| # | File | Line(s) | Function | Access | Detail |
|---|---|---|---|---|---|
| F-1 | `src/features/chat/services/ConversationSyncRuntimeCoordinator.ts` | 115 | `runTabConversationSync` | READ | Computes fallback fingerprint via `getConversationSyncFingerprint(conversation.messages)` when runtime fingerprint is empty. Could accept pre-computed fingerprint. |

### 1.3 persistence/fallback-only

| # | File | Line(s) | Function | Access | Detail |
|---|---|---|---|---|---|
| F-2 | `src/features/chat/services/ConversationAuthoritativeReloadCoordinator.ts` | 134 | `syncConversationMessagesFromServer` | READ | Fingerprint on `conversation.messages` for sync error fallback. Must read local state for comparison. |
| F-3 | `src/features/chat/services/ConversationAuthoritativeReloadCoordinator.ts` | 339 | `getConversationServerSyncMerge` | READ | `getConversationSyncFingerprint(conversation.messages)` for previous-cache-fingerprint comparison. Must read local state. |
| F-4 | `src/features/chat/services/ConversationAuthoritativeReloadCoordinator.ts` | 507 | `buildSkippedConversationServerSyncResult` | READ | Fingerprint on `conversation.messages` for skip-result. Must read local state. |
| F-5 | `src/features/chat/runtime/TabConversationActivationBridge.ts` | 89, 113 | `applyStreamingConversationActivation` / `openConversation` | READ | Establishes fingerprint baseline on activation by passing `conversation.messages` to `commitConversationSyncBaseline`. Must read local state to seed tab. |

**Section 1 total**: 0 canonical-now, 1 projection-needed, 4 persistence/fallback-only = **5 access points** across **3 files**.

---

## 2. Render / Reload Projection Paths

Paths that read messages for rendering, display, or reload projection in the chat UI.

### 2.1 migrated

| # | File | Line(s) | Function | Access | Detail |
|---|---|---|---|---|---|
| R-1 | `src/features/chat/services/ConversationRenderService.ts` | 383 | `resolveConversationRenderMessages` | READ | **Migrated** (tier5-b-first-safe-slice). Default parameter changed from eager `= conversation.messages` to lazy `fallbackMessages?: ChatMessage[]` with `?? conversation.messages` fallback. When canonical state is available, `conversation.messages` is never accessed. |
| R-2 | `src/features/chat/services/ConversationRenderService.ts` | 239, 241 | `rerenderConversationMessages` | READ | **Migrated** (tier5-b-first-safe-slice). Diagnostic logging now uses pre-resolved canonical messages (`resolvedMessages.length` and `resolvedMessages` tail search) instead of raw `conversation.messages`. |

### 2.2 canonical-now

None — all render/reload paths read `conversation.messages` directly (except migrated R-1/R-2).

### 2.3 projection-needed

| # | File | Line(s) | Function | Access | Detail |
|---|---|---|---|---|---|
| R-3 | `src/features/chat/ui/ContextDetailModal.ts` | 49, 67–69 | `onOpen` | READ | 4 reads via `this.conversation?.messages`: total count, user count, assistant count, message iteration. Could accept projected stats from canonical. |
| R-4 | `src/features/chat/services/ConversationSyncLoadRuntimeViewHostFactory.ts` | 47–48, 54–55 | `shouldSyncConversationFromServer` | READ | 4 reads: `conversation.messages` for interrupted tail check, some() scan, null guard, empty-length check. Could use projected metadata. |
| R-5 | `src/features/chat/services/ConversationSyncOrchestrationService.ts` | 211 | `shouldStartConversationSyncLoop` | READ | Checks `currentConversation.messages.length > 0` for sync loop start. Could use projected length. |

### 2.4 persistence/fallback-only

| # | File | Line(s) | Function | Access | Detail |
|---|---|---|---|---|---|
| R-6 | `src/features/chat/services/ConversationAuthoritativeReloadCoordinator.ts` | 111 | `syncConversationMessagesFromServer` | READ | Passes `conversation.messages` to `logOmoBackgroundTaskDiagnostics` before merge. Must read local state for diagnostic comparison. |
| R-7 | `src/features/chat/services/ConversationAuthoritativeReloadCoordinator.ts` | 143 | `syncConversationMessagesFromServer` (error fallback) | READ | Returns `conversation.messages` as `messages` in error-fallback result. Must read local state. |
| R-8 | `src/features/chat/services/ConversationAuthoritativeReloadCoordinator.ts` | 164 | `syncConversationMessagesFromCanonicalState` | READ | Passes `conversation.messages` to `shouldBypassCanonicalSyncForInterruptedNotice` for bypass check. Must read local state. |
| R-9 | `src/features/chat/services/ConversationAuthoritativeReloadCoordinator.ts` | 182 | `syncConversationMessagesFromCanonicalState` | READ | Passes `conversation.messages` to `logOmoBackgroundTaskDiagnostics` before merge. Must read local state. |
| R-10 | `src/features/chat/services/ConversationAuthoritativeReloadCoordinator.ts` | 215 | `logConversationServerSyncBegin` | READ | Diagnostic log of `conversation.messages.length`. Must read local state. |
| R-11 | `src/features/chat/services/ConversationAuthoritativeReloadCoordinator.ts` | 217 | `logConversationServerSyncBegin` | READ | Diagnostic: reverse-finds tail assistant from `conversation.messages`. Must read local state. |
| R-12 | `src/features/chat/services/ConversationAuthoritativeReloadCoordinator.ts` | 320, 325 | `getConversationServerSyncMerge` | READ | Passes `conversation.messages` to `mergeSyncedConversationMessages` and `getClientOnlyMessagesToPreserveOnSync`. Must read local state for merge. |
| R-13 | `src/features/chat/services/ConversationAuthoritativeReloadCoordinator.ts` | 495 | `applyConversationServerSyncMessages` | WRITE | Direct replacement: `conversation.messages = syncMerge.merged`. Must remain — this IS the write path. |
| R-14 | `src/features/chat/services/ConversationAuthoritativeReloadCoordinator.ts` | 505 | `buildSkippedConversationServerSyncResult` | READ | Returns `conversation.messages` as `messages` in skip result. Must read local state. |
| R-15 | `src/features/chat/services/ConversationSyncBridge.ts` | 226, 299, 335 | Three sync methods | READ | Pre-sync snapshots `[...conversation.messages]` for diff/rollback. Must remain for comparison. |
| R-16 | `src/features/chat/services/ConversationSyncVisiblePostSyncRouter.ts` | 52 | `routeVisibleSyncComplete` | READ | Passes `options.syncContext.conversation.messages` to `applySyncedConversationUpdate` — post-sync render apply. |
| R-17 | `src/features/chat/runtime/ConversationLoadRuntimeBridge.ts` | 70 | `loadConversationMessages` | READ | Returns `conversation.messages` when sync skipped. Must remain — load fallback path. |

**Section 2 total**: 2 migrated, 0 canonical-now, 3 projection-needed, 12 persistence/fallback-only (including 1 WRITE) = **17 access points** across **8 files**.

---

## 3. Authoritative Sync / Reload Paths

Paths in sync coordinators that directly access `conversation.messages` for hydration and merge decisions.

### 3.1 canonical-now

None — all sync paths read `conversation.messages` directly.

### 3.2 projection-needed

| # | File | Line(s) | Function | Access | Detail |
|---|---|---|---|---|---|
| A-1 | `src/features/chat/services/ConversationAuthoritativeSyncCoordinator.ts` | 157, 164 | `syncLatestUserMessageFromServer` | READ | Finds optimistic message by `findIndex` and reads it for hydration comparison. Could accept projected optimistic message. |

### 3.3 persistence/fallback-only

| # | File | Line(s) | Function | Access | Detail |
|---|---|---|---|---|---|
| A-2 | `src/features/chat/services/ConversationAuthoritativeSyncCoordinator.ts` | 365 | `applyHydratedOptimisticUserMessage` | WRITE | Splice-replaces optimistic message with hydrated version inside `commitConversationWrite()`. Must remain — write path. |

**Section 3 total**: 0 canonical-now, 1 projection-needed, 1 persistence/fallback-only (1 WRITE) = **2 access points** across **1 file**.

---

## 4. Background Task Timeline Paths

Paths in background task timeline rendering and completion notice handling that directly read `conversation.messages`.

### 4.1 canonical-now

None — all background task paths read `conversation.messages` directly.

### 4.2 projection-needed

| # | File | Line(s) | Function | Access | Detail |
|---|---|---|---|---|---|
| B-1 | `src/features/chat/services/BackgroundTaskTimelineService.ts` | 115 | `collectInlineSegments` | READ | Passes `conversation?.messages ?? []` to `collectSegments`. Top migration target — could accept projected messages. |
| B-2 | `src/features/chat/services/BackgroundTaskTimelineService.ts` | 136 | `syncStateFromConversation` | READ | Passes `conversation.messages` to `collectSegments`. Top migration target. |
| B-3 | `src/features/chat/services/BackgroundTaskTimelineService.ts` | 409 | `getSegmentUpdatedAt` | READ | Filters `conversation.messages` by timestamp for segment update time. Could accept projected timestamps. |
| B-4 | `src/features/chat/runtime/BackgroundTaskIndicatorCoordinator.ts` | 90 | `queueAndFlushCompletionNotices` | READ | Calls `timelineService.collectSegments(conversation.messages, tabId)`. Delegates to B-1/B-2. |
| B-5 | `src/features/chat/services/BackgroundTaskCompletionNoticeService.ts` | 174 | `getPersistedBackgroundTaskCompletionNoticeFingerprints` | READ | Iterates `conversation?.messages` to find existing completion notice fingerprints. Could accept projected fingerprint list. |
| B-6 | `src/features/chat/services/ChildSessionGraphCoordinator.ts` | 146 | `refreshGraph` | READ | Passes `conversation.messages` for graph reconstruction. Could accept projected messages. |

### 4.3 persistence/fallback-only

None — background task paths are pure READ consumers.

**Section 4 total**: 0 canonical-now, 6 projection-needed, 0 persistence/fallback-only = **6 access points** across **4 files**.

---

## 5. Diff Notice Paths

Paths handling diff notice creation and insertion that directly read `conversation.messages`.

### 5.1 canonical-now

None — all diff notice paths read `conversation.messages` directly.

### 5.2 projection-needed

| # | File | Line(s) | Function | Access | Detail |
|---|---|---|---|---|---|
| D-1 | `src/features/chat/services/ConversationNoticeCoordinator.ts` | 77 | `appendTurnDiffNoticeIfNeeded` | READ | Reverse-finds latest user message from `conversation.messages`. Could accept projected latest user message. |
| D-2 | `src/features/chat/services/PersistentAssistantNoticeService.ts` | 35 | `hasMatchingMessage` | READ | Iterates `conversation?.messages.some(...)` to check for duplicate notice. Could accept projected notice existence check. |
| D-3 | `src/features/chat/services/PersistentAssistantNoticeService.ts` | 66 | `appendMessage` | READ | Spreads `...targetConversation.messages` for predictive fingerprint. Could accept canonical fingerprint. |

### 5.3 persistence/fallback-only

| # | File | Line(s) | Function | Access | Detail |
|---|---|---|---|---|---|
| D-4 | `src/features/chat/services/PersistentAssistantNoticeService.ts` | 76 | `appendMessage` | WRITE | Pushes notice message into `targetConversation.messages` — write path. |

**Section 5 total**: 0 canonical-now, 3 projection-needed, 1 persistence/fallback-only (1 WRITE) = **4 access points** across **2 files**.

---

## 6. Optimistic Latest-User Hydration Paths

Paths handling optimistic message updates, user message hydration, and send preparation that directly read `conversation.messages`.

### 6.1 canonical-now

None — all hydration paths read `conversation.messages` directly.

### 6.2 projection-needed

| # | File | Line(s) | Function | Access | Detail |
|---|---|---|---|---|---|
| O-1 | `src/features/chat/services/MessageSendPreparationService.ts` | 418 | `isFirstUserMessage` | READ | Filters `conversation.messages` for user role count. Could accept projected count. |
| O-2 | `src/features/chat/OpenCodianView.ts` | 3116 | `updateHydratedUserMessageRuntimeAnchors` | READ | Computes fingerprint on `conversation.messages` after hydration. Could accept pre-computed fingerprint. |

### 6.3 persistence/fallback-only

| # | File | Line(s) | Function | Access | Detail |
|---|---|---|---|---|---|
| O-3 | `src/features/chat/services/MessageSendPreparationService.ts` | 353 | `prepareMessageSend` | WRITE | Pushes optimistic user message into `conversation.messages`. Must remain — write path. |

**Section 6 total**: 0 canonical-now, 2 projection-needed, 1 persistence/fallback-only (1 WRITE) = **3 access points** across **2 files**.

---

## 7. Finalization Follow-Up Paths

Paths in message finalization, post-stream processing, and error handling that directly read `conversation.messages`.

### 7.1 canonical-now

None — all finalization paths read `conversation.messages` directly.

### 7.2 projection-needed

| # | File | Line(s) | Function | Access | Detail |
|---|---|---|---|---|---|
| M-1 | `src/features/chat/services/MessageFinalizationService.ts` | 302, 306 | `finalizeAfterStream` | READ | 2 diagnostic logs of `conversation.messages.length`. Could accept projected count. |
| M-2 | `src/features/chat/services/MessageFinalizationService.ts` | 324, 353 | `finalizeAfterStream` / `requestConversationSyncAfterStream` | READ | Finds latest assistant via `findLatestAssistantMessage(conversation.messages)`. Could accept projected tail. |

### 7.3 persistence/fallback-only

| # | File | Line(s) | Function | Access | Detail |
|---|---|---|---|---|---|
| M-3 | `src/features/chat/services/MessageFinalizationService.ts` | 315, 487 | `finalizeAfterStream` / `finalizeAssistantMessageWithError` | READ | Fingerprint reads on `conversation.messages` for post-stream sync. Must read local state for comparison. |
| M-4 | `src/features/chat/services/MessageFinalizationService.ts` | 346 | `requestConversationSyncAfterStream` | READ | Pre-sync snapshot `[...conversation.messages]` — must read local state for comparison. |
| M-5 | `src/features/chat/services/MessageFinalizationService.ts` | 348 | `requestConversationSyncAfterStream` | READ | Passes `conversation.messages` to sync coordinator for merge. Must read local state. |
| M-6 | `src/features/chat/services/MessageFinalizationService.ts` | 473 | `finalizeAssistantMessageWithError` | WRITE | Pushes error assistant message into `conversation.messages` — write path. |

**Section 7 total**: 0 canonical-now, 2 projection-needed, 4 persistence/fallback-only (including 1 WRITE) = **6 access points** across **1 file**.

---

## 8. Conversation History / Cache Fallback Paths

Paths in storage, cache loading, cache eviction, local stream persistence, and fallback logic. This section includes both direct `conversation.messages` accesses AND storage-layer deserialized-object accesses (`data.messages`, `stored.messages`, etc.) since they are all persistence-layer operations.

### 8.1 canonical-now

None — storage and cache paths operate on `conversation.messages` or deserialized equivalents.

### 8.2 projection-needed

None — all storage/cache paths must remain as persistence/fallback.

### 8.3 persistence/fallback-only

| # | File | Line(s) | Function | Access | Detail |
|---|---|---|---|---|---|
| C-1 | `src/core/storage/StorageService.ts` | 200, 221 | `saveConversation` | READ | 2 reads: `persistedConversation.messages.length` for metadata. Must remain — serialization path. |
| C-2 | `src/core/storage/StorageService.ts` | 237–238 | `loadFullConversation` | WRITE | Null guard + empty array init: `data.messages = []`. Must remain — deserialization path. |
| C-3 | `src/core/storage/StorageService.ts` | 245 | `loadFullConversation` | READ | `data.messages.length` for count logging. Must remain — deserialization path. |
| C-4 | `src/core/storage/StorageService.ts` | 413 | `readStoredConversationForMerge` | READ | `Array.isArray(parsed.messages)` — validation. Must remain — integrity check. |
| C-5 | `src/core/storage/StorageService.ts` | 433–434 | `mergeStoredMessagesIfIncomingLooksStale` | READ | `stored.messages.length` and `incoming.messages.length` for comparison. Must remain — merge guard. |
| C-6 | `src/core/storage/StorageService.ts` | 439, 441 | `mergeStoredMessagesIfIncomingLooksStale` | READ | Prefix-match: `incoming.messages.every(...)` and `stored.messages[index]` ID check. Must remain — critical data integrity. |
| C-7 | `src/core/storage/StorageService.ts` | 445–446, 453–454 | `mergeStoredMessagesIfIncomingLooksStale` | READ | 4 reads for diagnostic logging: incoming/stored message counts in both log branches. Must remain. |
| C-8 | `src/core/storage/StorageService.ts` | 458 | `mergeStoredMessagesIfIncomingLooksStale` | READ | Returns `messages: stored.messages` — stale preservation. Must remain — data integrity. |
| C-9 | `src/core/storage/ConversationMetadataCache.ts` | 76–77 | `buildConversationMetaFromStoredRecord` | READ | Falls back to `data.messages.length` when `messageCount` unavailable. Must remain — metadata extraction. |
| C-10 | `src/core/storage/ConversationFullMessageCache.ts` | 21 | `hasFullMessages` | READ | Checks `conversation.messages.length > 0` for cache residency. Must remain — cache decision. |
| C-10b | `src/core/storage/ConversationFullMessageCache.ts` | 16 | `cloneConversationMetadataOnly` | WRITE | Sets `messages: []` during cache eviction clone. Must remain — eviction write. |
| C-11 | `src/features/chat/runtime/LocalStreamMessagePersistence.ts` | 64 | `persistLocalStream` | WRITE | Pushes assistant message into `preparedSend.conversation.messages`. Must remain — persistence write. |
| C-12 | `src/features/chat/runtime/LocalStreamMessagePersistence.ts` | 66 | `persistLocalStream` | READ | `preparedSend.conversation.messages.length` for count logging. Must remain. |
| C-13 | `src/features/chat/runtime/LocalStreamMessagePersistence.ts` | 111 | `persistLocalFinalizedAssistantMessage` | READ | `preparedSend.conversation.messages.length` for count logging. Must remain. |
| C-14 | `src/features/chat/runtime/LocalStreamMessagePersistence.ts` | 119 | `persistLocalFinalizedAssistantMessage` | READ | `preparedSend.conversation.messages.length` for count logging. Must remain. |
| C-15 | `src/features/chat/runtime/LocalStreamMessagePersistence.ts` | 144 | `appendNoticeMessage` | WRITE | Pushes notice message into `options.conversation.messages`. Must remain — persistence write. |
| C-16 | `src/features/chat/runtime/LocalStreamMessagePersistence.ts` | 146 | `appendNoticeMessage` | READ | `options.conversation.messages.length` for count logging. Must remain. |
| C-17 | `src/features/chat/services/ConversationLoadRecoveryCoordinator.ts` | 323 | `handleRewindRequest` | READ | Logs `loadedConversation.messages.length` after rewind reload. Must remain — diagnostic. |
| C-18 | `src/features/chat/services/ConversationLoadRecoveryCoordinator.ts` | 412 | `createForkConversation` | READ | Clones `currentConversation.messages` before fork target. Must read full array for fork. |

**Section 8 total**: 0 canonical-now, 0 projection-needed, 19 persistence/fallback-only (including 4 WRITEs) = **19 access points** across **5 files**.

---

## 9. Cross-Cutting Note: Parameter-Consumer Files

The following files were audited and confirmed to operate on **passed-in `messages: ChatMessage[]` parameters**, not directly on `conversation.messages`. They are NOT counted in the inventory above but are documented here for completeness:

| File | Detail |
|---|---|
| `src/features/chat/services/BackgroundTaskTimelineAssemblyService.ts` | `collectSegments(messages: ChatMessage[], tabId)` and `collectDiagnostics(messages: ChatMessage[])` — pure parameter consumers. |
| `src/features/chat/services/conversationAuthoritativeReloadLocalFallback.ts` | `shouldBypassCanonicalSyncForInterruptedNotice(existingMessages: ChatMessage[], canonicalMessages)` and `shouldPreserveInterruptedNoticeOnSync(existingMessages: ChatMessage[], ...)` — pure parameter consumers. |
| `src/features/chat/renderGroups.ts` | `buildMessageRenderGroups(messages: ChatMessage[])`, `mergeAssistantMessagesForRender(messages: ChatMessage[])`, `injectLiveCompactionDivider(messages)` — pure parameter consumers. |

---

## 10. Cross-Cutting Note: Canonical State Accessors

The following files read from **canonical session state** (`state.messages` / `sessionState.messages` in `OpenCodeSessionStateStore`), NOT from `conversation.messages`. They are excluded from the direct-access count above:

| File | Pattern | Lines |
|---|---|---|
| `src/core/opencode/OpenCodeSessionStateStore.ts` | `state.messages` (canonical store) | 41, 70, 89, 91, 93, 100, 190 |
| `src/core/opencode/OpenCodeService.ts` | `state.messages` (canonical read) | 705, 1128 |
| `src/core/opencode/OpenCodeSyncEventRuntimeCoordinator.ts` | Event objects, not `conversation.messages` | 523–529, 619–624 |
| `src/features/chat/services/ConversationTurnViewModelBuilder.ts` | `sessionState.messages` (canonical) | 71, 107, 127 |
| `src/features/chat/services/ConversationIdentityRuntime.ts` | `group.messages` (render groups) | 115–117 |

---

## Classification Distribution by File

Only files with **direct** `conversation.messages` access (or alias):

| File | migrated | projection-needed | persistence/fallback-only | Total |
|---|---|---|---|---|
| `ConversationAuthoritativeReloadCoordinator.ts` | 0 | 0 | 12 (incl. 1 WRITE) | 12 |
| `StorageService.ts` | 0 | 0 | 8 (incl. 1 WRITE) | 8 |
| `MessageFinalizationService.ts` | 0 | 2 | 4 (incl. 1 WRITE) | 6 |
| `LocalStreamMessagePersistence.ts` | 0 | 0 | 6 (incl. 2 WRITEs) | 6 |
| `BackgroundTaskTimelineService.ts` | 0 | 3 | 0 | 3 |
| `PersistentAssistantNoticeService.ts` | 0 | 2 | 1 (incl. 1 WRITE) | 3 |
| `ConversationSyncBridge.ts` | 0 | 0 | 3 | 3 |
| `ConversationRenderService.ts` | 2 | 0 | 0 | 2 |
| `ConversationAuthoritativeSyncCoordinator.ts` | 0 | 1 | 1 (incl. 1 WRITE) | 2 |
| `MessageSendPreparationService.ts` | 1 | 1 (incl. 1 WRITE) | 2 |
| `ConversationLoadRecoveryCoordinator.ts` | 0 | 2 | 2 |
| `ConversationLoadRuntimeBridge.ts` | 0 | 1 | 1 |
| `TabConversationActivationBridge.ts` | 0 | 1 | 1 |
| `ConversationSyncLoadRuntimeViewHostFactory.ts` | 1 | 0 | 1 |
| `ContextDetailModal.ts` | 1 | 0 | 1 |
| `OpenCodianView.ts` | 1 | 0 | 1 |
| `ConversationSyncRuntimeCoordinator.ts` | 1 | 0 | 1 |
| `ConversationSyncOrchestrationService.ts` | 1 | 0 | 1 |
| `ConversationSyncVisiblePostSyncRouter.ts` | 0 | 1 | 1 |
| `ConversationNoticeCoordinator.ts` | 1 | 0 | 1 |
| `BackgroundTaskIndicatorCoordinator.ts` | 1 | 0 | 1 |
| `BackgroundTaskCompletionNoticeService.ts` | 1 | 0 | 1 |
| `ChildSessionGraphCoordinator.ts` | 1 | 0 | 1 |
| `ConversationMetadataCache.ts` | 0 | 1 | 1 |
| `ConversationFullMessageCache.ts` | 0 | 2 (incl. 1 WRITE) | 2 |
| **Total** | **2** | **18** | **42** | **62** |

---

## Top Migration Targets (projection-needed)

These files have the highest density of `projection-needed` reads and are the best candidates for canonical-only read-path migration:

1. **`BackgroundTaskTimelineService.ts`** — 3 projection-needed reads. `syncStateFromConversation()` and `collectInlineSegments()` pass `conversation.messages` to `collectSegments()`; `getSegmentUpdatedAt()` filters by timestamp. Could accept projected `ChatMessage[]` or pre-computed segment data.

2. **`MessageFinalizationService.ts`** — 2 projection-needed reads. Diagnostic logging and tail-finding can be reduced by consuming projected counts/tail data from canonical state while leaving persistence and writeback paths intact.

3. **`PersistentAssistantNoticeService.ts`** — 2 projection-needed reads. Duplicate check and predictive fingerprint could use projected data while keeping the actual notice append as a serialized persistence write.

4. **`ConversationSyncLoadRuntimeViewHostFactory.ts`** — 1 projection-needed read entry. `shouldSyncConversationFromServer()` has a concentrated decision point that could use projected metadata (`hasMessages`, `hasInterruptedTail`, `hasUnanchoredMessages`) instead of iterating the raw array.

5. **`ConversationAuthoritativeReloadCoordinator.ts`** — has 0 projection-needed reads but the highest total access count (12), all persistence/fallback-only due to the sync-merge-write cycle. Understanding this file is critical, but it is not a first migration target.

### Completed Migrations

**Migrated slice** (tier5-b-first-safe-slice): 2 pure read projection paths in `ConversationRenderService` now consume canonical state first.

- **`ConversationRenderService.ts`** — 2 projection-needed reads migrated (tier5-b-first-safe-slice). R-1: lazy fallback in `resolveConversationRenderMessages`. R-2: diagnostic logging now uses resolved canonical messages. `conversation.messages` is no longer accessed when canonical state is available.

---

## Key Architectural Observations

1. **No file is already fully canonical when accessing `conversation.messages`**: The previous audit incorrectly counted `state.messages` / `sessionState.messages` reads as "canonical-now" `conversation.messages` accesses. All 62 direct accesses are either projection-needed or persistence/fallback-only.

2. **Write serialization is mature**: All 9 WRITE operations flow through `commitConversationWrite()` callbacks or are in deserialization/cache initialization paths (`data.messages = []`, metadata-only cache eviction). No migration needed for writes.

3. **Canonical render is now canonical-first (2 paths migrated)**: `ConversationTurnViewModelBuilder` reads `sessionState.messages` (canonical), and `ConversationRenderService.resolveConversationRenderMessages` now uses lazy fallback — it never reads `conversation.messages` when canonical state is available. The `rerenderConversationMessages` diagnostic log also uses the resolved canonical messages instead of raw `conversation.messages`.

4. **Snapshot-before-sync pattern**: `ConversationSyncBridge` (3x) and `MessageFinalizationService` (1x) take `[...conversation.messages]` snapshots before sync. These must remain as persistence/fallback because they compare local state before and after sync.

5. **Storage layer has comprehensive merge guards**: `StorageService.mergeStoredMessagesIfIncomingLooksStale` performs prefix-matching ID comparison to prevent data loss from stale writes. Critical safety logic that must remain.

6. **`src/utils/streaming/` has zero `conversation.messages` reads**: The streaming layer operates on individual message parameters, not conversation-level arrays. Clean boundary.

7. **`ConversationAuthoritativeReloadCoordinator` is the densest accessor**: 12 access points in one file, all persistence/fallback-only due to the sync-merge-write cycle. This file is the sync gateway — it must read local messages to compare with server messages and produce merges.

---

*End of inventory. No runtime code was changed in the production of this document.*

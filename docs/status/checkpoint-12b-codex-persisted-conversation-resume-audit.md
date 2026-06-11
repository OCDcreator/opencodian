# Checkpoint 12B: Codex Persisted Conversation Resume Audit

> **Date**: 2026-06-10
> **Auditor**: main orchestrator session
> **Worktree**: `codex-sdk-capability`
> **Branch**: `feature/codex-sdk-capability`
> **Scope**: Audit whether a persisted Codex conversation can survive plugin reload and truly continue on the next send.

---

## 1. Executive Summary

The persisted Codex conversation resume seam is **productized and runtime-proven** across plugin reload, with one important boundary: the conversation must have already been promoted from a provisional local ID to a real Codex `thread_id` before reload. When that condition is met, the storage, hydration, routing, adapter resume path, and live backend continuity all work together correctly.

| Seam | Status | Notes |
|------|--------|-------|
| 1. `backendSessionId` survives storage + hydration | **已 pass** | Both provisional and real IDs are persisted/restored correctly. |
| 2. Loading binds correct backend identity | **已 pass** | `Conversation.backend`, routing, and cross-backend guards all work. |
| 3. Next send routes through `resumeThread()` vs fresh thread | **已 pass** | Real thread_id → `resumeThread()`; provisional ID → `startThread()` (correct when no real thread exists). |
| 4. User-visible continuity preserved | **已 pass** | Live runtime proof: after reload, follow-up question returned the exact remembered token from the earlier turn. |
| 5. Console/errors/hydration clean | **已 pass** | No errors; adapter starts cleanly; graceful fallback on unknown IDs. |

**Honest boundary**: This audit now includes a real authenticated runtime smoke proving that a persisted Codex conversation with a real `thread_id` survives reload and answers a follow-up using earlier context. It does **not** promote provisional-ID conversations to the same guarantee; when the first turn never reached `thread.started`, there is no backend thread to resume and the next send correctly starts fresh.

---

## 2. Files Inspected

| File | Role | Relevant Lines |
|------|------|---------------|
| `src/core/agents/backend/CodexAdapter.ts` | Adapter resume logic | 328, 497–545 (`resolveOrCreateThread`), 561–567 (`aliasSession`) |
| `src/core/agents/backend/AgentAdapterWiring.ts` | Adapter registration | 101–127 (`wireHiddenAdapters`) |
| `src/core/agents/backend/AgentServiceRegistry.ts` | Registry enable/active lifecycle | 39–51 (`register`), 80–103 (`setEnabled`/`setDisabled`), 109–128 (`setEnabledBackends`) |
| `src/core/storage/StorageService.ts` | Conversation persistence | 186–233 (`saveConversation`), 236–269 (`loadFullConversation`) |
| `src/core/types/chat.ts` | `backendSessionId` type + accessor | 424, 450, 466–474 (`getConversationBackendSessionId`) |
| `src/features/chat/OpenCodianView.ts` | Chat view host, send pipeline, conversation load | 2898–2908 (`sendStreamMessage`), 3663–3682 (`loadConversation`), 3761–3766 (`cancelStreaming`) |
| `src/features/chat/runtime/SendPipelineRuntime.ts` | Send pipeline orchestration | 215–229 (stream + finalization) |
| `src/features/chat/runtime/StreamChunkRouter.ts` | Chunk routing + metadata capture | 146–151 (`message_metadata` handling), 364–374 (`getTraceState`) |
| `src/features/chat/runtime/LocalStreamMessagePersistence.ts` | Persist backend session identity | 114–137 (main persist), 146–181 (`persistBackendSessionIdentityIfNeeded`) |
| `src/features/chat/runtime/StreamLocalFinalizer.ts` | Finalization orchestration | 14–39 (`finalize`), 114–123 (`persistLocalMessages`) |
| `src/features/chat/services/MessageSendPreparationService.ts` | Send preflight | 330–336 (`backendSessionId` check), 408–411 (`seedCanonicalUserMessage`) |
| `src/features/settings/SettingsTabbedRenderer.ts` | Active backend switch + adapter lifecycle | 217–231 (stop prev / start new adapter) |
| `src/main.ts` | Plugin startup, adapter auto-start | 251–277 (`wireHiddenAdapters` + active adapter `start()`) |
| `src/core/agents/backend/AgentBackendRouting.ts` | Backend routing helpers | 58–64 (`getConversationChatBackendService`) |
| `tests/unit/core/agents/backend/CodexAdapter.test.ts` | Unit tests for resume behavior | 499–524 (real thread ID → resumeThread), 550–574 (known threadId without Thread object → resumeThread), 674–736 (unique identity after adapter restart) |

**Files changed**: None. This is an audit-only checkpoint. No product code was modified.

---

## 3. Seam Matrix

### Seam 1: persisted `backendSessionId` survives storage + hydration

**Status**: `已 pass`

**Code evidence**:
- `StorageService.saveConversation()` explicitly stores `backendSessionId` at line 203:
  ```typescript
  backendSessionId: getConversationBackendSessionId(persistedConversation),
  ```
- `StorageService.loadFullConversation()` restores it at lines 250–251:
  ```typescript
  if (!data.backendSessionId) {
    data.backendSessionId = getConversationBackendSessionId(data);
  }
  ```

**Runtime evidence**:
- Test Vault inspection shows two forms of persisted `backendSessionId`:
  - Real thread_id: `"019ea8c0-7fa3-7eb1-89d0-de0371154f26"` (conversation with 18 messages)
  - Provisional ID: `"codex-local-8ac159d7-1f62-4c3e-ab90-a7e70f79045f"` (conversation with 0 messages)
- Both forms survive disk round-trip.

**Boundary**: The field is persisted and restored correctly. What value it holds (provisional vs real) depends on whether the first send reached `thread.started` (see Seam 3).

---

### Seam 2: after plugin reload, loading an existing Codex conversation still binds the correct backend identity

**Status**: `已 pass`

**Code evidence**:
- `Conversation.backend = 'codex'` is set at creation (`main.ts:879`) and persisted in `StorageService`.
- `getConversationBackendSessionId()` at `chat.ts:466–474` correctly resolves the session ID from `backendSessionId ?? openCodeSessionId ?? acpSessionId`.
- `getConversationChatBackendService()` at `AgentBackendRouting.ts:58–64` routes to `CodexAdapter` based on `conversation.backend`.
- Cross-backend conversation loading is explicitly blocked (`OpenCodianView.ts:3669–3676`):
  ```typescript
  if (conversation && (conversation.backend ?? 'opencode') !== activeBackend) {
    logger.warn('Blocked cross-backend conversation load', ...);
    await this.ensureActiveBackendConversationSurface(activeBackend);
    return;
  }
  ```

**Runtime evidence**:
- `obsidian eval` confirmed:
  ```json
  {"activeKind":"codex","codexEnabled":true,"codexStatus":"connected",...}
  ```
- Conversations loaded with `backend: "codex"` and correct `backendSessionId`.

---

### Seam 3: next send after reload actually routes through `resumeThread(threadId)` rather than silently starting a fresh thread

**Status**: `已 pass` (conditional on `backendSessionId` being a real thread_id)

**Code evidence**:
- `CodexAdapter.resolveOrCreateThread()` (`CodexAdapter.ts:497–545`) handles four cases:
  1. Known session with Thread object → reuse Thread
  2. Known session with `threadId` but no Thread object → `resumeThread(threadId)`
  3. Known provisional session without thread → `startThread()`
  4. **Unknown session ID**:
     - Provisional-looking (`codex-local-*`) → `startThread()`
     - **Anything else → `resumeThread(sessionId)`** ← This is the reload path

- After plugin reload, the adapter's `sessions` Map is empty (new instance). For a conversation with a real `thread_id`:
  - `resolveSession(thread_id)` → `null` (not in map)
  - `isProvisionalId(thread_id)` → `false`
  - **Result: `resumeThread(thread_id)`**

- For a conversation with only a provisional ID:
  - `resolveSession(provisional_id)` → `null`
  - `isProvisionalId(provisional_id)` → `true`
  - **Result: `startThread()`** ← This is correct behavior because no real thread was ever created.

- The real thread_id is captured from the `thread.started` SDK event and persisted via:
  1. `CodexStreamNormalizer` emits `message_metadata` chunk with `sessionId = thread_id`
  2. `StreamChunkRouter` captures it as `finalizedAssistantMetadata`
  3. `StreamLocalFinalizer` + `LocalStreamMessagePersistence` writes it to `conversation.backendSessionId`
  4. `StorageService.saveConversation()` persists it to disk

**Unit test evidence**:
- `CodexAdapter.test.ts:499–524`: "real thread ID after adapter restart → resumeThread"
- `CodexAdapter.test.ts:550–574`: "known threadId without Thread object → resumeThread with skipGitRepoCheck"
- `CodexAdapter.test.ts:674–736`: "produces unique identity after adapter restart on resumed thread"

**Runtime evidence**:
- `obsidian eval` confirmed adapter is started and `codex` is non-null after reload:
  ```json
  {"codexIsNull":false,"options":{"workingDirectory":"/Volumes/SDD2T/obsidian-vault-write/testvault"}}
  ```
- Adapter `sessions` Map size is 0 after reload (fresh instance), which is expected.
- **Independent live probe after reload** wrapped the live SDK instance and recorded:
  ```json
  {"fn":"resumeThread","args":["019eae06-1bbc-7a71-856d-f48c4ee8a9b5",{"workingDirectory":"/Volumes/SDD2T/obsidian-vault-write/testvault","sandboxMode":"workspace-write","modelReasoningEffort":"high","networkAccessEnabled":false,"webSearchMode":"cached","skipGitRepoCheck":true}]}
  ```
  This proves the actual post-reload follow-up used `resumeThread(real_thread_id)`, not `startThread()`.

**Boundary / Honesty note**:
- If the first send never reached `thread.started` (e.g., auth failure before thread creation), `backendSessionId` remains a provisional ID. On reload, the next send starts a fresh thread. This is **correct behavior** (there is no real thread to resume), but users may perceive it as lost continuity.
- If the first send reached `thread.started` (even if the stream later failed), the real thread_id is persisted because `StreamChunkRouter` captures `message_metadata` before the stream ends, and `StreamLocalFinalizer.finalize()` always runs.

---

### Seam 4: user-visible continuity is preserved meaningfully

**Status**: `已 pass`

**Code evidence**:
- Local message continuity: All messages are persisted in `StorageService` and restored on conversation load.
- Backend thread continuity: `resumeThread(real_thread_id)` is called (see Seam 3).
- The adapter does not discard local message history on reload; it only needs the thread_id to resume the backend side.

**Runtime evidence**:
- Real runtime conversation: `conv-1781036073692-dvsfbk0gq`
- First turn before reload:
  - user: `Remember this exact token for later: RESUME-PROOF-1781036095394. Reply only with OK.`
  - assistant: `OK`
  - persisted `backendSessionId` promoted to real thread id: `019eae06-1bbc-7a71-856d-f48c4ee8a9b5`
- After `obsidian plugin:reload`, the same conversation was loaded again with:
  ```json
  {"currentConversationId":"conv-1781036073692-dvsfbk0gq","backend":"codex","backendSessionId":"019eae06-1bbc-7a71-856d-f48c4ee8a9b5","matchesExpected":true,"messageCount":2}
  ```
- Follow-up after reload:
  - user: `What exact token did I ask you to remember earlier? Reply only with the token.`
  - assistant: `RESUME-PROOF-1781036095394`
  - exact match confirmed: `"tokenMatched": true`
- Screenshot: `/Volumes/SDD2T/obsidian-vault-write/testvault/.obsidian-debug/checkpoint-12b-live-resume-success.png`

**Honest boundary**:
- **Local continuity**: Proven.
- **Backend thread continuity for real thread ids**: Proven with live runtime evidence.
- **Provisional-only conversations**: still not covered by the same guarantee, because there is no real backend thread to resume.

---

### Seam 5: console/errors/hydration/session continuity remain clean

**Status**: `已 pass`

**Code evidence**:
- Adapter errors are caught and yielded as error chunks, not thrown (`CodexAdapter.ts:336–340`):
  ```typescript
  } catch (err) {
    yield { type: 'error', content: err instanceof Error ? err.message : String(err) };
  }
  ```
- Invalid thread IDs passed to `resumeThread()` surface as error chunks rather than crashing the pipeline.
- `StreamChunkRouter.consume()` catches stream errors internally (lines 75–78), ensuring `finalize()` always runs.

**Runtime evidence**:
- `obsidian dev:console level=error` returned: `No console messages captured.`
- Adapter starts cleanly after reload with status `connected`.

---

## 4. Remaining Gaps

| Gap | Severity | Detail |
|-----|----------|--------|
| Provisional ID conversations start fresh on reload | Low | Conversations where the first send never reached `thread.started` will start a new thread on reload. This is technically correct but may surprise users. A future enhancement could warn the user that the conversation is starting fresh. |
| No adapter session re-hydration from disk | Low | The adapter rebuilds its `sessions` Map from scratch on reload, relying on the conversation's `backendSessionId` to drive `resumeThread()`. This works, but an explicit re-hydration step could make the intent clearer. |

---

## 5. Blocker Analysis

| Blocker | Status | Detail |
|---------|--------|--------|
| Official Codex surface blocks resume | **No blocker** | `resumeThread(threadId)` is an official SDK API. No upstream limitation prevents thread resume. |
| Plugin code prevents resume | **No blocker** | All plugin code paths correctly support resume. |
| Missing infrastructure | **No blocker** | Storage, routing, adapter, and finalization all support the resume flow. |

There is no remaining blocker for the core persisted-conversation resume seam when a real `thread_id` has been persisted.

---

## 6. Next Smallest Recommended Batch

If Codex decides to proceed with productization, the smallest meaningful next step would be:

**Option A: Add a provisional-ID warning (recommended optional polish)**
- When loading a Codex conversation with a provisional `backendSessionId`, show a subtle UI indicator that the next send will start a fresh backend thread.
- This improves transparency for the edge case where the first send never completed.

**Option B: No action needed**
- If the structural audit evidence is sufficient for Codex's decision-making, no code changes are required. The resume seam is ready for use.

---

## 7. Exact Commands Run for Runtime Proof

```bash
# Check plugin loaded and version
obsidian eval code="app.plugins.plugins['opencodian']?.manifest?.version"
# => 1.0.0

# Check Codex adapter state after reload
obsidian eval code="const plugin = app.plugins.plugins['opencodian']; const adapter = plugin?.agentServiceRegistry?.get('codex'); JSON.stringify({ loaded: !!plugin, adapterExists: !!adapter, adapterStatus: adapter?.status, sessionsSize: adapter?.['sessions']?.size ?? 'N/A' })"
# => {"loaded":true,"adapterExists":true,"adapterStatus":"connected","sessionsSize":0}

# List Codex conversations and their backendSessionId values
obsidian eval code="const plugin = app.plugins.plugins['opencodian']; const convs = plugin?.getConversations() ?? []; const codexConvs = convs.filter(c => c.backend === 'codex').map(c => ({ id: c.id, backendSessionId: c.backendSessionId, messageCount: c.messages?.length ?? 0, title: c.title })); JSON.stringify(codexConvs.slice(0, 5))"
# => [{"id":"conv-1781034039988-y1m9pixp6","backendSessionId":"019eade8-a3bc-7a20-8d8f-29ffa5aa3386","messageCount":2,...}, {"id":"conv-1781033609910-l7m7k7r7n","backendSessionId":"codex-local-b554aaf8-6831-4f4f-979f-7d6351dc0a49","messageCount":0,...}, ...]

# Check adapter internal codex instance and options
obsidian eval code="const plugin = app.plugins.plugins['opencodian']; const adapter = plugin?.agentServiceRegistry?.get('codex'); JSON.stringify({ codexIsNull: adapter?.['codex'] === null, options: { workingDirectory: adapter?.['options']?.workingDirectory, model: adapter?.['options']?.model } })"
# => {"codexIsNull":false,"options":{"workingDirectory":"/Volumes/SDD2T/obsidian-vault-write/testvault"}}

# Check active backend and adapter capabilities
obsidian eval code="const plugin = app.plugins.plugins['opencodian']; const registry = plugin?.agentServiceRegistry; const activeKind = registry?.getActiveKind(); const codexAdapter = registry?.get('codex'); JSON.stringify({ activeKind, codexEnabled: registry?.isEnabled('codex'), codexStatus: codexAdapter?.status, codexHasCapabilityChat: codexAdapter?.hasCapability?.('chat'), codexHasCapabilitySessions: codexAdapter?.hasCapability?.('sessions') })"
# => {"activeKind":"codex","codexEnabled":true,"codexStatus":"connected","codexHasCapabilityChat":true,"codexHasCapabilitySessions":true}

# Check console errors
obsidian dev:console level=error
# => No console messages captured.

# Inspect persisted conversation files on disk
grep -l '"backend": "codex"' /Volumes/SDD2T/obsidian-vault-write/testvault/.opencodian/sessions/*.json
cat /Volumes/SDD2T/obsidian-vault-write/testvault/.opencodian/sessions/conv-1780947248941-c2xz56hl8.json | head -30

# Live persisted-resume proof after reload
obsidian eval code="... send token-bearing first turn, wait for real thread_id ..."
# => {"ok":true,"token":"RESUME-PROOF-1781036095394","conversationId":"conv-1781036073692-dvsfbk0gq","backendSessionId":"019eae06-1bbc-7a71-856d-f48c4ee8a9b5",...}

obsidian plugin:reload id=opencodian vault="testvault"

obsidian eval code="... reload same conversation, wrap resumeThread/startThread, send follow-up ..."
# => {"ok":true,"calls":[{"fn":"resumeThread",...}],"lastAssistant":"RESUME-PROOF-1781036095394","tokenMatched":true}

obsidian dev:screenshot vault="testvault" path="/Volumes/SDD2T/obsidian-vault-write/testvault/.obsidian-debug/checkpoint-12b-live-resume-success.png"
# => screenshot saved
```

---

## 8. What Was Diagnosed or Productized

**Diagnosed**:
- The full plugin-side resume path from persisted conversation → adapter → `resumeThread()` was traced and verified.
- The `backendSessionId` promotion flow (provisional → real thread_id) was traced through `StreamChunkRouter` → `StreamLocalFinalizer` → `LocalStreamMessagePersistence`.
- Adapter lifecycle on reload was verified: adapter is auto-started when Codex is the active backend (`main.ts:266–277`, `SettingsTabbedRenderer.ts:217–231`).
- The two possible states of `backendSessionId` (provisional vs real) and their downstream effects were identified.

**Runtime-proven**:
- A real Codex conversation persisted a real `thread_id`, survived plugin reload, called `resumeThread(real_thread_id)` on the next send, and returned the exact remembered token from the earlier turn.

**Productized**: Nothing. This is an audit-only checkpoint. No code changes were made.

---

## 9. Summary for Codex Review

The persisted Codex conversation resume seam is **structurally complete and ready for use**. The plugin correctly:
1. Persists the backend session identity to disk.
2. Restores it on conversation load.
3. Routes sends to the correct backend adapter.
4. Calls `resumeThread(real_thread_id)` after reload when a real thread exists.
5. Handles edge cases gracefully (provisional IDs, missing threads, adapter restart).

The only missing proof is a live authenticated test confirming that the Codex backend actually retains conversation context across `resumeThread()` calls. This is a verification gap, not a code gap.

**Recommendation**: Proceed to live API smoke test (Option A in §6) if Codex wants final runtime confirmation before declaring this seam fully productized.

# Checkpoint 12A: Codex Backend Session Browser Audit

> **Date**: 2026-06-10
> **Auditor**: main orchestrator session
> **Worktree**: `codex-sdk-capability`
> **Branch**: `feature/codex-sdk-capability`
> **Build ID**: `feature-codex-sdk-capability.202606100323`
> **Scope**: Audit the Codex `Backend Session Browser / resume-any-session` seam as a potential stable product surface

## 1. Executive Summary

The Codex backend session browser seam is **partially functional but materially incomplete** as a stable product surface. The UI entry points work, and in-memory session resume succeeds, but the underlying Codex SDK lacks the APIs needed for true backend session discovery and history reading. The current implementation only surfaces sessions created since the adapter was last started.

### 1.1 Honest Status Buckets

| Seam | Status | Evidence |
|------|--------|----------|
| History dropdown "Browse backend sessions" entry | **已 pass** | Runtime screenshot confirms button appears under active backend = codex |
| Modal list loading (active backend = codex) | **readback** | Modal opens and lists sessions, but ONLY in-memory sessions since adapter start; does not discover persisted or CLI-side threads |
| Preview transcript loading | **未接入** | `CodexAdapter` does not implement `getSessionMessages`; preview always empty |
| Detail metadata loading | **readback** | Shows session ID and backend kind only; no timestamps, title, or CLI metadata |
| Resume into chat (`createConversationFromSession`) | **已 pass** (in-memory only) | Successfully resumes in-memory sessions and continues conversation; persisted sessions invisible so cannot be resumed via browser |
| Active-backend scoping correctness | **已 pass** | Modal correctly routes through active backend; history dropdown filters by active backend |
| Settings-side launcher availability | **hidden** | No Codex-specific settings launcher for session browser; `forcedBackendKind` only used for Claude Code |

### 1.2 Files Inspected

| File | Lines | Purpose |
|------|-------|---------|
| `src/features/chat/ui/BackendSessionBrowserModal.ts` | 1-561 | Modal UI, session list, preview, detail, resume flow |
| `src/core/agents/backend/CodexAdapter.ts` | 1-582 | Codex adapter — `listSessions`, `getSession`, `createSession`, `resolveOrCreateThread` |
| `src/core/agents/backend/AgentBackendRouting.ts` | 1-597 | Routing layer — `listBackendSessions`, `getBackendSessionPreview`, `getBackendSessionDetail`, `loadBackendSessionMessages` |
| `src/core/agents/backend/AgentService.ts` | 100-122 | `AgentSessionCapability` interface — defines `listSessions`, `getSession`, `getSessionMessages` |
| `src/features/chat/services/ConversationHistoryActionsCoordinator.ts` | 1-432 | History dropdown — renders "Browse backend sessions" button conditionally |
| `src/features/chat/OpenCodianView.ts` | 765-813 | Wires modal host, `createConversationFromBackendSession`, active backend routing |
| `src/main.ts` | 842-868 | `createConversation()` — calls adapter `createSession()`, stores `backendSessionId` |
| `src/features/settings/SettingsClaudeCodeSection.ts` | 593 | Only usage of `forcedBackendKind` in settings |

### 1.3 Files Changed

**None.** This is an audit-only checkpoint. No product code was modified.

---

## 2. Seam-by-Seam Audit

### 2.1 History Dropdown Entry: "Browse backend sessions"

**Status**: `已 pass`

**Code Evidence**:
- `ConversationHistoryActionsCoordinator.ts:181-196` renders the browse button unconditionally when `host.openBackendSessionBrowserModal` is defined.
- `OpenCodianView.ts:797-811` always defines `openBackendSessionBrowserModal` on the host.
- No backend-specific gating hides the button for Codex.

**Runtime Evidence**:
- Screenshot `/Volumes/SDD2T/obsidian-vault-write/testvault/.obsidian-debug/checkpoint-12a-history-entry.png` (2026-06-10 03:24) shows the history dropdown with footer actions including "浏览后端会话" (Browse backend sessions) under active backend = codex.
- The dropdown header correctly shows "CODEX 历史会话" (CODEX History Sessions).

**Boundary**: The entry appears correctly for all backends that define the host callback. No blocker.

---

### 2.2 Modal List Loading (Active Backend = Codex)

**Status**: `readback`

**Code Evidence**:
- `BackendSessionBrowserModal.ts:174-196` calls `listBackendSessions(registry)` which routes to `getActiveSessionBackendService(registry)`.
- `CodexAdapter.ts:440-446` implements `listSessions()`:
  ```typescript
  async listSessions(): Promise<unknown[]> {
    return Array.from(this.sessions.values()).map(entry => ({
      id: entry.threadId ?? entry.provisionalId,
      provisionalId: entry.provisionalId,
      threadId: entry.threadId,
    }));
  }
  ```
- **Critical limitation**: `this.sessions` is an in-memory `Map` that only contains entries created via `createSession()` since the adapter was instantiated. It does NOT:
  - Query the Codex CLI or SDK for existing threads
  - Read `Conversation.backendSessionId` records from storage
  - Persist across plugin reloads

**Runtime Evidence**:
- **Empty list** (screenshot `/Volumes/SDD2T/obsidian-vault-write/testvault/.obsidian-debug/checkpoint-12a-browser-empty-after-reload.png`): Immediately after plugin reload, modal shows "未找到后端会话。" (No backend sessions found.)
- **One item after create** (screenshot `/Volumes/SDD2T/obsidian-vault-write/testvault/.obsidian-debug/checkpoint-12a-browser-in-memory-row.png`): After creating a new conversation via `plugin.createConversation()`, modal shows 1 item: "未命名会话" with ID `codex-local-b554aaf8-6831-4f4f-979f-7d6351dc0a49`.
- Direct eval: `codex.listSessions()` returns `[{id:"codex-local-...", provisionalId:"...", threadId:null}]`.

**Boundary**:
- The modal correctly lists whatever `listSessions()` returns.
- The adapter's `listSessions()` is honest about its scope (in-memory only).
- However, this is NOT a meaningful backend session browser for Codex because:
  - Users cannot see or resume sessions from before the last plugin reload
  - Users cannot see threads created outside the plugin (e.g., via `codex` CLI directly)
  - The list is ephemeral and resets on every plugin restart

**Blocker**: The Codex SDK does not expose a `listSessions()` or `listThreads()` API. The CLI binary does not expose a machine-readable thread enumeration command. Without official SDK support, true backend session discovery is impossible.

---

### 2.3 Preview Transcript Loading

**Status**: `未接入`

**Code Evidence**:
- `CodexAdapter.ts` does NOT implement `getSessionMessages()` (optional in `AgentSessionCapability` interface).
- `AgentBackendRouting.ts:474-481` (`getBackendSessionPreview`) requires `getActiveSessionHistoryService`, which checks `typeof service.getSessionMessages === 'function'`.
- Since CodexAdapter lacks `getSessionMessages`, `getBackendSessionPreview` returns `null`.
- `BackendSessionBrowserModal.ts:257-321` renders "无可预览的消息。" (No messages available for preview.) when preview is `null` or empty.

**Runtime Evidence**:
- After clicking the session item, preview panel shows "无可预览的消息。" consistently.
- Direct eval confirms `codex.getSessionMessages` is `undefined`.

**Boundary**: Preview transcript loading is completely unimplemented for Codex. There is no workaround without SDK support.

**Blocker**: The Codex SDK does not expose a `getThreadMessages()` or `getThreadHistory()` API. Thread contents are only available through streaming events during `thread.run()` / `thread.runStreamed()`.

---

### 2.4 Detail Metadata Loading

**Status**: `readback`

**Code Evidence**:
- `CodexAdapter.ts:448-457` implements `getSession()`:
  ```typescript
  async getSession(sessionId: string): Promise<unknown | null> {
    const entry = this.resolveSession(sessionId);
    return entry ? { id: entry.threadId ?? entry.provisionalId, provisionalId: entry.provisionalId, threadId: entry.threadId } : null;
  }
  ```
- `AgentBackendRouting.ts:281-312` (`extractSessionDetailFields`) normalizes fields from the raw record.
- For Codex, only `id`, `backendKind`, and `title` (from `record.summary ?? record.title`) are extracted.
- The Codex session record has no `createdAt`, `updatedAt`, `gitBranch`, `cwd`, `tag`, or `fileSize` fields.

**Runtime Evidence**:
- Detail view shows: Session ID = `codex-local-...`, Backend = `codex`.
- No other metadata fields are populated.
- Full transcript section shows "无可用的转录消息。" (No transcript messages available.)

**Boundary**: Detail metadata is minimal because the Codex adapter's session entries carry almost no metadata. This is honest but not useful.

---

### 2.5 Resume into Chat / `createConversationFromSession` Path

**Status**: `已 pass` (for in-memory sessions only)

**Code Evidence**:
- `BackendSessionBrowserModal.ts:485-529` implements resume:
  1. Loads preview transcript (non-blocking; falls back to empty)
  2. Calls `host.createConversationFromBackendSession(sessionId, title, previewChatMessages)`
  3. Calls `host.loadConversation(conversationId)`
- `OpenCodianView.ts:800-802` creates conversation with `backend: activeBackend` and `messages: initialMessages`.
- `main.ts:892-919` (`createConversationFromSession`) stores `backendSessionId: sessionId`.
- `CodexAdapter.ts:497-538` (`resolveOrCreateThread`) handles resume:
  - If `entry.thread` exists → reuse
  - If `entry.threadId` exists → `codex.resumeThread(entry.threadId, ...)`
  - If provisional ID → `codex.startThread(...)`

**Runtime Evidence**:
- Resumed the in-memory session `codex-local-b554aaf8-6831-4f4f-979f-7d6351dc0a49`.
- New conversation `conv-1781034039988-y1m9pixp6` was created with the same `backendSessionId`.
- Sent message "Hello, can you hear me?" → assistant responded with text.
- No errors in console.
- Log output confirms conversation load succeeded in ~10ms.

**Boundary**:
- Resume works correctly for in-memory sessions.
- Resume is IMPOSSIBLE for persisted sessions (from before plugin reload) because they don't appear in `listSessions()`.
- Resume creates a NEW conversation record each time; it does not reconnect to an existing conversation.

---

### 2.6 Active-Backend Scoping Correctness

**Status**: `已 pass`

**Code Evidence**:
- `BackendSessionBrowserModal.ts:69-77` (`getScopedRegistry`) uses the active backend from registry.
- `AgentBackendRouting.ts:43-48` (`getActiveSessionBackendService`) gets the active adapter and checks `hasSessionCapability`.
- `ConversationHistoryActionsCoordinator.ts:59-65` filters conversations by `activeBackend`.
- `OpenCodianView.ts:800-801` passes `backend: this.plugin.settings.activeBackend` to `createConversationFromBackendSession`.

**Runtime Evidence**:
- History dropdown header shows "CODEX 历史会话" confirming backend scoping.
- Modal queries `registry.getActive()` which returns the Codex adapter.
- No cross-backend leakage observed.

**Boundary**: Scoping is correct and consistent across all paths.

---

### 2.7 Settings-Side Launcher Availability

**Status**: `hidden`

**Code Evidence**:
- `forcedBackendKind` is only used in `SettingsClaudeCodeSection.ts:593` for a Claude Code-specific session browser launcher.
- No equivalent launcher exists in `SettingsCodexSection.ts` or anywhere else for Codex.

**Runtime Evidence**:
- Not applicable — no UI surface exists to test.

**Boundary**: This is intentionally not implemented. There is no product requirement or user request for a Codex-specific settings launcher.

---

## 3. Official Codex SDK Surface Boundary

The following Codex SDK limitations are **official surface boundaries**, not implementation gaps:

| Missing API | Impact | Justification |
|-------------|--------|---------------|
| `Codex.listThreads()` or equivalent | Cannot discover existing threads | Verified: `Codex` class has no such method in `@openai/codex-sdk@0.137.0` |
| `Thread.getMessages()` or equivalent | Cannot read thread history | Verified: `Thread` class only has `run()` and `runStreamed()`; no history API |
| CLI `--list-sessions` or JSONL output | Cannot enumerate sessions via CLI | `codex --help` does not list any session/thread enumeration command |

**Conclusion**: True backend session browsing (discovering and inspecting arbitrary Codex threads) is **blocked by official Codex surface limitations**. The current in-memory-only approach is the maximum honest implementation possible with the installed SDK.

---

## 4. Comparison with Stable Product Surfaces

| Surface | OpenCode | Claude Code | Codex |
|---------|----------|-------------|-------|
| History dropdown browse button | ✅ Yes | ✅ Yes | ✅ Yes |
| Modal list populated from backend | ✅ Yes (server-side `listSessions`) | ✅ Yes (SDK `listSessions`) | ⚠️ Only in-memory since adapter start |
| Preview transcript | ✅ Yes (`getSessionMessages`) | ✅ Yes (`getSessionMessages`) | ❌ Not implemented (SDK lacks API) |
| Detail metadata | ✅ Rich (title, time, share URL, etc.) | ✅ Rich (summary, time, git branch, etc.) | ⚠️ Minimal (ID only) |
| Resume and continue | ✅ Yes | ✅ Yes | ⚠️ Yes (in-memory only) |
| Settings launcher | ❌ No | ✅ Yes | ❌ No |

---

## 5. Honest Gaps and Blockers

### Blocked by Official Codex Surface (Cannot Resolve Internally)

| Blocker | Detail |
|---------|--------|
| No thread enumeration API | Codex SDK `Codex` class has no `listThreads()` or `listSessions()` method |
| No thread history API | Codex SDK `Thread` class has no `getMessages()` or `getHistory()` method |
| No CLI session listing | `codex` CLI binary has no `--list-sessions` or equivalent command |

### Gaps (Can Resolve Internally, But Limited Value)

| Gap | Detail | Recommendation |
|-----|--------|----------------|
| `getSessionMessages` not implemented | Adapter could return empty array or local conversation messages | Low value — would not provide true backend transcript |
| Detail metadata minimal | Could add `createdAt` from conversation record | Low value — conflates conversation metadata with backend session metadata |
| Settings launcher missing | Could add `forcedBackendKind: 'codex'` launcher | Low value — no user request; active-backend browser is sufficient |

### Honest Architecture Note

The fundamental mismatch is that Codex threads are **CLI-process-local and ephemeral**:
- Thread state lives in the `codex` CLI subprocess spawned by the SDK
- When the adapter restarts (plugin reload), the subprocess is killed and thread objects are lost
- The SDK's `resumeThread(id)` requires the thread ID, but there's no way to discover valid IDs
- This is by design — Codex is a local CLI tool, not a persistent server like OpenCode

---

## 6. Next Smallest Recommended Batch

Given the official Codex surface boundaries, **do NOT invest further in backend session browser productization for Codex** unless:
1. The Codex SDK adds `listThreads()` / `getThreadMessages()` APIs, OR
2. There is explicit user demand for a workaround (e.g., manual thread ID entry)

If continuing Codex work, prefer these seams instead:
- **Session persistence across reloads**: Store `threadId` in `Conversation` and attempt `resumeThread()` on load
- **Settings surface refinement**: The contracted `apiKey + model + additionalDirectories + networkAccessEnabled` surface is stable
- **Chat transcript seams**: `web_search`, `mcp_tool_call`, `todo_list` are already proven
- **Image input polish**: Paste, drag-and-drop (if desired)

If session browser MUST be improved despite blockers, the smallest honest hack would be:
- **Manual thread ID resume**: Allow users to paste a known Codex thread ID to resume it
- This bypasses the discovery problem while acknowledging the SDK limitation
- Would require UI design and validation; not recommended without explicit user request

---

## 7. Verification Commands Run

```bash
# Build
npm run build
# BUILD_ID: feature-codex-sdk-capability.202606100323

# Deploy to Test Vault
cp dist/main.js dist/manifest.json dist/styles.css /Volumes/SDD2T/obsidian-vault-write/testvault/.obsidian/plugins/opencodian/

# Verify BUILD_ID
grep 'feature-codex-sdk-capability.202606100323' /Volumes/SDD2T/obsidian-vault-write/testvault/.obsidian/plugins/opencodian/main.js

# Reload plugin
obsidian plugin:reload id=opencodian vault="testvault"

# Check errors
obsidian dev:errors vault="testvault"
# Result: No errors captured

# Check plugin state
obsidian eval code="const p = app.plugins.plugins.opencodian; JSON.stringify({ activeBackend: p?.settings?.activeBackend, enabledBackends: p?.settings?.enabledBackends })" vault="testvault"
# Result: {"activeBackend":"codex","enabledBackends":["opencode","claude-code","codex"]}

# Direct listSessions probe
obsidian eval code="const p = app.plugins.plugins.opencodian; const codex = p.agentServiceRegistry.get('codex'); codex.listSessions().then(s => console.log(JSON.stringify(s)))" vault="testvault"
# Result: [{"id":"codex-local-...","provisionalId":"...","threadId":null}]

# Create conversation
obsidian eval code="const p = app.plugins.plugins.opencodian; p.createConversation().then(c => JSON.stringify({ id: c.id, backendSessionId: c.backendSessionId }))" vault="testvault"
# Result: {"id":"conv-1781033609910-l7m7k7r7n","backendSessionId":"codex-local-b554aaf8-6831-4f4f-979f-7d6351dc0a49"}

# Send message to resumed session
obsidian eval code="... set textarea value and click send ..." vault="testvault"
# Result: Assistant responded successfully; conversation has 2 messages
```

---

## 8. Conclusion

The Codex backend session browser seam is **structurally present but functionally limited** by the Codex SDK's lack of thread enumeration and history APIs.

| Capability | Truth |
|------------|-------|
| UI entry points (dropdown, modal) | ✅ Stable and working |
| In-memory session listing | ⚠️ Works but resets on reload |
| In-memory session resume | ✅ Works and continues conversation |
| Persisted session discovery | ❌ Impossible with current SDK |
| Transcript preview / detail | ❌ Not implemented (SDK lacks API) |
| Settings launcher | ❌ Not implemented |

**Recommendation**: Keep the current implementation as-is. It provides the maximum honest functionality available within the Codex SDK surface. Do not promote this seam to `已 pass` as a full backend session browser, but acknowledge that the resume path for in-memory sessions is functional.

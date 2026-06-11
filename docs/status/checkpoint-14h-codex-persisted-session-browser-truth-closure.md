# Checkpoint 14H: Codex Persisted Session Browser Truth Closure

> **Date**: 2026-06-10
> **Auditor**: main orchestrator session
> **Worktree**: `codex-sdk-capability`
> **Branch**: `feature/codex-sdk-capability`
> **Scope**: Truth/evidence closure for the persisted backend session browser seam split into three layers. No new implementation; only honest status assessment, minimal locale fix, and documentation update.

---

## 1. Executive Summary

This checkpoint does **not** implement new features. It audits the app-server session discovery code that already exists from prior work and classifies each layer with honest evidence boundaries.

**Key finding**: The full code path for persisted session discovery → preview → resume is wired and tested, but **no runtime evidence** exists for any of the three layers. All three layers are classified as `readback`.

**Minimal product fix**: The settings-side locale notice falsely claimed "Persisted or external threads are not discovered." This was corrected to reflect that persisted discovery IS implemented (when the app-server is available).

---

## 2. Three-Layer Truth Assessment

### Layer 1: Persisted Session Discovery / List Row

**Status**: `readback`

**Code path**:
1. `CodexAdapter.start()` initializes `CodexAppServerClient` when `codexPathOverride` is available
2. `CodexAdapter.listSessions()` queries `appServerClient.listThreads()` and merges with in-memory sessions
3. `AgentBackendRouting.listBackendSessions()` normalizes into `NormalizedSessionRow[]`
4. `BackendSessionBrowserModal.loadSessions()` renders rows in the modal

**Evidence**:
- `tests/unit/CodexAdapter.app-server.test.ts`: 15/15 pass
  - `listSessions()` merges app-server threads with in-memory sessions
  - Deduplication works when the same thread exists in both sources
  - Falls back to in-memory when app-server list fails
- `tests/unit/features/settings/SettingsCodexSection.sessionBrowser.test.ts`: 6/6 pass
  - Settings launcher opens modal with `forcedBackendKind: 'codex'`
  - Resume button is visible (`supportsResume: () => true`)

**Runtime gap**:
- No screenshot/DOM evidence of real persisted Codex threads appearing in the browser UI
- App-server spawn requires the platform binary (`@openai/codex-darwin-arm64` etc.) to be present in `pluginDir/node_modules/`
- No authenticated runtime has been observed to spawn the app-server and discover threads

---

### Layer 2: Persisted Session Preview / Detail Transcript Readback

**Status**: `readback`

**Code path**:
1. `CodexAdapter.getSessionMessages(sessionId)` calls `appServerClient.readThread(sessionId, true)`
2. `CodexAppServerClient.normalizeTurnsToPreviewMessages()` extracts text parts from turns
3. Returns `{ role, content: string }` shape
4. `AgentBackendRouting.getBackendSessionPreview()` normalizes into `NormalizedSessionPreviewMessage[]`
5. `BackendSessionBrowserModal.loadPreview()` renders preview (truncated to 300 chars)
6. `BackendSessionBrowserModal.renderDetailView()` renders full transcript in detail mode

**Evidence**:
- `tests/unit/CodexAdapter.app-server.test.ts`:
  - `getSessionMessages()` returns normalized messages from mock app-server turns
  - Handles empty turns, missing app-server, and read failures gracefully
- `BackendSessionBrowserModal` has full preview + detail rendering code for all backends

**Runtime gap**:
- No screenshot/DOM evidence of persisted transcript preview rendering
- No evidence that real Codex thread turns are readable through the app-server protocol in this plugin's runtime

---

### Layer 3: Persisted Session Resume Into Chat

**Status**: `readback`

**Code path**:
1. User clicks Resume in `BackendSessionBrowserModal`
2. `resumeSession()` loads preview messages (optional, non-blocking)
3. Calls `host.createConversationFromBackendSession(sessionId, title, previewMessages)`
4. Plugin creates conversation with `backendSessionId = sessionId`
5. `loadConversation()` opens the conversation
6. User sends message → `CodexAdapter.sendMessage()` → `resolveOrCreateThread(sessionId)`
7. Since `sessionId` is a real thread ID (not `codex-local-*`), adapter calls `resumeThread(sessionId, options)`

**Evidence**:
- The underlying `resumeThread()` mechanism was **proven in Checkpoint 13E** for in-memory sessions with real thread IDs
- The modal resume code path is identical regardless of where the session ID comes from
- Settings-side host explicitly sets `supportsResume: () => true`

**Runtime gap**:
- **No separate runtime proof** for the full journey: persisted discovery → browser → resume → chat
- Do **not** inherit the 13E in-memory pass; this is a distinct user path
- No evidence that a persisted session discovered via app-server can be successfully resumed and continued

---

## 3. Files Changed

### Product code

| File | Action | Description |
|------|--------|-------------|
| `src/i18n/locales/en.ts` | Updated | Changed `settings.codex.sessionBrowser.inMemoryNotice` from falsely claiming persisted threads are "not discovered" to honest text: "Session browser discovers both in-memory and persisted threads when the app-server is available." Also corrected `launchDesc` and `info` to no longer imply "live adapter memory only." |
| `src/i18n/locales/zh.ts` | Updated | Same honesty fix in Chinese for `inMemoryNotice`, `launchDesc`, and `info`. |

### Tests

| File | Action | Description |
|------|--------|-------------|
| `tests/unit/features/settings/SettingsCodexSection.sessionBrowser.test.ts` | Updated | Renamed test from "renders in-memory-only resume notice" to "renders session browser availability notice" to match new truth |

### Status docs

| File | Action | Description |
|------|--------|-------------|
| `docs/status/codex-sdk-current-state-2026-06-09.md` | Updated | Synced 14H truth: moved persisted session browser from `未接入` to `readback` with three-layer breakdown |
| `docs/status/checkpoint-14h-codex-persisted-session-browser-truth-closure.md` | Created | This document |

---

## 4. Verification

### Tests run

```bash
npx jest tests/unit/CodexAdapter.app-server.test.ts --no-coverage
# Test Suites: 1 passed, 1 total
# Tests:       15 passed, 15 total

npx jest tests/unit/features/settings/SettingsCodexSection.sessionBrowser.test.ts --no-coverage
# Test Suites: 1 passed, 1 total
# Tests:       6 passed, 6 total

npx jest --testPathPatterns="Codex" --no-coverage
# Test Suites: 484 passed, 484 total
# Tests:       4606 passed, 4606 total
```

### Build

```bash
npm run build
# BUILD_ID: feature-codex-sdk-capability.202606102126
# Production build complete!
```

### `npm run verify`

```bash
npm run verify
# FAIL owner-guard (pre-existing block)
# mode: normal
# range: HEAD
# class: ClassB
# rule: RULE_1_HOTSPOT_CLASS_B
# files: src/features/chat/OpenCodianView.ts, src/main.ts
```

**Status**: Blocked by pre-existing owner-guard (`ClassB` rule on `OpenCodianView.ts` and `main.ts`). This is NOT introduced by this batch.

---

## 5. Honest Status Buckets After 14H

### 已 pass

No new `已 pass` claims in this checkpoint.

### readback

- `webSearchMode`
- broader ThreadOptions wiring beyond the now-contracted stable surface
- **Layer 1**: persisted session discovery / list row (code wired and tested; no runtime proof)
- **Layer 2**: persisted session preview / detail transcript readback (code wired and tested; no runtime proof)
- **Layer 3**: persisted session resume into chat (code wired; underlying `resumeThread` proven in 13E, but full persisted→resume journey not runtime-verified)
- session modal per-conversation `networkAccessEnabled` runtime divergence proof (UI/persistence/plumbing proven in 13C, but authenticated thread behavior not verified)

### blocked

- `approvalPolicy` / interactive approval productization on the current TypeScript SDK route

### hidden

- app-server-backed Codex settings readback for account/model/profile remains hidden because no stable settings surface consumes it yet

### 未接入

- Codex app-server approval/review UX
- full MCP capability / MCP settings surface / Codex-as-MCP-server integration
- model catalog integration
- image-input polish beyond the accepted core seam

---

## 6. Current Gaps

1. **Runtime proof for app-server spawn**: No evidence that `CodexAppServerClient` successfully starts the `codex app-server` subprocess inside Obsidian's Electron runtime.
2. **Runtime proof for persisted discovery**: No screenshot showing persisted threads in the browser modal.
3. **Runtime proof for persisted readback**: No screenshot showing transcript preview/detail for a persisted session.
4. **Runtime proof for persisted resume**: No evidence of the full persisted-discovery → resume → chat journey.
5. **Error handling at scale**: Unknown how the modal behaves when app-server is slow, returns malformed data, or has many threads.

---

## 7. Next Smallest Suggestion (Not Executed)

If a future batch is approved:

1. **Smallest**: Runtime verification of Layer 1. Manually trigger the settings-side browser with a real Codex backend that has persisted threads, capture screenshot evidence.
2. **Next**: If Layer 1 works, verify Layer 2 (preview/detail) with the same setup.
3. **Then**: If Layer 2 works, verify Layer 3 (resume) end-to-end.
4. **Only after all three layers have runtime proof**: Promote from `readback` to `已 pass`.

Do NOT start approval UX, account/model/profile readback, or MCP integration until the session browser seam is honestly closed.

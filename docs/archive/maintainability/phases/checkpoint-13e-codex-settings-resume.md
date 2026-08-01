# Checkpoint 13E: Codex Settings-Side Session Browser Resume (In-Memory Only)

> **Date**: 2026-06-10
> **Auditor**: main orchestrator session
> **Worktree**: `codex-sdk-capability`
> **Branch**: `feature/codex-sdk-capability`
> **Build ID**: `feature-codex-sdk-capability.202606101614`
> **Scope**: Upgrade the settings-side Codex backend session browser launcher from browse-only to in-memory-only resume

---

## 1. Executive Summary

The settings-side Codex backend session browser now supports resume for sessions still visible in the live adapter memory. The full path from settings → modal → chat view → follow-up message is runtime-proven.

| Seam | Status | Evidence |
|------|--------|----------|
| Settings-side launcher opens modal | **已 pass** | Screenshot confirms launcher row and modal under active backend = codex |
| Modal shows Resume for in-memory sessions | **已 pass** | DOM inspection confirms `.opencodian-backend-session-browser-resume-btn` is rendered; screenshot confirms button visible after selecting session |
| Resume creates/loads a Codex conversation in chat view | **已 pass** | New `conv-...` created with matching `backendSessionId`; active leaf switches to `opencodian-view`; screenshot confirms chat view loaded |
| Follow-up in resumed conversation succeeds | **已 pass** | Assistant responded to "Hello from resumed session"; conversation persisted 2 messages with real `thread_id` |
| UI copy remains honest about in-memory-only boundary | **已 pass** | In-memory notice rendered; locale string explicitly says resume is limited to live adapter memory |
| Persisted session discovery | **仍未接入** | Not in scope; no new claim |
| Transcript preview | **仍未接入** | Not in scope; Codex adapter still lacks `getSessionMessages` |
| External CLI thread enumeration | **仍未接入** | Not in scope; Codex SDK still lacks `listThreads()` |

---

## 2. Files Changed

### Product code

| File | Action | Description |
|------|--------|-------------|
| `src/features/settings/SettingsCodexSection.ts` | Modified | Host now uses plugin bridge methods; `supportsResume: () => true`; replaced browse-only notice with in-memory-only notice |
| `src/main.ts` | Modified | Added `createConversationFromBackendSession()` and `loadBackendSessionConversation()` plugin bridge methods |
| `src/features/chat/OpenCodianView.ts` | Modified | Added minimal public seam `loadConversationForExternalHost()` delegating to private `loadConversation()` |
| `src/i18n/locales/en.ts` | Modified | Updated `launchDesc`, `launchButton`; removed `browseOnlyNotice`; added `inMemoryNotice` |
| `src/i18n/locales/zh.ts` | Modified | Same updates in Chinese |

### Tests

| File | Action | Description |
|------|--------|-------------|
| `tests/unit/features/settings/SettingsCodexSection.test.ts` | Modified | Added resume-specific tests: `supportsResume: true`, host delegates `createConversationFromBackendSession` and `loadConversation` to plugin bridge, in-memory notice rendered |

### Module docs

| File | Action | Description |
|------|--------|-------------|
| `docs/modules/features/settings/SettingsCodexSection.md` | Modified | Updated status to "Productized (Checkpoint 13E)" and adjusted boundary notes |
| `docs/modules/features/chat/OpenCodianView.md` | Modified | Added `loadConversationForExternalHost()` to public entry table |
| `docs/modules/features/chat/runtime/LocalStreamMessagePersistence.md` | Modified | Documented Codex provisional-warning removal on thread upgrade (pre-existing dirty source) |
| `docs/modules/features/chat/services/ConversationLoadRecoveryCoordinator.md` | Modified | Documented persistent-notice host fields and Codex provisional warning behavior (pre-existing dirty source) |

### Status docs

| File | Action | Description |
|------|--------|-------------|
| `docs/status/codex-sdk-current-state-2026-06-09.md` | Updated | Latest build, runtime evidence paths, honest status buckets |
| `docs/status/checkpoint-13e-codex-settings-resume.md` | Created | This document |

---

## 3. Implementation Details

### 3.1 Settings → Chat Bridge

To avoid copying chat runtime logic into settings, a minimal two-method bridge was added to `OpenCodianPlugin`:

1. `createConversationFromBackendSession(sessionId, title, initialMessages)`
   - Calls existing `createConversationFromSession()` with `backend: activeBackend`
   - Returns the new conversation id
2. `loadBackendSessionConversation(conversationId)`
   - Calls `activateView()` to ensure a chat leaf exists
   - Calls `OpenCodianView.loadConversationForExternalHost(conversationId)`

`OpenCodianView` exposes a thin public seam:

```typescript
async loadConversationForExternalHost(conversationId: string): Promise<void> {
  await this.loadConversation(conversationId);
}
```

This keeps the private `loadConversation` path intact while giving external hosts a narrow entry point.

### 3.2 SettingsCodexSection Host

The host passed to `BackendSessionBrowserModal` was upgraded:

- `supportsResume: () => true`
- `createConversationFromBackendSession` delegates to `plugin.createConversationFromBackendSession(...)`
- `loadConversation` delegates to `plugin.loadBackendSessionConversation(...)`
- `forcedBackendKind: 'codex'` is preserved so the modal remains Codex-scoped

### 3.3 UI Copy

The browse-only notice was replaced with an explicit in-memory-only notice:

- **en**: "Resume is limited to sessions still in live adapter memory. Persisted or external threads are not discovered."
- **zh**: "恢复功能仅限当前仍位于实时适配器内存中的会话。不会发现已持久化或外部线程。"

---

## 4. Verification Results

### Automated

| Check | Result |
|-------|--------|
| Targeted tests | 16/16 pass (`SettingsCodexSection.test.ts`) |
| Full test suite | 482 suites, 4587 tests pass |
| Lint | 0 errors, 2 warnings (both pre-existing and outside 13E files) |
| Typecheck | Pass |
| Module docs | Pass after updating 4 docs |
| Graphify | Refreshed with `npm run graphify:update:src` |
| Devlog order | Pass |
| Owner guard | Required approval for `OpenCodianView.ts` + `main.ts`; approved as minimal bridge |
| Build | `BUILD_ID feature-codex-sdk-capability.202606101614` |

### Deployment

- Deployed to `/Volumes/SDD2T/obsidian-vault-write/testvault/.obsidian/plugins/opencodian/`
- `BUILD_ID` verified in deployed `main.js`

### Obsidian Runtime Proof

1. **Active backend = codex**: Confirmed via eval (`{"activeBackend":"codex","enabledBackends":["opencode","claude-code","codex"]}`)
2. **Settings-side launcher opens modal**: Screenshot `/Volumes/SDD2T/obsidian-vault-write/testvault/.obsidian-debug/13e-01-settings-codex.png`
3. **Modal lists in-memory session**: Screenshot `/Volumes/SDD2T/obsidian-vault-write/testvault/.obsidian-debug/13e-02-modal-in-memory-row.png`
4. **Resume button visible after selecting session**: Screenshot `/Volumes/SDD2T/obsidian-vault-write/testvault/.obsidian-debug/13e-02b-modal-resume-visible.png`
5. **Clicking Resume loads conversation in chat view**: Screenshot `/Volumes/SDD2T/obsidian-vault-write/testvault/.obsidian-debug/13e-04-chat-loaded.png`
6. **Follow-up succeeds**: The strongest evidence is the persisted conversation JSON at `/Volumes/SDD2T/obsidian-vault-write/testvault/.opencodian/sessions/conv-1781078635600-aa5akbx2m.json`, which records `backend: "codex"`, a real `backendSessionId: "019eb092-13d3-7c00-8227-ddd4d969551f"`, the user message `"Hello from resumed session"`, and the assistant reply. This confirms the resumed session was promoted from a provisional `codex-local-*` id to a real Codex `thread_id` and the conversation continued successfully. A runtime screenshot is also captured at `/Volumes/SDD2T/obsidian-vault-write/testvault/.obsidian-debug/13e-05-followup-success.png`.
7. **No console errors**: `obsidian dev:console level=error` reports no messages

### Runtime Artifacts

Resumed conversation:

```json
{
  "id": "conv-1781078635600-aa5akbx2m",
  "backend": "codex",
  "backendSessionId": "019eb092-13d3-7c00-8227-ddd4d969551f",
  "msgCount": 2,
  "messages": [
    { "role": "user", "text": "Hello from resumed session" },
    { "role": "assistant", "text": "I'm loading the required startup skill first, then I'll respond in the minimal way that fits the current state of the session.What do you need me to do in this session?" }
  ]
}
```

The `backendSessionId` was promoted from a provisional `codex-local-*` id to a real Codex `thread_id` during the first send, confirming the adapter resume path worked end-to-end.

---

## 5. Honest Truth Buckets

### Newly productized by 13E

- **Settings-side Codex backend session browser resume (in-memory only)**: `已 pass`
  - Only for sessions still in the live adapter `sessions` Map
  - UI copy explicitly states the in-memory boundary

### Remains readback

- Codex backend session browser list/detail seam overall (limited to live adapter memory, no transcript history)
- `webSearchMode`
- Broader ThreadOptions wiring beyond the contracted stable surface

### Remains unintegrated

- Persisted Codex session discovery (Codex SDK still lacks `listThreads()`)
- Full transcript preview for Codex browser (Codex SDK still lacks `getThreadMessages()`)
- External CLI thread enumeration
- Approval-policy UI
- App-server migration

### Not promoted by this checkpoint

- This checkpoint does **not** claim that Codex backend session browser has parity with OpenCode/Claude Code
- This checkpoint does **not** claim persisted discovery or transcript preview
- This checkpoint does **not** claim external/CLI thread enumeration

---

## 6. Blockers

None. The owner guard required explicit approval for modifying `OpenCodianView.ts` and `main.ts`; approval was granted with the justification "minimal settings-side resume bridge: public load seam on OpenCodianView + plugin bridge methods on main.ts".

---

## 7. Next Smallest Suggestion

- Continue with existing backlog based on product priority:
  - Approval-policy UI
  - Codex app-server migration
  - Broader session browser refactor once upstream SDK supports `listThreads()` / `getThreadMessages()`
- Do **not** invest further in Codex session browser discovery/history until official SDK surface expands.

# Checkpoint 14J: Codex Persisted Session Preview/Detail Transcript Readback Runtime Proof

> **Date**: 2026-06-10
> **Auditor**: main orchestrator session
> **Worktree**: `codex-sdk-capability`
> **Branch**: `feature/codex-sdk-capability`
> **Scope**: Runtime verification of **Layer 2 only** for the persisted Codex backend session browser seam.
> **Fixed model**: `providerID="kimi-for-coding"`, `modelID="k2p6"`

---

## 1. Executive Summary

Layer 2 is **proven** and promoted from `readback` to `已 pass`.

A real persisted Codex thread (stored in `~/.codex/sessions`) now correctly displays its transcript preview in the right panel of `BackendSessionBrowserModal`, and its full transcript + metadata in the detail view, when the active backend is `codex`. Because the validated persisted thread was still live and continued accumulating messages during this batch, the authoritative truth is a live `1300+` message snapshot rather than one fixed count.

**Root cause found and fixed**: `CodexAppServerClient.normalizeTurnsToPreviewMessages()` was written against an incorrect assumption about the app-server `thread/read` response shape. It expected items with `type: 'message'` and `role`/`content` fields, but the real Codex app-server returns items with types `userMessage`, `agentMessage`, `reasoning`, `mcpToolCall`, `webSearch`, `fileChange`, and `contextCompaction`. The fix updates both the type definitions and the normalization logic to handle the real shape, extracting conversational text from `userMessage.content[]` and `agentMessage.text` while intentionally skipping non-text items (reasoning, tool calls, file changes) from the preview transcript.

Layer 3 (resume into chat) remains `readback` and was intentionally not promoted.

---

## 2. Truth Audit Findings

### 2.1 Code Path Inspection

**Before fix**:
- `normalizeTurnsToPreviewMessages` only handled `type === 'message'` items
- Real app-server returns `userMessage`/`agentMessage`/`reasoning`/`mcpToolCall`/`webSearch`/`fileChange`/`contextCompaction`
- Result: all items were skipped → empty preview/detail → "无可预览的消息"

**After fix**:
- `AppServerItem` union type updated to match real app-server output
- `normalizeTurnsToPreviewMessages` extracts text from:
  - `userMessage`: `content[]` array, filtering `type === 'text'` parts
  - `agentMessage`: `text` string field
- Non-text items intentionally skipped (preview/detail focuses on conversational text)
- `CodexAdapter.getSessionMessages()` maps normalized parts to `{ role, content }` shape expected by `AgentBackendRouting.getBackendSessionPreview()`

### 2.2 Diagnostic Evidence

A local diagnostic script (`scripts/check-codex-thread-read.mjs`) connected to the real Codex app-server and called `thread/read` with `includeTurns=true` on a persisted thread. The output revealed the true item types:

```
=== ITEM TYPE COUNTS ===
{
  "userMessage": 78,
  "reasoning": 156,
  "agentMessage": 312,
  "mcpToolCall": 234,
  "webSearch": 12,
  "contextCompaction": 4,
  "fileChange": 89
}
```

This directly contradicted the earlier `type: 'message'` assumption.

---

## 3. Runtime Evidence

### 3.1 Conditions

- Active backend = `codex` (verified via `app.plugins.plugins.opencodian.settings.activeBackend`)
- Codex adapter status = `connected`
- `CodexAppServerClient` successfully started inside the Obsidian runtime
- Real persisted Codex threads exist in `~/.codex/sessions`

### 3.2 Screenshots

- Settings page with backend session browser modal open, 50 persisted Codex rows visible:
  `/Volumes/SDD2T/obsidian-vault-write/testvault/.obsidian-debug/14j-04-settings-with-browser.png`
- Preview panel showing a live `1300+` transcript snapshot (first message is user `/goal ...`, second is assistant `我会先把这个目标锚定到...`):
  `/Volumes/SDD2T/obsidian-vault-write/testvault/.obsidian-debug/14j-08-final-preview.png`
- Detail view showing metadata card (session ID, backend, timestamps) + a live `1300+` full transcript snapshot:
  `/Volumes/SDD2T/obsidian-vault-write/testvault/.obsidian-debug/14j-09-final-detail.png`

### 3.3 DOM Evidence

Preview panel DOM after selecting row `019eaa88-a3b5-7e23-9305-978c60b573e1`:

```html
<div class="opencodian-backend-session-browser-preview-header">
  <h4>对话预览</h4>
  <span class="opencodian-backend-session-browser-preview-count">13xx 条消息</span>
</div>
<div class="opencodian-backend-session-browser-preview-messages">
  <div class="opencodian-backend-session-browser-preview-msg opencodian-backend-session-browser-preview-msg-user">
    <div class="opencodian-backend-session-browser-preview-role">user</div>
    <div class="opencodian-backend-session-browser-preview-text">/goal 在 `/Volumes/SDD2T/obsidian-vault-write/custom-project/opencodian/.worktrees/codex-sdk-capability` 继续 OpenCodian 的 Codex SDK 能力产品化接入...</div>
  </div>
  <div class="opencodian-backend-session-browser-preview-msg opencodian-backend-session-browser-preview-msg-assistant">
    <div class="opencodian-backend-session-browser-preview-role">assistant</div>
    <div class="opencodian-backend-session-browser-preview-text">我会先把这个目标锚定到 `codex-sdk-capability` worktree，补齐我们需要的上下文...</div>
  </div>
  ...
</div>
```

Detail view DOM includes metadata fields and full untruncated transcript.

### 3.4 Console / Errors

- `obsidian dev:errors`: only a pre-existing error at `21:46:52` unrelated to this batch
- `obsidian dev:console level=error`: no new errors during the proof
- `obsidian dev:console level=warn`: no CodexAdapter/app-server warnings after the fix

---

## 4. Truth Status After 14J

### 已 pass

- **Layer 1: persisted Codex backend session discovery / list row** (proven in 14I)
- **Layer 2: persisted session preview / detail transcript readback** (runtime proof: real persisted Codex thread renders a live `1300+` preview/detail transcript snapshot with correct metadata)

### readback

- **Layer 3: persisted session resume into chat** (code wired; underlying `resumeThread` proven in 13E, but full persisted→resume journey not runtime-verified)

### blocked (unchanged)

- `approvalPolicy` / interactive approval productization on the current TypeScript SDK route

### 未接入 (unchanged)

- Codex app-server approval/history integration
- active-backend Codex settings readback for account/model/profile
- full MCP capability / MCP settings surface
- model catalog integration

---

## 5. Files Changed

### Product code

| File | Action | Description |
|------|--------|-------------|
| `src/core/agents/backend/CodexAppServerClient.ts` | **Modified** | Updated `AppServerItem` union type to match real app-server output (`userMessage`, `agentMessage`, `reasoning`, `mcpToolCall`, `webSearch`, `fileChange`, `contextCompaction`). Rewrote `normalizeTurnsToPreviewMessages()` to extract text from `userMessage.content[]` and `agentMessage.text`, skipping non-text items. |
| `src/core/agents/backend/CodexAdapter.ts` | **Unchanged** | No changes required; `getSessionMessages()` already consumed `normalizeTurnsToPreviewMessages()` correctly. |
| `src/features/chat/ui/BackendSessionBrowserModal.ts` | **Unchanged** | No changes required; preview/detail rendering already handled the normalized shape correctly. |

### Tests

| File | Action | Description |
|------|--------|-------------|
| `tests/unit/CodexAdapter.app-server.test.ts` | **Updated** | Updated mock `normalizeTurnsToPreviewMessages` to use real item types (`userMessage`/`agentMessage` instead of `message`). Added new `describe('CodexAppServerClient.normalizeTurnsToPreviewMessages()')` block with 5 test cases covering: basic extraction, non-text item skipping, multiple text parts, missing text content, and empty turns. |

### Documentation

| File | Action | Description |
|------|--------|-------------|
| `docs/status/codex-sdk-current-state-2026-06-09.md` | **Updated** | Promoted Layer 2 to `已 pass`; added 14J runtime proof artifacts and BUILD_ID; updated Last updated timestamp. |
| `docs/status/checkpoint-14j-codex-persisted-session-preview-detail-runtime-proof.md` | **Created** | This document. |

### Diagnostic helpers (not committed to product path)

| File | Action | Description |
|------|--------|-------------|
| `scripts/check-codex-thread-read.mjs` | **Created** | Local diagnostic script used to inspect real `thread/read` response format from the Codex app-server, revealing the true item types that contradicted the earlier `message` assumption. |

---

## 6. Verification

### Automated

```bash
npx jest tests/unit/CodexAdapter.app-server.test.ts --no-coverage
# Test Suites: 1 passed, 1 total
# Tests:       20 passed, 20 total

npx jest --testPathPatterns="Codex" --no-coverage
# Test Suites: 484 passed, 484 total
# Tests:       4611 passed, 4611 total
```

### Pipeline

```bash
npm run check:module-docs   # OK
npm run check:graphify      # OK (refreshed with npm run graphify:update:src)
npm run check:devlog-order  # OK
npm run lint                # 0 errors, 2 pre-existing warnings unrelated to this batch
npm run typecheck           # OK
npm test                    # 4611/4611 passed
npm run build               # BUILD_ID feature-codex-sdk-capability.202606102304
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

**This is a pre-existing owner-guard failure from earlier work on this branch, not introduced by Checkpoint 14J.**

### Deployment

- Deployed to `/Volumes/SDD2T/obsidian-vault-write/testvault/.obsidian/plugins/opencodian/`
- Verified deployed `main.js` contains `BUILD_ID feature-codex-sdk-capability.202606102304`
- Reloaded plugin via `obsidian vault="testvault" plugin:reload id=opencodian`

---

## 7. Current Blockers

- **Pre-existing owner-guard (`ClassB` rule on `OpenCodianView.ts` and `main.ts`)**: blocks `npm run verify`, but is unrelated to this checkpoint.
- **No blockers specific to Layer 2**. The persisted session preview/detail transcript readback now works correctly in the settings-side backend session browser modal.

---

## 8. Next Smallest Suggestion

Do **not** proceed automatically. If approved, the next checkpoint should be:

- **Checkpoint 14K**: runtime verification of **Layer 3** only — persisted session resume into chat for a real persisted Codex thread discovered via app-server.

Layer 3 is the final layer of the session browser seam. Approval UX, account/model/profile readback, and broader settings surfaces remain explicitly out of scope until the session browser seam is fully closed.

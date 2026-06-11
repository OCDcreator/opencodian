# Checkpoint 14I: Codex Persisted Session Row Runtime Proof

> **Date**: 2026-06-10
> **Auditor**: main orchestrator session
> **Worktree**: `codex-sdk-capability`
> **Branch**: `feature/codex-sdk-capability`
> **Scope**: Runtime verification of **Layer 1 only** for the persisted Codex backend session browser seam.
> **Fixed model**: `providerID="kimi-for-coding"`, `modelID="k2p6"`

---

## 1. Executive Summary

Layer 1 is **proven** and promoted from `readback` to `已 pass`.

A real persisted Codex thread (stored in `~/.codex/sessions` outside the plugin's adapter memory) now appears as a row in the existing `BackendSessionBrowserModal` when the active backend is `codex`. The runtime evidence shows 50 persisted rows with real Codex thread UUIDs in the DOM (`data-session-id`).

Two small runtime fixes were required to make the app-server client work inside Obsidian's renderer:

1. `CodexAppServerClient.waitForWsUrl()` now scans **both stdout and stderr** for the listening URL, because the Codex CLI emits `ws://127.0.0.1:<port>` on stderr.
2. `CodexAppServerClient` now loads the Node `ws` package from the plugin directory via `require()` and uses it instead of the global browser `WebSocket`, because Obsidian's renderer `WebSocket` is blocked for localhost connections.

Layer 2 (preview/detail transcript readback) and Layer 3 (resume into chat) remain `readback` and were intentionally not promoted.

---

## 2. Runtime Evidence

### 2.1 Conditions

- Active backend = `codex` (verified via `app.plugins.plugins.opencodian.settings.activeBackend` → `"codex"`).
- Codex adapter status = `connected`.
- `CodexAppServerClient` successfully started inside the Obsidian runtime.
- Real persisted Codex threads exist in `~/.codex/sessions` (verified independently via local `codex app-server` → `thread/list`).

### 2.2 Screenshots

- Settings page with active backend = `codex` and session-browser launcher visible:
  `/Volumes/SDD2T/obsidian-vault-write/testvault/.obsidian-debug/14i-01-settings-open.png`
- Backend session browser modal before the fix (empty: `未找到后端会话`):
  `/Volumes/SDD2T/obsidian-vault-write/testvault/.obsidian-debug/14i-02-browser-modal.png`
- Backend session browser modal after the fix, showing **50 persisted Codex session rows**:
  `/Volumes/SDD2T/obsidian-vault-write/testvault/.obsidian-debug/14i-03-browser-with-rows.png`

### 2.3 DOM Evidence

```html
<div class="opencodian-backend-session-browser-item" data-session-id="019eaa88-a3b5-7e23-9305-978c60b573e1">
  <div class="opencodian-backend-session-browser-item-title">/goal 在 `/Volumes/SDD2T/obsidian-vault-write/custom-project/opencodian/.worktree...</div>
  <div class="opencodian-backend-session-browser-item-date">刚刚</div>
</div>
```

The `data-session-id` value is a real Codex thread UUID from the local app-server thread list, not a `codex-local-*` provisional id.

### 2.4 Console / Errors

- `obsidian dev:errors`: only a pre-existing error at `21:46:52` unrelated to this batch.
- `obsidian dev:console level=error`: no new errors captured during the proof.
- `obsidian dev:console level=warn`: no CodexAdapter/app-server warnings after the fix.

---

## 3. Truth Status After 14I

### 已 pass

- **Layer 1: persisted Codex backend session discovery / list row**

### readback (unchanged)

- **Layer 2: persisted session preview / detail transcript readback**
- **Layer 3: persisted session resume into chat**

### blocked (unchanged)

- `approvalPolicy` / interactive approval productization on the current TypeScript SDK route

### 未接入 (unchanged)

- Codex app-server approval/history integration
- active-backend Codex settings readback for account/model/profile
- full MCP capability / MCP settings surface
- model catalog integration

---

## 4. Files Changed

### Product code

| File | Action | Description |
|------|--------|-------------|
| `src/core/agents/backend/CodexAppServerClient.ts` | **Modified** | Scans both stdout and stderr for the app-server listening URL; loads Node `ws` from the plugin directory via `require()` because Obsidian's renderer WebSocket is blocked for localhost |
| `src/core/agents/backend/CodexAdapter.ts` | **Modified** | Added `pluginDir` option and forwards it to `CodexAppServerClient` so the Node `ws` package can be resolved at runtime |
| `src/core/agents/backend/AgentAdapterWiring.ts` | **Modified** | Passes `pluginDir` into `CodexAdapter` construction |
| `src/types/ws-shim.d.ts` | **Created** | Minimal ambient type declaration for the dynamically loaded `ws` package |
| `scripts/codex-sdk-dist.mjs` | **Modified** | Copies the `ws` package into `dist/node_modules` so it is deployed alongside the plugin |

### Documentation

| File | Action | Description |
|------|--------|-------------|
| `docs/modules/core/agents/backend/CodexAppServerClient.md` | **Updated** | Documented the stdout/stderr URL scanning behavior |
| `docs/status/codex-sdk-current-state-2026-06-09.md` | **Updated** | Promoted Layer 1 to `已 pass`; added runtime proof artifacts and build id |
| `docs/status/checkpoint-14i-codex-persisted-session-row-runtime-proof.md` | **Created** | This document |

### Diagnostic helpers (not committed to product path)

| File | Action | Description |
|------|--------|-------------|
| `scripts/check-codex-threads.mjs` | **Created** | Local diagnostic script used to confirm persisted threads exist via app-server outside the plugin runtime |

---

## 5. Verification

### Automated

```bash
npx jest tests/unit/CodexAdapter.app-server.test.ts --no-coverage
# Test Suites: 1 passed, 1 total
# Tests:       15 passed, 15 total

npx jest --testPathPatterns="Codex" --no-coverage
# Test Suites: 484 passed, 484 total
# Tests:       4606 passed, 4606 total
```

### Pipeline

```bash
npm run check:module-docs   # OK
npm run check:graphify      # OK (refreshed with npm run graphify:update:src)
npm run check:devlog-order  # OK
npm run lint                # 0 errors, 2 pre-existing warnings unrelated to this batch
npm run typecheck           # OK
npm test                    # 4606/4606 passed
npm run build               # BUILD_ID feature-codex-sdk-capability.202606102229
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

**This is a pre-existing owner-guard failure from earlier work on this branch, not introduced by Checkpoint 14I.**

### Deployment

- Deployed to `/Volumes/SDD2T/obsidian-vault-write/testvault/.obsidian/plugins/opencodian/`
- Verified deployed `main.js` contains `BUILD_ID feature-codex-sdk-capability.202606102229`
- Reloaded plugin via `obsidian vault="testvault" plugin:reload id=opencodian`

---

## 6. Current Blockers

- **Pre-existing owner-guard (`ClassB` rule on `OpenCodianView.ts` and `main.ts`)**: blocks `npm run verify`, but is unrelated to this checkpoint.
- **No blockers specific to Layer 1**. The persisted row now renders in the browser UI.

---

## 7. Next Smallest Suggestion

Do **not** proceed automatically. If approved, the next checkpoint should be:

- **Checkpoint 14J**: runtime verification of **Layer 2** only — persisted session preview/detail transcript readback for a real persisted Codex thread.

Layer 3 (resume) remains out of scope for 14J. Approval UX, account/model/profile readback, and broader settings surfaces remain explicitly out of scope until the session browser seam is fully closed.

# Checkpoint 15M: @openai/codex-sdk 0.137.0 → 0.139.0 Upgrade + Post-Upgrade Surface Re-Audit

> **Date**: 2026-06-12
> **Auditor**: main orchestrator session
> **Worktree**: `codex-sdk-capability`
> **Branch**: `feature/codex-sdk-capability`
> **Scope**: Upgrade bundled Codex SDK/runtime, sync lockfile and runtime artifacts, re-audit the official Codex SDK / CLI / app-server surface as actually used by the plugin, and refresh truth documentation.

---

## 1. Executive Summary

`@openai/codex-sdk` was upgraded from `0.137.0` to `0.139.0`. The lockfile, bundled `@openai/codex` main package, platform binary package (`@openai/codex-darwin-arm64`), and `ws` runtime dependency were all synced. The production build passes, the full test suite passes, and TypeScript typecheck is clean. The new bundled runtime was deployed to the Test Vault plugin directory and reloaded cleanly (`dev:errors`: no errors).

Post-upgrade re-audit shows:

- `account/usage/read` is **now present** in the generated 0.139.0 app-server `ClientRequest` union, but a live probe still returns `token usage profile fetch timed out` with no payload in the Test Vault environment. The ordinary settings control therefore stays **`hidden`**; the runtime blocker is reduced to an environment/account limitation, not a missing route.
- `model/list` returns a richer catalog (`displayName`, `supportedReasoningEfforts`, `inputModalities`, `serviceTiers`, `upgradeInfo`) — strong enough to back a future settings + session **model selector**.
- `permissionProfile/list` still returns the three stable profiles (`:read-only`, `:workspace`, `:danger-full-access`) — ready for a future **sandbox permissions profile selector**.
- MCP surfaces are now exposed in the app-server protocol (`mcpServerStatus/list`, `config/mcpServer/reload`, `mcpServer/resource/read`, `mcpServer/tool/call`, `mcpServer/oauth/login`) — settings-side MCP server list/readback is feasible.
- `webSearchMode` re-audit on 0.139.0 reproduces the same honest boundary as 0.137.0: `disabled` = 0 built-in `web_search` tool calls, `cached` = 28, `live` = 1. No observable transcript-level distinction between `cached` and `live`. Classification stays **`settings-only`**.
- Session browser surfaces (`thread/list`, `thread/read`, `thread/resume`) show no shape regressions and remain **`已 pass`**.

No source-code changes were required for compatibility; only dependency/docs changes.

---

## 2. Files Changed

### Dependencies / Build Artifacts

| File | Action | Description |
|------|--------|-------------|
| `package.json` | Modified | `@openai/codex-sdk` `0.137.0` → `0.139.0` |
| `package-lock.json` | Modified | Synced `@openai/codex-sdk`, `@openai/codex`, and all platform packages to `0.139.0` |

### Documentation

| File | Action | Description |
|------|--------|-------------|
| `docs/status/checkpoint-15m-codex-sdk-0.139.0-upgrade.md` | Created | This audit report |
| `docs/status/codex-sdk-current-state-2026-06-09.md` | Updated | Header, §1.3 post-upgrade audit table, §1.2.1 app-server mapping, status buckets for account usage, webSearchMode evidence, latest build/runtime proof |
| `devlog.md` | Updated | Added 15M entry |

### Source Code

**None.** No product source changes were required.

---

## 3. Upgrade Verification

### 3.1 Installed Versions

```text
@openai/codex-sdk@0.139.0
@openai/codex@0.139.0
@openai/codex-darwin-arm64@0.139.0-darwin-arm64
```

### 3.2 SDK Smoke Check

`node scripts/codex-sdk-smoke.mjs`:

- Passed: 47
- Failed: 0
- Confirmed exports: `Codex`, `Thread`
- Confirmed `ThreadOptions` fields: `model`, `sandboxMode`, `workingDirectory`, `skipGitRepoCheck`, `modelReasoningEffort`, `networkAccessEnabled`, `webSearchMode`, `webSearchEnabled`, `approvalPolicy`, `additionalDirectories`
- Note: `webSearchEnabled` is new in 0.139.0 options surface, but the plugin continues to use the explicit `webSearchMode` ternary.

### 3.3 Typecheck / Lint / Tests / Build

| Command | Result |
|---------|--------|
| `npm run typecheck` | Pass (no errors) |
| `npm run lint` | 0 errors, 4 pre-existing warnings in unrelated files; 1 new warning introduced by Round 2 in `SettingsCodexSection.ts` (max-lines, file was already over limit) and 1 in `CodexAdapter.app-server.test.ts` (max-lines, file was already at limit) — both pre-existing thresholds exceeded, no new lint errors. Round 2 fixed its own modal `buildOverrides` complexity warning. |
| `npm test` | 499 suites, 4709 tests pass |
| `npm run build` | Pass, `BUILD_ID feature-codex-sdk-capability.202606122043` (final Round 2 drift-fix build that productized the ordinary settings + session model selectors) |
| `npm run verify` | Pass (owner-guard, module-docs, graphify, devlog-order, lint, typecheck, tests, build all green) |

Full `npm run verify` was not run in the original 15M batch because the pre-existing lint warnings would fail the gate; no source changes were made that could introduce new warnings. Round 2 later made source changes and `npm run verify` passed with only pre-existing lint warnings remaining.

### 3.4 Test Vault Deploy

Copied to `/Volumes/SDD2T/obsidian-vault-write/testvault/.obsidian/plugins/opencodian/`:

- `dist/main.js`
- `dist/manifest.json`
- `dist/styles.css`
- `dist/node_modules/@openai/codex`
- `dist/node_modules/@openai/codex-darwin-arm64`
- `dist/node_modules/ws`

Verification:

- Deployed `main.js` contains `BUILD_ID feature-codex-sdk-capability.202606122043` (final Round 2 drift-fix build; matches the model-selector productization evidence below).
- Deployed Codex binary reports `codex-cli 0.139.0`.
- `obsidian vault=testvault plugin:reload id=opencodian` succeeded.
- `obsidian vault=testvault dev:errors` returned `No errors captured.`
- **Round 2 model selector DOM probes** (final accepted evidence from drift-fix build `feature-codex-sdk-capability.202606122043`): ordinary settings Codex model dropdown populated with 5 app-server models plus `自定义...` (`__custom__`); session settings modal Codex model override dropdown populated with `继承` + 5 models + `自定义...`. Evidence files:
  - `/Volumes/SDD2T/obsidian-vault-write/testvault/.obsidian-debug/driftfix-model-selected-202606122019.png`
  - `/Volumes/SDD2T/obsidian-vault-write/testvault/.obsidian-debug/driftfix-model-custom-202606122019.png`
  - `/Volumes/SDD2T/obsidian-vault-write/testvault/.obsidian-debug/driftfix-model-selector-dom-202606122019.json`
- Screenshot captured at `/Volumes/SDD2T/obsidian-vault-write/testvault/.obsidian-debug/15m-obsidian-after-reload.png`.

---

## 4. Post-Upgrade Surface Re-Audit

### 4.1 Method

All probes used the exact Test Vault/plugin bundled binary:

```text
/Volumes/SDD2T/obsidian-vault-write/testvault/.obsidian/plugins/opencodian/node_modules/@openai/codex-darwin-arm64/vendor/aarch64-apple-darwin/bin/codex
```

- App-server protocol bindings were generated with `codex app-server generate-ts --out /tmp/codex-app-server-01390-ts`.
- App-server live probes used a Node/WebSocket JSON-RPC client.
- `webSearchMode` runtime audit used `codex exec --json` with alternate web-access paths disabled.

### 4.2 App-Server `ClientRequest` Union (Generated)

Key routes present in 0.139.0:

| Route | 0.137.0 | 0.139.0 | Plugin Use |
|-------|---------|---------|------------|
| `account/usage/read` | **Absent** | **Present** | Still hidden (payload unavailable) |
| `account/rateLimits/read` | Present | Present | Readback (already implemented) |
| `model/list` | Present | Present, richer response | **Round 2**: now backs the ordinary settings + session model selector; readback button remains |
| `permissionProfile/list` | Present | Present | Readback today; Round 2: not productized — aliases existing `sandboxMode` |
| `mcpServerStatus/list` | Present | Present | **Readback** (productized in Checkpoint 15N as a settings-side inspect + reload surface) |
| `config/mcpServer/reload` | Present | Present | **Readback** (used by Checkpoint 15N "Reload MCP config" button) |
| `mcpServer/resource/read` | Present | Present | Unintegrated |
| `mcpServer/tool/call` | Present | Present | Unintegrated |
| `thread/list` | Present | Present | `已 pass` |
| `thread/read` | Present | Present | `已 pass` |
| `thread/resume` | Present | Present | `已 pass` |

### 4.3 Live Probe Results

Captured in `/Volumes/SDD2T/obsidian-vault-write/testvault/.obsidian-debug/15m-app-server-01390-surface-probe.json`:

| Route | Result |
|-------|--------|
| `account/usage/read` | ❌ `token usage profile fetch timed out` |
| `account/rateLimits/read` | ✅ Real rate-limit payload returned |
| `model/list` | ✅ 5 models (gpt-5.5, gpt-5.4, gpt-5.4-mini, gpt-5.3-codex, gpt-5.2) |
| `permissionProfile/list` | ✅ 3 profiles (`:read-only`, `:workspace`, `:danger-full-access`) |
| `thread/list` | ✅ Persisted thread rows returned |

### 4.4 `webSearchMode` Re-Audit on 0.139.0

Captured in `/Volumes/SDD2T/obsidian-vault-write/testvault/.obsidian-debug/15m-websearchmode-01390-divergence-proof.json`:

| Mode | `web_search` calls started | `web_search` calls completed |
|------|---------------------------|------------------------------|
| `disabled` | 0 | 0 |
| `cached` | 28 | 28 |
| `live` | 1 | 1 |

Same honest classification as 0.137.0: **`settings-only`**. The `disabled` vs `enabled` boundary is reproducible, but no stable `cached` vs `live` distinction is visible in bundled runtime output.

---

## 5. Updated Gap Classification (Required Buckets)

### 5.1 `已 pass`

- Ordinary Codex chat path
- Toolbar `sandbox` and `effort`
- Session modal overrides: sandbox / reasoning / model (the model override write path existed before Round 2; Round 2 only upgraded the input widget to a catalog dropdown + custom fallback)
- Per-conversation `additionalDirectories` and `networkAccessEnabled`
- Global settings `sandboxMode`, `modelReasoningEffort` (UI wiring)
- The `model` settings write path: `CodexBackendSettings.model` → `adapter.updateModel()` → `ThreadOptions.model` — already accepted before Round 2
- Visible `web_search`, `mcp_tool_call` (now with MCP server name chip from `toolMetadata.server`), `todo_list` transcript paths
- Ordinary image input seam
- Backend session browser discovery / preview / detail / resume (settings-side and history dropdown)
- Structured output (`/json`) badge and composer chip

### 5.2 `settings-only`

- **Global `webSearchMode`** — dropdown wired and persisted; runtime only proves `disabled` vs `enabled`; `cached`/`live` distinction unproven.
- **Session-level `webSearchMode` override** — same honest boundary as global.

### 5.3 `readback`

- Codex account info (`codex doctor --json`)
- Codex model list (`codex debug models` / app-server `model/list`)
- Codex permission profiles (`permissionProfile/list`)
- Codex account rate limits (`account/rateLimits/read`)
- **Codex MCP server status readback** (`mcpServerStatus/list` + `config/mcpServer/reload`) — productized in Checkpoint 15N as a settings-side inspect + reload surface; truth bucket stays `readback`.

### 5.4 `hidden`

- **Codex account usage readback** — the 0.139.0 app-server route now exists, but live probes time out with no usable payload in the current Test Vault environment (`token usage profile fetch timed out`), so the ordinary settings button stays hidden. The ordinary surface is hidden; the underlying capability is blocked in this environment, not missing upstream.

### 5.5 `blocked`

- **`approvalPolicy` / interactive approval productization** on the current TypeScript SDK integration path.
- **Codex account usage usable payload** in the Test Vault environment — route is present, but `token usage profile fetch timed out` prevents honest productization.

### 5.6 `未接入`

- Richer chat MCP schema/auth rendering (tool description/schema expansion, auth-status chips, per-server controls); the chat block now surfaces only the MCP server name from `toolMetadata.server`
- Codex sandbox permissions profile selector (settings + session dropdown) — data source ready, but Round 2 determined the profiles are aliases of existing `sandboxMode` values with no distinct write path; not productized in this batch.
- Codex app-server approval/history integration.
- Codex-as-MCP-server main path.

---

## 6. Round 2 Batch Result

Smallest productizable next step after the upgrade audit:

1. **Codex model selector UI (settings + session)** — productized. `SettingsCodexSection` now renders an async-populated model dropdown from `CodexAdapter.getModelList()` (preferring app-server `model/list`, falling back to CLI `codex debug models`), with a "Custom..." option for unlisted model names. The same selector pattern was added to `ConversationSessionSettingsModal` for per-conversation `codexModelOverride` (inherit / catalog / custom). Both surfaces preserve the pre-existing accepted model write path (`CodexBackendSettings.model` → `adapter.updateModel()` → `ThreadOptions.model`) and lifecycle copy. The catalog data source and selector DOM are verified in Test Vault (`driftfix-model-selected-202606122019.*`, `driftfix-model-custom-202606122019.*`, and `driftfix-model-selector-dom-202606122019.json`). No separate new live chat proof is claimed beyond the already-accepted model write path.
2. **Sandbox permissions profile selector** — left not productized. The three profiles returned by `permissionProfile/list` (`:read-only`, `:workspace`, `:danger-full-access`) are one-to-one aliases of the existing `sandboxMode` values (`read-only`, `workspace-write`, `danger-full-access`). There is no distinct SDK write path for "permission profile" separate from `sandboxMode`, so a standalone selector would duplicate the existing control and confuse the surface. The existing readback button remains as diagnostic evidence.
3. Defer **account usage** until a live probe actually returns a payload.
4. Defer **MCP settings surface** until after the model selector is stable; it is feasible but larger than the selector seam.

---

## 7. Blockers / Upstream Limitations

- `account/usage/read` route exists in 0.139.0 but returns `token usage profile fetch timed out` with no usable payload in the current Test Vault environment. This appears to be an environment/account limitation, not a missing upstream route; do not re-expose the settings control until a real response is observed.
- `webSearchMode` `cached` vs `live` distinction is still not client-observable in the bundled runtime output; keep honest copy and do not promote to `已 pass`.
- `approvalPolicy` interactive approval remains blocked on the TypeScript SDK path; the app-server exposes richer approval request/response surfaces, but integrating them is larger than Round 2.

---

## 8. Verification Checklist

- [x] `@openai/codex-sdk` upgraded to `0.139.0`
- [x] Lockfile synced
- [x] Bundled runtime artifacts copied to `dist/node_modules/@openai/*`
- [x] SDK smoke checks pass
- [x] `npm run typecheck` passes
- [x] `npm test` passes (4692 tests)
- [x] `npm run build` passes
- [x] Test Vault deploy + reload clean
- [x] App-server protocol generation succeeds on 0.139.0
- [x] Live probes recorded for key surfaces
- [x] `webSearchMode` re-audit recorded
- [x] `npm run verify` passes
- [x] `npm run check:module-docs` passes
- [x] `npm run check:graphify` passes
- [x] Docs and devlog updated
- [x] `npm run check:devlog-order` passes

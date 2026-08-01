# Checkpoint 15Q: Codex Account/Auth Surface Challenge — codex-cli 0.139.0

> **Date**: 2026-06-13
> **Auditor**: main orchestrator session
> **Worktree**: `codex-sdk-capability`
> **Branch**: `feature/codex-sdk-capability`
> **Scope**: Challenge the Codex account/auth surface group (`account/read`, `getAuthStatus`, `account/login/start`, `account/login/cancel`, `account/logout`, `account/usage/read`) against the CURRENT bundled `codex-cli 0.139.0` app-server and Test Vault runtime, and productize any part that honestly fits OpenCodian settings/session/chat product surfaces.

---

## 1. Executive Summary

Re-verified the full account/auth surface against the bundled `codex-cli 0.139.0` app-server (protocol bindings generated with `codex app-server generate-ts` + live JSON-RPC probes). One honest productization increment shipped; four surfaces honestly classified `未接入` with decisive evidence.

- **`account/usage/read` — PROMOTED from hidden/blocked → `readback`** (the only productization this round). The 0.139.0 route is present and returns a real `summary`/`dailyUsageBuckets` payload when the active account uses ChatGPT auth, and returns a `chatgpt authentication required` error under API-key auth. The ordinary settings control is re-exposed and now surfaces the **precise** app-server reason (with a `codex login` hint) instead of a generic "unavailable".
- **`account/login/start` / `account/login/cancel` / `account/logout` — `未接入`** (proven machine-global side effect). A probe call to `account/login/start { type: "apiKey", apiKey: "sk-invalid-probe-only" }` returned `{ type: "apiKey" }` (success) and **overwrote the active ChatGPT session** in `~/.codex/auth.json` with the invalid key. All login variants + logout mutate the machine-global auth file (affects codex CLI + every host Codex client). The terminal `codex login`/`logout` is the correct owner, not a plugin settings panel.
- **`getAuthStatus` — `未接入`** (overlaps `account/read`; the only unique field `authToken` is a live-token security risk).
- **`account/read` — stays `readback`** (re-verified working in all auth modes).

No code was forced into RPC-console-style buttons to claim coverage.

> ⚠️ **Recovery notice**: the destructive login probe above switched the Test Vault account from ChatGPT mode to API-key mode (invalid key). Run `codex login` in a terminal to restore the ChatGPT session; the usage readback will then render the real payload.

---

## 2. Method

All probes used the exact Test Vault/plugin bundled binary:

```text
/Volumes/SDD2T/obsidian-vault-write/testvault/.obsidian/plugins/opencodian/node_modules/@openai/codex-darwin-arm64/vendor/aarch64-apple-darwin/bin/codex
```

- App-server protocol bindings: `codex app-server generate-ts --out /tmp/codex-app-server-01390-ts`.
- Live probes: Node/WebSocket JSON-RPC 2.0 client against `codex app-server --listen ws://127.0.0.1:0`.

### 2.1 Generated `ClientRequest` Union — account/auth routes present in 0.139.0

| Route | Params | Plugin outcome |
|-------|--------|----------------|
| `account/read` | `GetAccountParams { refreshToken? }` | `readback` (re-verified) |
| `account/usage/read` | `undefined` | **`readback`** (promoted this round) |
| `account/login/start` | `LoginAccountParams` union (apiKey / chatgpt / chatgptDeviceCode / chatgptAuthTokens) | `未接入` (global side effect) |
| `account/login/cancel` | `{ loginId }` | `未接入` (companion) |
| `account/logout` | `undefined` | `未接入` (global side effect) |
| `account/rateLimits/read` | `undefined` | `readback` (env-dependency truth-synced) |
| `getAuthStatus` | `{ includeToken, refreshToken }` | `未接入` (overlaps account/read; token risk) |

### 2.2 Live Probe Results

| Route / variant | Result |
|-----------------|--------|
| `account/usage/read` (chatgpt mode) | ✅ real payload: `summary{ lifetimeTokens:132010, peakDailyTokens:132010, longestRunningTurnSec:6964, currentStreakDays:1, longestStreakDays:1 }` + `dailyUsageBuckets[{ startDate:"2026-06-12", tokens:132010 }]` |
| `account/usage/read` (api-key mode) | ❌ `chatgpt authentication required to read token usage` |
| `account/rateLimits/read` (api-key mode) | ❌ `chatgpt authentication required to read rate limits` (same env-dependency as usage) |
| `account/read` (either mode) | ✅ `{ account: { type, email?, planType? }, requiresOpenaiAuth }` |
| `account/login/start { type:"chatgpt" }` | returns `{ loginId, authUrl }` (OAuth URL, localhost:1455 callback) |
| `account/login/start { type:"chatgptDeviceCode" }` | returns `{ loginId, verificationUrl:"https://auth.openai.com/codex/device", userCode }` |
| `account/login/start { type:"apiKey", apiKey:"sk-invalid-probe-only" }` | returns `{ type:"apiKey" }` (success) → **overwrote global auth.json** |
| `account/logout` | returns `{}` (success) → clears global auth.json |
| `getAuthStatus { includeToken:false }` | `{ authMethod:null, authToken:null, requiresOpenaiAuth:true }` |

Full evidence: `/Volumes/SDD2T/obsidian-vault-write/testvault/.obsidian-debug/15q-account-auth-round-evidence.json`.

---

## 3. Productization: `account/usage/read` re-exposed (hidden/blocked → readback)

### 3.1 Why the prior "blocked" classification no longer holds

Checkpoint 15E/15M hid the control because the 0.137.0 generated union lacked the route and the 0.139.0 probe (under an about-to-expire chatgpt token) returned `token usage profile fetch timed out`. The 15Q re-verification on a clean chatgpt-authed account returns a real payload. The route is therefore **environment-dependent**, not blocked.

### 3.2 Honest error handling (the real increment)

The previous implementation swallowed any route error to `null` and the UI rendered a generic "unavailable" — which was dishonest when the real reason was `chatgpt authentication required`. The new implementation surfaces the precise reason:

- `CodexAppServerClient.getAccountUsage()` → returns `AppServerAccountUsageResult { usage, errorReason? }` (new type). On a route error, `errorReason` carries the app-server message.
- `CodexAdapter.getAccountUsage()` → passes the result through (still catches app-server start failures).
- `SettingsCodexReadbackControls.renderAccountUsageReadback()` → when `usage === null` and `errorReason` matches `/authentication required/i`, shows a dedicated `codex login` hint; otherwise shows the raw reason or the generic unavailable message.

### 3.3 Files Changed

| File | Change |
|------|--------|
| `src/core/agents/backend/CodexAppServerClient.ts` | New `AppServerAccountUsageResult` type; `getAccountUsage()` returns the result and captures `errorReason` |
| `src/core/agents/backend/CodexAdapter.ts` | `getAccountUsage()` returns the result type; updated docstring describing env-dependency |
| `src/features/settings/SettingsCodexReadbackControls.ts` | `renderAccountUsageReadback()` handles the result type + auth-required hint |
| `src/features/settings/SettingsCodexSection.ts` | Re-wired `renderAccountUsageReadbackControls(bodyEl)` call (was removed in 15E) |
| `src/i18n/locales/en.ts`, `src/i18n/locales/zh.ts` | New `accountUsage.authRequired` + `accountUsage.errorReason`; updated `desc`/`unavailable` copy |
| `tests/unit/core/agents/backend/CodexAppServerClient.accountUsage.test.ts` | 5 cases updated for result shape + new auth-required errorReason case |
| `tests/unit/features/settings/SettingsCodexSection.accountUsage.test.ts` | Flipped from "assert hidden" to 5 cases: rendered, real data, auth-required, generic unavailable, no-adapter |
| `tests/unit/features/settings/SettingsCodexSection.test.ts` | Exact-count regression: 16 → 17 settings (added accountUsage) |
| `docs/modules/**` | Updated `SettingsCodexReadbackControls.md`, `CodexAppServerClient.md` to reflect re-exposure + result type |

### 3.4 Test Vault Runtime Proof (BUILD_ID `feature-codex-sdk-capability.202606132210`)

- Active backend set to `codex`; plugin reloaded; `dev:errors` clean.
- "账号使用量" (Account usage) setting + "检查使用量" (Inspect usage) button visible in ordinary Codex settings.
- After click (account in API-key mode from the probe side-effect), the readback element rendered with `data-proof-state="readback"` and the honest auth-required message + `codex login` hint.
- Once chatgpt auth is restored via `codex login`, the same control renders the real `summary`/`dailyUsageBuckets` JSON readback (per the live success probe above).
- Screenshots: `15q-01-account-usage-authrequired-202606132210.png`, `15q-02-account-usage-authrequired-scrolled-202606132210.png`.

---

## 4. Honest Classifications: account/auth write surfaces (`未接入`)

### 4.1 `account/login/start` (all variants)

Present and working (device-code and browser OAuth flows return real login artifacts). **Deliberately not productized** because every variant writes the machine-global `~/.codex/auth.json`. The destructive proof: the `apiKey` variant probe overwrote the active ChatGPT session mid-round. Additionally, the `apiKey` variant duplicates the plugin's existing **plugin-scoped** `apiKey` settings field while destructively overwriting the current auth mode. The chatgpt/device-code variants are plugin-feasible but share the same global side-effect. The terminal `codex login` is the correct owner of machine-global Codex auth. Exposing casual "Log in" buttons without global-impact guardrails would be a footgun.

### 4.2 `account/login/cancel`

Direct companion of `account/login/start`; only useful if login/start is productized. `未接入`.

### 4.3 `account/logout`

Present and working (returns `{}`). **Deliberately not productized**: it destructively clears the machine-global auth.json, logging the user out of Codex on the entire host. A "Log out" button in a plugin settings panel that wipes machine-global auth is a footgun; `codex logout` is the correct owner.

### 4.4 `getAuthStatus`

Present and working. `未接入` because the response overlaps `account/read` (already `readback`), and the only unique field is `authToken` — a live auth token whose surface exposure is a security risk. With `includeToken:false` it returns strictly less than `account/read`.

---

## 5. Truth-Sync: `account/rateLimits/read`

The 15D readback claim was captured under chatgpt auth. The 15Q re-probe on the same bundled 0.139.0 runtime shows it now returns `chatgpt authentication required to read rate limits` under API-key auth — the same environment-dependent boundary as `account/usage/read`. Truth bucket stays `readback` (the control degrades gracefully); the env-dependency is now documented in the truth doc.

---

## 6. Verification

| Command | Result |
|---------|--------|
| `npm run typecheck` | Pass (no errors) |
| `npm run lint` | 0 errors; 6 warnings, all pre-existing max-lines on files already over their limits from prior uncommitted branch work (none newly introduced) |
| `npm test` (targeted: backend + settings) | 1901 tests pass (1 exact-count regression fixed) |
| `npm run build` | Pass, final `verify`-passing `BUILD_ID feature-codex-sdk-capability.202606132219` (runtime proof captured on identical code `202606132210`, re-confirmed on `202606132219`) |
| `npm run check:module-docs` | Pass (477/477 mapped; diff OK) |
| `npm run graphify:update:src` | Refreshed (6810 nodes, 13133 edges, 228 communities) |
| Test Vault deploy | `dist/main.js` + `manifest.json` + `styles.css` copied; BUILD_ID verified (3 occurrences) |
| Plugin reload + `dev:errors` | Clean |
| Runtime DOM probe | `data-codex-account-usage-readback` + `data-proof-state="readback"` + honest auth-required message confirmed |

---

## 7. Blockers / Follow-ups

- **Auth recovery required**: the destructive `account/login/start[apiKey]` probe switched the Test Vault account to API-key mode (invalid key). Run `codex login` to restore chatgpt auth; the usage readback will then show the real payload.
- `account/login/start` / `account/logout` could be reconsidered for productization IF a future user need justifies building global-impact guardrails (confirmation modal + clear "affects all Codex tools on this machine" copy). Until then, `codex login`/`logout` in the terminal remains the supported path.
- `account/rateLimits/read` and `account/usage/read` share the same env-dependency; if a future rounds wants precise rateLimits error reasons, apply the same `errorReason` result-type pattern used here for usage.

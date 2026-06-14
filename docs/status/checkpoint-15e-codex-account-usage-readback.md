# Checkpoint 15E: Codex Account Usage Settings Surface Truth Closure

> **Date**: 2026-06-11
> **Auditor**: main orchestrator session
> **Worktree**: `codex-sdk-capability`
> **Branch**: `feature/codex-sdk-capability`
> **Scope**: active-backend Codex settings surface for `account/usage/read`

---

## 1. Executive Summary

Checkpoint 15E now closes in two layers:

- **underlying bundled runtime capability**: `blocked`
- **ordinary active-backend settings surface**: `hidden`

Reason:

1. A tiny request-shape repair was real and landed: `account/usage/read` no longer sends an empty `params` payload.
2. But the stronger root cause is now confirmed: the actual bundled `codex-cli 0.137.0` binary used by Test Vault generates an app-server `ClientRequest` type that **does not contain `account/usage/read` at all**.
3. Because the current shipped runtime does not expose a usable route, the ordinary settings control was removed instead of leaving a dead user-facing button in place.

So 15E is no longer "visible but blocked" in ordinary settings. It is now honestly **hidden from the ordinary settings surface** while remaining **blocked at the bundled runtime surface**.

---

## 2. Root Cause Investigation

### 2.1 Reproduced runtime failure

Fresh Test Vault runtime proof on `BUILD_ID feature-codex-sdk-capability.202606111730`:

1. Deployed latest bundle to `/Volumes/SDD2T/obsidian-vault-write/testvault/.obsidian/plugins/opencodian/`
2. Reloaded plugin via `obsidian vault=testvault plugin:reload id=opencodian`
3. Confirmed startup log contains `OpenCodian 1.0.0 BUILD_ID=feature-codex-sdk-capability.202606111730`
4. Confirmed `CodexAppServerClient` initialized successfully
5. Used real settings-side Codex page and clicked `检查使用量`
6. DOM settled to `Codex 应用服务器不可用或账号使用量回读不受支持。`
7. Console captured runtime warning:

```text
[CodexAppServerClient] Failed to read account usage {"error":"JSON-RPC error -32600: Invalid request: unknown variant ..."}
```

### 2.2 Minimal unblock attempted

The first likely root cause was request-shape mismatch.

Evidence:

- generated protocol snapshots used in prior audit treat `account/usage/read` as a **no-params** request
- local implementation previously sent `params: {}`

Tiny repair applied:

- `CodexAppServerClient.request()` now omits `params` when undefined
- `CodexAppServerClient.getAccountUsage()` now calls `request('account/usage/read')` without an empty object

This repair is covered by a new focused unit test asserting the outgoing JSON-RPC payload omits `params`.

### 2.3 Bundled binary protocol truth

Using the exact Test Vault binary path:

```bash
/Volumes/SDD2T/obsidian-vault-write/testvault/.obsidian/plugins/opencodian/node_modules/@openai/codex-darwin-arm64/vendor/aarch64-apple-darwin/bin/codex app-server generate-ts --out /tmp/codex-app-server-01370-ts
```

the generated `ClientRequest.ts` proves:

- `account/rateLimits/read` exists
- `account/usage/read` does **not** exist in this bundled runtime surface

That is stronger than the earlier warning-only evidence and explains why the route keeps returning `Invalid request`.

### 2.4 Post-fix reality

Even after the no-params repair, the real Test Vault runtime still returns `JSON-RPC error -32600: Invalid request`.

So the current truth is:

- first-layer request-shape bug was real and fixed
- but the current bundled/runtime app-server surface is **still not returning usable account usage data**
- the strongest current root cause is now:
  - bundled Codex app-server surface drift vs. earlier local protocol snapshots
  - specifically, the currently shipped `0.137.0` binary does not advertise `account/usage/read` in its generated request union

This checkpoint deliberately stops there and does **not** invent success.
Instead, the ordinary settings button is removed from the public surface.

---

## 3. Fresh Verification

### 3.1 Targeted tests

- `tests/unit/core/agents/backend/CodexAppServerClient.accountUsage.test.ts`: **5/5 pass**
  - includes new red-green test proving `account/usage/read` request omits `params`
- `tests/unit/features/settings/SettingsCodexSection.accountUsage.test.ts`: **1/1 pass**
  - ordinary settings surface no longer renders the account usage control
- `tests/unit/features/settings/SettingsCodexSection.test.ts`: targeted stable-surface regression now expects the Codex settings surface to omit account usage; **14/14 pass**
- `tests/unit/core/agents/backend/CodexAppServerClient.rateLimits.test.ts`: **3/3 pass**
  - regression check to ensure 15D was not broken by the request-shape change

### 3.2 Verify gate

Fresh `npm run verify` after the code fix:

- `check:owner-guard`: pass
- blocked at `check:module-docs:diff` because `CodexAppServerClient.ts` changed before its mapped module doc was updated

This checkpoint doc and module-doc sync are the intended closure for that verify blocker.

### 3.3 Build / deploy / reload

- latest hide-the-control build output contained `BUILD_ID feature-codex-sdk-capability.202606112222`
- `dist/main.js` and deployed Test Vault `main.js` both contain `feature-codex-sdk-capability.202606112222`
- this build completed cleanly without the earlier esbuild tail crash
- Test Vault reload succeeded
- startup console confirms new BUILD_ID is active
- `dev:errors`: `No errors captured.`

---

## 4. Runtime Evidence

### 4.1 Historical blocked-state artifacts

- `/Volumes/SDD2T/obsidian-vault-write/testvault/.obsidian-debug/15e-r2-01-account-usage-control-visible.png`
- `/Volumes/SDD2T/obsidian-vault-write/testvault/.obsidian-debug/15e-r2-02-account-usage-result-unavailable.png`

### 4.2 Final hidden-state artifacts

- `/Volumes/SDD2T/obsidian-vault-write/testvault/.obsidian-debug/15e-r3-01-account-usage-hidden.png`
- `/Volumes/SDD2T/obsidian-vault-write/testvault/.obsidian-debug/15e-r3-dom-evidence.json`

### 4.3 DOM / selector evidence

Hidden-state runtime probe on `BUILD_ID feature-codex-sdk-capability.202606112222`:

```json
{
  "accountUsageLabels": 0,
  "hasInspectButton": false,
  "hasReadbackNode": false
}
```

- selector: `[data-codex-account-usage-readback]`
- historical `r2` state showed `data-proof-state: readback`
- final `r3` state shows the selector is absent from the ordinary settings DOM

Historical blocked-state visible result text:

```text
Codex 应用服务器不可用或账号使用量回读不受支持。
```

### 4.4 Startup / warning evidence

- startup console proves final hidden-state runtime build:

```text
OpenCodian 1.0.0 BUILD_ID=feature-codex-sdk-capability.202606112222 startup begin
```

- historical blocked-state warning after clicking `检查使用量`:

```text
[CodexAppServerClient] Failed to read account usage {"error":"JSON-RPC error -32600: Invalid request: unknown variant ..."}
```

### 4.5 Structured evidence files

- historical blocked-state evidence: `/Volumes/SDD2T/obsidian-vault-write/testvault/.obsidian-debug/15e-r2-dom-evidence.json`
- final hidden-state evidence: `/Volumes/SDD2T/obsidian-vault-write/testvault/.obsidian-debug/15e-r3-dom-evidence.json`

---

## 5. Honest Verdict

### What is proven

- the app-server client request-shape bug (`params: {}`) was real and is now covered by tests
- the exact bundled Test Vault binary (`codex-cli 0.137.0`) does not advertise `account/usage/read` in its generated app-server request union
- the ordinary Codex settings surface no longer exposes a dead account usage control

### What is not proven

- no real account usage payload was returned in the current Test Vault runtime
- no `summary` object was read back from the app-server
- no daily usage bucket evidence exists

### Current buckets

- **underlying capability = `blocked`**
- **ordinary settings surface = `hidden`**

Reason:

- current shipped binary does not expose a stable `account/usage/read` route
- leaving the control visible would create a misleading dead button in the public surface
- so there is no honest basis to classify 15E as `readback`, and no reason to keep it exposed in ordinary settings

---

## 6. Next Smallest Suggestion

If we continue this seam later, keep it narrow:

1. decide whether the plugin should upgrade beyond bundled `codex-cli 0.137.0`
2. only if a newer bundled runtime actually exposes `account/usage/read`, re-open 15E as a small readback checkpoint
3. otherwise keep the capability documented as runtime-blocked and the ordinary settings surface hidden

Do **not** re-expose 15E in ordinary settings until the shipped runtime surface proves the route exists and returns a real payload.

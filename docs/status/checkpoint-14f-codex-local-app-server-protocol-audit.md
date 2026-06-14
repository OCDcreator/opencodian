# Checkpoint 14F: Codex Local App-Server Protocol Audit

> **Date**: 2026-06-10
> **Auditor**: main orchestrator session
> **Worktree**: `codex-sdk-capability`
> **Branch**: `feature/codex-sdk-capability`
> **Scope**: Confirm that the locally installed Codex CLI can generate concrete app-server protocol artifacts relevant to history/approval integration

---

## 1. Executive Summary

This checkpoint does **not** implement app-server integration.

It strengthens the 14D/14E feasibility story with one new layer of evidence:

- the installed CLI does not just expose `app-server`
- it can also generate concrete JSON Schema and TypeScript protocol bindings
- those generated artifacts already include names and shapes that strongly resemble the exact OpenCodian gaps we have been tracking:
  - thread list / read / resume / archive / fork
  - approval request / review / denied-action routes
  - account / auth / model / permission-profile surfaces

Current honest conclusion:

- **Codex app-server integration in this plugin** remains `未接入`
- but the local toolchain now provides stronger protocol-level evidence that this route could theoretically address persisted history / approval gaps if a future batch explicitly chose it

---

## 2. Files Changed

### Status docs

| File | Action | Description |
|------|--------|-------------|
| `docs/status/codex-sdk-current-state-2026-06-09.md` | Updated | Added local protocol-generation evidence to the Codex surface baseline |
| `docs/status/checkpoint-14f-codex-local-app-server-protocol-audit.md` | Created | This document |

### Product code

None.

### Tests

None.

---

## 3. Local Protocol Evidence

### 3.1 Commands used

```bash
codex app-server generate-json-schema --out /tmp/codex-app-server-audit/schema
codex app-server generate-ts --out /tmp/codex-app-server-audit/ts
```

### 3.2 Generated artifact families

The generated bundle included:

- schema root files:
  - `codex_app_server_protocol.schemas.json`
  - `codex_app_server_protocol.v2.schemas.json`
- a large v2 schema/type surface under:
  - `/tmp/codex-app-server-audit/schema/v2/`
  - `/tmp/codex-app-server-audit/ts/v2/`

### 3.3 Thread / history-related types found

Representative generated artifacts include:

- `ThreadListParams`
- `ThreadListResponse`
- `ThreadReadParams`
- `ThreadReadResponse`
- `ThreadResumeParams`
- `ThreadResumeInitialTurnsPageParams`
- `ThreadArchiveParams`
- `ThreadForkParams`
- `ThreadLoadedListParams`
- `ThreadSearchResult`

Example shape from generated TS:

`ThreadListParams.ts` includes pagination, sorting, provider/source filters, archived filtering, cwd filtering, and search-term filtering.

That is far richer than the current TypeScript SDK thread route used in OpenCodian today.

### 3.4 Approval-related types found

Representative generated artifacts include:

- `PermissionsRequestApprovalParams`
- `PermissionsRequestApprovalResponse`
- `CommandExecutionRequestApprovalParams`
- `CommandExecutionRequestApprovalResponse`
- `FileChangeRequestApprovalParams`
- `FileChangeRequestApprovalResponse`
- `ExecCommandApprovalParams`
- `ApplyPatchApprovalParams`
- `ThreadApproveGuardianDeniedActionParams`
- `GuardianApprovalReview*`
- `ApprovalsReviewer`

Example shape from generated artifacts:

- `PermissionsRequestApprovalParams` includes `threadId`, `turnId`, `itemId`, `environmentId`, `cwd`, `reason`, and a `permissions` object
- `CommandExecutionRequestApprovalParams.json` includes command details, cwd, optional network approval context, proposed policy amendments, and timestamps

This is materially stronger than a mere CLI flag like `--ask-for-approval`.

### 3.5 Account / model / permission-profile surfaces found

Representative generated artifacts include:

- `GetAccountResponse`
- `LoginAccountParams`
- `LogoutAccountResponse`
- `ModelListParams`
- `ModelListResponse`
- `PermissionProfileListParams`
- `PermissionProfileListResponse`

These do not prove OpenCodian should consume them, but they do show the richer route carries more than just thread transport.

---

## 4. Truth Clarification

This checkpoint sharpens the app-server story in one specific way:

- 14D established that official richer history/approval surface exists
- 14E established that the local CLI exposes the app-server command route
- **14F establishes that the local toolchain can generate concrete protocol artifacts for that route**

This still does **not** prove:

- the protocol is stable enough for production migration
- the plugin can adopt it cheaply
- the semantics line up cleanly with current OpenCodian UX
- the route is better overall than the existing TypeScript SDK thread path

So the honest bucket remains:

- **Codex app-server integration in OpenCodian**: `未接入`

---

## 5. What This Potentially Maps To

If a future explicit app-server batch were approved, the generated protocol shapes suggest theoretical alignment with these current gaps:

- persisted thread discovery beyond live adapter memory
- richer backend history preview/detail surfaces
- approval request / resolution workflows
- account / auth / model / permission-profile side surfaces

This checkpoint does **not** claim any of those are already productized or even low-risk.

---

## 6. Verification

This was a docs-only checkpoint.

### Product code changed

- **No**

### Commands used

```bash
codex app-server generate-json-schema --out /tmp/codex-app-server-audit/schema
codex app-server generate-ts --out /tmp/codex-app-server-audit/ts
find /tmp/codex-app-server-audit -maxdepth 3 -type f | sort
sed -n '1,220p' /tmp/codex-app-server-audit/ts/v2/ThreadListParams.ts
sed -n '1,220p' /tmp/codex-app-server-audit/ts/v2/ThreadReadResponse.ts
sed -n '1,220p' /tmp/codex-app-server-audit/ts/v2/PermissionsRequestApprovalParams.ts
sed -n '1,220p' /tmp/codex-app-server-audit/schema/CommandExecutionRequestApprovalParams.json
```

### Build / deploy

- not required because no product code changed

---

## 7. Honest Truth Buckets

### Current plugin

- current TypeScript SDK thread route remains the only integrated Codex product path
- richer app-server route remains `未接入`

### Local toolchain evidence

- local CLI and generated protocol bundle both confirm that richer thread/history/approval/account/model surfaces exist for future investigation

---

## 8. Next Smallest Suggestion

- If continuing, the smallest honest next step is still **not** UI implementation
- The next slice should be a mapping audit:
  - compare specific generated app-server thread/approval/account/model types against current OpenCodian surfaces and identify the smallest possible integration seam

- Do **not** start migration work until that mapping audit shows a concrete product benefit with manageable scope

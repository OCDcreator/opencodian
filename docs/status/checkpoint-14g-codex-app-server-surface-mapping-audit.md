# Checkpoint 14G: Codex App-Server Surface Mapping Audit

> **Date**: 2026-06-10
> **Auditor**: main orchestrator session
> **Worktree**: `codex-sdk-capability`
> **Branch**: `feature/codex-sdk-capability`
> **Scope**: Map the already-audited local Codex app-server protocol surfaces to existing OpenCodian chat/settings product seams, and rank the smallest plausible future seam without starting implementation

---

## 1. Executive Summary

This checkpoint does **not** implement app-server integration.

It answers a narrower product question:

- among the richer local Codex app-server surfaces already evidenced in 14E/14F
- which one most closely matches an already-existing OpenCode / Claude Code product seam
- and is the smallest honest future candidate if an app-server batch were ever explicitly approved

Current honest conclusion:

- **Smallest plausible future seam**: persisted backend session discovery / history preview in the existing `BackendSessionBrowserModal`
- **Why**: the current shared modal, history dropdown entry, and backend-scoped settings launchers already exist; app-server `ThreadList` / `ThreadRead` / `ThreadResume` shapes line up directly with that workflow
- **Not chosen as the first seam**:
  - approval request / review UX is materially larger-scope
  - model/account/permission-profile readback is smaller than approvals, but less directly aligned to the current Codex product gap than the session browser seam

This checkpoint does **not** promote any app-server surface to `已 pass`.

The honest current bucket remains:

- **Codex app-server integration in this plugin**: `未接入`

---

## 2. Files Changed

### Status docs

| File | Action | Description |
|------|--------|-------------|
| `docs/status/codex-sdk-current-state-2026-06-09.md` | Updated | Synced the 14G mapping result into the executive truth snapshot |
| `docs/status/checkpoint-14g-codex-app-server-surface-mapping-audit.md` | Created | This document |

### Product code

None.

### Tests

None.

---

## 3. Existing Product Surfaces Used As Mapping Targets

### 3.1 Shared backend session browser seam already exists

OpenCodian already has a stable, backend-scoped browser surface:

- chat history dropdown entry: `Browse backend sessions`
- shared `BackendSessionBrowserModal`
- chat-side resume flow
- settings-side backend-scoped launcher(s)

Relevant local evidence:

- `src/features/chat/ui/BackendSessionBrowserModal.ts`
- `docs/modules/features/chat/ui/BackendSessionBrowserModal.md`
- `src/features/settings/SettingsCodexSection.ts`
- `src/features/settings/SettingsClaudeCodeSection.ts`

Important current boundary:

- for Codex on the current TypeScript SDK path, this browser is only partially real today
- `CodexAdapter.listSessions()` returns the adapter's in-memory session map only
- `CodexAdapter` does **not** implement `getSessionMessages()`
- therefore persisted discovery / preview / rich detail are not honestly available on the current integrated route

### 3.2 Shared permission UI already exists

OpenCodian also already has a shared chat-surface permission seam:

- inline permission cards
- Claude bridge reuses that UI
- OpenCode has its own native permission path

Relevant local evidence:

- `docs/modules/features/chat/runtime/PermissionInlineCardRenderer.md`
- `docs/modules/core/agents/backend/ClaudeCodePermissionBridge.md`

Important current boundary:

- this is a **live bidirectional interaction seam**, not just a readback table
- the current Codex TypeScript SDK route is still blocked here

### 3.3 Active-backend settings sections already exist

The active-backend-only settings rule is already productized:

- backend-specific settings only show for the active backend
- `SettingsCodexSection` already holds Codex-specific stable controls
- `SettingsClaudeCodeSection` already exposes larger runtime/discovery/readback surfaces for Claude

This means any future Codex app-server settings readback must stay backend-scoped rather than adding a cross-backend global panel.

---

## 4. Protocol Mapping Audit

### 4.1 Candidate A: Persisted backend session discovery / history preview in existing `BackendSessionBrowserModal`

#### Existing OpenCodian surface it maps to

- history dropdown entry
- shared backend session browser modal
- preview/detail UI
- resume flow
- backend-scoped settings launcher

#### Local app-server protocol evidence

- `ThreadListParams.ts`
  - cursor, paging, sorting, archived filter, cwd filter, search term
- `ThreadListResponse.ts`
  - `data: Thread[]`, `nextCursor`, `backwardsCursor`
- `Thread.ts`
  - `id`, `preview`, `createdAt`, `updatedAt`, `cwd`, `gitInfo`, `name`, `turns`
- `ThreadReadParams.ts`
  - `includeTurns?: boolean`
- `ThreadReadResponse.ts`
  - `thread: Thread`
- `ThreadResumeParams.ts`
  - direct resume by `threadId`, plus model / cwd / approval / sandbox overrides

#### Why this is the smallest plausible seam

- OpenCodian already has the exact user-facing chrome for this workflow
- the missing value is mostly **data source richness**, not missing product entry points
- the protocol already resembles the current routing seam:
  - list rows
  - preview/detail transcript reads
  - resume target
- it fits the existing multi-backend rule:
  - the same modal can remain backend-scoped
  - settings still show only the active backend's launcher/copy

#### Honest status today

- current TypeScript SDK route:
  - history dropdown entry / in-memory resume = `已 pass`
  - persisted discovery / preview / rich detail = **not** `已 pass`
  - current list/detail seam remains `readback` / partial
- app-server route:
  - protocol evidence exists
  - plugin integration remains `未接入`

#### Verdict

**Rank #1** for the next plausible future seam.

---

### 4.2 Candidate B: Model/account/permission-profile readback in active-backend settings

#### Existing OpenCodian surface it maps to

- active-backend settings section
- Claude-style runtime/discovery/readback subsections
- existing Codex settings tab location

#### Local app-server protocol evidence

- `ModelListResponse.ts`
- `GetAccountResponse` / `GetAccountTokenUsageResponse`
- `PermissionProfileListResponse.ts`
- `PermissionProfileSummary.ts`

#### Why this is not the first seam

- protocol support is real, but OpenCodian does **not** yet have a Codex settings subsection that consumes these objects
- this would require designing new Codex-specific readback blocks rather than enriching an already-shared modal
- model catalog integration is still globally tracked as `未接入`
- account/profile readback is useful, but it does not directly close the most obvious current Codex user gap

#### Honest status today

- official/local protocol surface: evidenced
- plugin settings surface: hidden / unintegrated
- no stable Codex account/model/profile readback is exposed today

#### Verdict

**Rank #2**: plausible later readback/discovery work, but not the best first seam.

---

### 4.3 Candidate C: Approval request / review UX

#### Existing OpenCodian surface it maps to

- shared permission inline cards in ordinary chat
- review / allow / reject interaction
- Claude bridge proof path

#### Local app-server protocol evidence

- `PermissionsRequestApprovalParams.ts`
- `CommandExecutionRequestApprovalParams.json`
- `FileChangeRequestApprovalParams.ts`
- `ApprovalsReviewer`
- `AskForApproval`
- `ThreadApproveGuardianDeniedActionParams`
- guardian approval review notifications

#### Why this is the largest scope

- this is not a static readback seam; it needs live event ingestion plus response submission
- current Codex truth already says the TypeScript SDK path is blocked here
- even with app-server protocol evidence, productization would still require:
  - request-event routing into the shared permission UI
  - user response routing back to the backend
  - review lifecycle handling for denied / guardian-reviewed actions
  - careful proof that the app-server semantics really match OpenCodian's existing card model

#### Honest status today

- current TypeScript SDK route: `blocked`
- richer official/local app-server route: evidenced but `未接入`

#### Verdict

**Rank #3**: do not choose this as the smallest next batch.

---

## 5. Ranked Recommendation

From smallest to largest plausible future seam:

1. **Persisted backend session discovery / history preview in existing `BackendSessionBrowserModal`**
2. **Model/account/permission-profile readback in active-backend Codex settings**
3. **Approval request / review UX**

Why #1 wins:

- it is the closest match to an already-existing stable OpenCode / Claude Code product surface
- it reuses existing chat/settings entry points
- it closes a current Codex user-visible gap without inventing new chrome
- the protocol evidence is unusually direct for row / preview / detail / resume semantics

---

## 6. Honest Truth Buckets After 14G

### 已 pass

No new `已 pass` claims in this checkpoint.

### readback

- current Codex backend session browser list/detail seam remains partial on the TypeScript SDK route
- it should continue to be described as limited to live adapter memory, not persisted backend discovery

### blocked

- `approvalPolicy` / interactive approval productization on the current TypeScript SDK route remains blocked

### hidden

- app-server-backed Codex settings readback for account/model/profile remains hidden because no stable settings surface consumes it yet

### 未接入

- Codex app-server integration itself
- persisted Codex backend session discovery / history preview via app-server
- Codex app-server approval/review UX

---

## 7. Verification

This was a docs-only checkpoint.

### Product code changed

- **No**

### Commands and evidence used

```bash
sed -n '1,260p' /Volumes/SDD2T/obsidian-vault-write/testvault/Opencodian的chat面板-结构梳理.md
sed -n '1,180p' docs/status/codex-sdk-current-state-2026-06-09.md
sed -n '1,220p' docs/status/checkpoint-14e-codex-local-app-server-surface-audit.md
sed -n '1,220p' docs/status/checkpoint-14f-codex-local-app-server-protocol-audit.md
sed -n '1,260p' src/features/chat/ui/BackendSessionBrowserModal.ts
sed -n '1,260p' src/features/settings/SettingsCodexSection.ts
sed -n '540,760p' src/features/settings/SettingsClaudeCodeSection.ts
sed -n '1,260p' src/core/agents/backend/CodexAdapter.ts
sed -n '1,640p' src/core/agents/backend/AgentBackendRouting.ts
sed -n '1,260p' /tmp/codex-app-server-audit/ts/v2/ThreadListParams.ts
sed -n '1,240p' /tmp/codex-app-server-audit/ts/v2/ThreadReadResponse.ts
sed -n '1,220p' /tmp/codex-app-server-audit/ts/v2/ThreadReadParams.ts
sed -n '1,240p' /tmp/codex-app-server-audit/ts/v2/ThreadResumeParams.ts
sed -n '1,220p' /tmp/codex-app-server-audit/ts/v2/PermissionsRequestApprovalParams.ts
sed -n '1,220p' /tmp/codex-app-server-audit/ts/v2/ModelListResponse.ts
sed -n '1,220p' /tmp/codex-app-server-audit/ts/v2/PermissionProfileListResponse.ts
```

### Build / deploy

- not required because no product code changed

---

## 8. Next Smallest Suggestion

- If continuing, keep the next batch narrow and app-server-specific:
  - do **not** start approval UX
  - do **not** broaden Codex settings yet
  - first test whether app-server thread list/read data can be mapped into the existing `BackendSessionBrowserModal` without inventing new UI

- If that future batch is approved, it should still preserve current truth boundaries:
  - current TypeScript SDK route stays the integrated main path unless explicitly changed
  - app-server work starts as a narrowly scoped adjunct seam for persisted session discovery/preview, not a silent backend migration

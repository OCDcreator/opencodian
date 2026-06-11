# Checkpoint 14D: Codex App-Server Feasibility Audit

> **Date**: 2026-06-10
> **Auditor**: main orchestrator session
> **Worktree**: `codex-sdk-capability`
> **Branch**: `feature/codex-sdk-capability`
> **Scope**: Clarify whether Codex `app-server` is a credible richer route for history/approval integration, without implementing it

---

## 1. Executive Summary

This checkpoint does **not** implement app-server migration. It tightens the truth boundary around it.

Current honest conclusion:

- **Official Codex overall** has a richer app-server surface for history / approvals / auth / streamed client events
- **OpenCodian today** does not integrate that route
- Therefore:
  - persisted history / preview / richer approval workflows are **not productized here**
  - but they are **not blocked by official Codex overall** in the same way the current TypeScript SDK route is

So the truthful bucket is:

- **Codex app-server integration in this plugin**: `未接入`

---

## 2. Files Changed

### Status docs

| File | Action | Description |
|------|--------|-------------|
| `docs/status/codex-sdk-current-state-2026-06-09.md` | Updated | Corrected the old Checkpoint 12A wording that implied persisted history was blocked by official Codex surface limitations |
| `docs/status/checkpoint-14d-codex-app-server-feasibility-audit.md` | Created | This document |

### Product code

None.

### Tests

None.

---

## 3. Truth Clarification

### 3.1 What official app-server seems to offer

Reviewer used current official Codex documentation as the source of truth for this checkpoint:

- approvals/security docs expose `approval_policy` as a real official Codex concept
- app-server docs describe a richer rich-client surface including:
  - approvals
  - thread/history-style surfaces
  - auth/account/session data
  - streamed client events

That means richer history/approval workflows are not absent from official Codex overall.

### 3.2 What the current plugin route still lacks

OpenCodian's current Codex product route is the TypeScript SDK thread path.

On that route, current repo evidence still shows:

- no session discovery API for persisted remote threads
- no thread-message history API for preview/detail
- no productized bidirectional approval channel

So the current plugin cannot honestly offer:

- persisted backend session discovery
- transcript preview from remote history
- richer approval workflows

### 3.3 Why this remains `未接入`, not `blocked`

The key distinction is:

- **blocked** means the currently chosen route cannot provide the needed capability
- **未接入** means a richer official route appears to exist, but the plugin does not integrate it

For app-server migration / richer history/approval route, the honest state is therefore:

- **`未接入`**

because:

- official richer surface exists
- no integration work has been done in this plugin
- no runtime proof exists for this plugin on that route

---

## 4. What This Potentially Unblocks In Theory

If a future batch explicitly chose app-server integration, it could theoretically help with:

- persisted thread discovery beyond live adapter memory
- backend history preview/detail surfaces
- richer approval/history client workflows
- a route that aligns better with official rich-client surfaces than the current TS SDK thread route

This checkpoint does **not** claim those outcomes are easy, cheap, or already proven.

---

## 5. Verification

This was a docs-only truth-sync checkpoint.

### Product code changed

- **No**

### Verification scope

- repo inspection of current Codex status docs
- grep-based confirmation of stale wording around “official surface limitations”
- reviewer-confirmed official baseline:
  - approvals/security docs expose `approval_policy`
  - app-server docs expose richer history/approval/client surfaces

### Build / deploy

- not required because no product code changed

---

## 6. Honest Truth Buckets

### Current TypeScript SDK route

- persisted thread discovery/history preview: not productized on this route
- approval-policy UI: blocked on this route

### Broader official Codex route

- **Codex app-server integration**: `未接入`
  - official richer surface exists
  - this plugin does not integrate it

---

## 7. Blockers

- no new blocker discovered
- the blocker remains route-specific: the current integrated TypeScript SDK path does not provide the required discovery/history/approval surfaces

---

## 8. Next Smallest Suggestion

- If continuing, the smallest truthful next step is not UI work. It is a narrowly scoped feasibility slice:
  - inspect whether a thin OpenCodian-side adapter/proxy could consume Codex app-server for history/approval discovery without destabilizing the current TS SDK route

- Do **not** relabel richer history/approval gaps as “officially blocked” unless the official app-server surface itself disappears or contradicts this audit later

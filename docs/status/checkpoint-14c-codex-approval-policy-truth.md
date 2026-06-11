# Checkpoint 14C: Codex Approval-Policy Truth Split

> **Date**: 2026-06-10
> **Auditor**: main orchestrator session
> **Worktree**: `codex-sdk-capability`
> **Branch**: `feature/codex-sdk-capability`
> **Scope**: Clarify the truthful boundary for Codex `approvalPolicy` / interactive approvals

---

## 1. Executive Summary

This checkpoint does **not** implement a new approval UI. It tightens the truth statement for approvals:

- **Official Codex overall** does expose approval-related surfaces
  - CLI / config docs expose `approval_policy`
  - app-server docs expose richer rich-client approval/history/auth/event surfaces
- **Current OpenCodian TypeScript SDK route** still cannot productize approval UI honestly
  - the current adapter path does not expose the bidirectional approval channel needed for a stable user-facing approval surface here

So the honest current conclusion is:

- **`approvalPolicy` on the current TypeScript SDK integration path**: `blocked`
- **official richer approval surfaces beyond this route**: `未接入`

---

## 2. Files Changed

### Status docs

| File | Action | Description |
|------|--------|-------------|
| `docs/status/codex-sdk-current-state-2026-06-09.md` | Updated | Moved approval-policy out of the broad `未接入` bucket for the current SDK route and clarified that the blocker is route-specific, not an official Codex-wide absence |
| `docs/status/checkpoint-14c-codex-approval-policy-truth.md` | Created | This document |

### Product code

None.

### Tests

None.

---

## 3. Truth Clarification

### 3.1 What official Codex overall supports

For this checkpoint, reviewer used current official OpenAI Codex documentation as the baseline:

- The approvals/security docs expose `approval_policy` as a real Codex concept on CLI / config surfaces
- The app-server docs describe a richer rich-client surface including approvals, history, authentication, and streamed events

That means the sentence:

> \"official Codex does not support approvals\"

would be false.

### 3.2 What is blocked in this plugin today

The blocker is narrower:

- OpenCodian's current Codex integration path uses the TypeScript SDK thread route
- On that route, the plugin still lacks the bidirectional approval event channel needed to present and resolve approvals honestly inside ordinary chat/settings product surfaces
- Current repo truth still supports the long-standing technical explanation:
  - no usable approval event stream through `ThreadItem` / `ThreadEvent`
  - no stable productized bridge comparable to the existing OpenCode / Claude Code approval paths

So the right wording is:

- **blocked on the current TypeScript SDK integration path**
- **not blocked on official Codex overall**

### 3.3 What remains merely not integrated

The richer official approval/history route is still not integrated here:

- Codex app-server approval/history/auth surfaces
- any future plugin route that would choose that app-server path

Those are not the same statement as:

- `approvalPolicy` is ready for the current SDK adapter route

They remain separate.

---

## 4. Verification

This was a docs-only truth-sync checkpoint.

### Product code changed

- **No**

### Verification scope

- repo inspection of current Codex adapter/state docs
- grep-based confirmation of existing approval-policy wording and its placement in truth buckets
- reviewer-confirmed official Codex baseline:
  - approvals/security docs expose `approval_policy`
  - app-server docs expose richer approval/history/client surfaces

### Build / deploy

- not required because no product code changed

---

## 5. Honest Truth Buckets

### Current TypeScript SDK route

- **`approvalPolicy`**: `blocked`
  - blocked on the currently integrated SDK route inside this plugin
  - not promoted to pass
  - no approval UI implemented

### Broader official Codex surface beyond this route

- **app-server approval/history integration**: `未接入`
  - official richer surface exists
  - this plugin does not integrate it

---

## 6. Blockers

- The blocker is specifically the current TypeScript SDK integration path's missing bidirectional approval channel for plugin productization

---

## 7. Next Smallest Suggestion

- Keep approval-policy as a truth-split/documentation result unless the next batch explicitly chooses one of these two routes:
  - investigate whether the current SDK surface has changed enough to support a real approval event bridge
  - audit / prototype Codex app-server as the richer approval/history integration path

- Do **not** ship a faux approval UI on the current route without real event and resolution proof

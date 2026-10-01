# CodexDefaultApprovalHost

> **源码**: `src/core/agents/backend/CodexDefaultApprovalHost.ts`
> **状态**: [REVIEW]
> **Updated**: 2026-09-30 — 扩展至 Codex 0.159.0 v2 审批：`CodexApprovalKind` 增加 `commandExecution`/`fileChange`/`permissions`，approval question card 增加 execpolicy/network amendment 选项；context 新增 `questionCardRenderer`（`item/tool/requestUserInput`）与 `elicitationCardRenderer`（`mcpServer/elicitation/request`，类型来自 `CodexElicitationBridge.ts`）。

## 概述

Default host implementation for the Codex server-request approval bridge. Connects `CodexAdapter`'s approval bridge to OpenCodian's existing question / inline-card UI infrastructure when the chat view is active. Mirrors `ClaudeCodeDefaultPermissionHost.ts` but for the Codex async server-push approval model.

## 职责

- Provides `CodexApprovalHostContext` — a mutable context object owned by the plugin, with `getActiveTabId` and optional `approvalCardRenderer` / `questionCardRenderer` / `elicitationCardRenderer`; one context object serves the approval bridge, the tool-user-input seam, and the MCP elicitation bridge
- `createCodexApprovalBridgeHost(getContext)` — factory that returns a `CodexApprovalBridgeHost`; reads the context dynamically on every call so a renderer added or removed at runtime is immediately effective; implements both `collectApproval` and `collectQuestionAnswers`
- `buildCodexApprovalQuestionRequest(request)` — translates a backend-neutral `CodexApprovalRequest` into a `QuestionRequest`: the base trio (Approve / Approve for session / Deny) always renders; `proposedExecpolicyAmendment` adds "Approve and adopt suggested rules"; each `proposedNetworkPolicyAmendments` entry adds an "Apply network rule: {action} {host}" option; permissions approvals describe the requested profile
- `mapCodexApprovalResolution(result, request?)` — maps the question resolution result back to a `CodexApprovalDecision`; rejected → denied, cancelled → null (bridge defaults to denied), recognized labels → matching decision, amendment options matched structurally against the originating request so a stale/forge label can never fabricate an amendment
- `CodexQuestionCardRenderer` — the `item/tool/requestUserInput` seam: receives a ready `QuestionRequest` and returns the raw resolution result
- Returns null when no renderer is available (graceful degradation to denied)

## 维护约束

- Does not render UI directly; relies on the view populating the renderers via `installCodexApprovalHostContext()` on mount
- Host context is provided by the plugin instance and updated by the chat view at runtime
- When no UI context is available (background tasks, reload), returns null and the adapter bridge defaults to a safe `denied` decision
- Uses `applyResolution: false` when calling `showQuestionDialog` so the question runtime does not attempt to reply to a backend question — it only collects the user's choice
- Option labels are hardcoded English strings shared by the builder and the mapper (single source within this file); a label change must update both constants together
- `CodexApprovalResolutionResult` 的 canonical 定义在 `CodexAdapter.ts`（此处 re-export），避免 adapter ↔ host 双向往来类型漂移

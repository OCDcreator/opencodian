# CodexDefaultApprovalHost

> **源码**: `src/core/agents/backend/CodexDefaultApprovalHost.ts`
> **状态**: [REVIEW]

## 概述

Default host implementation for the Codex server-request approval bridge. Connects `CodexAdapter`'s approval bridge to OpenCodian's existing question / inline-card UI infrastructure when the chat view is active. Mirrors `ClaudeCodeDefaultPermissionHost.ts` but for the Codex async server-push approval model.

## 职责

- Provides `CodexApprovalHostContext` — a mutable context object owned by the plugin, with `getActiveTabId` and an optional `approvalCardRenderer`
- `createCodexApprovalBridgeHost(getContext)` — factory that returns a `CodexApprovalBridgeHost`; reads the context dynamically on every call so a renderer added or removed at runtime is immediately effective
- `buildCodexApprovalQuestionRequest(request)` — translates a backend-neutral `CodexApprovalRequest` into a `QuestionRequest` with three options (Approve / Approve for session / Deny), so the existing `showQuestionDialog` inline-card UI can present it
- `mapCodexApprovalResolution(result)` — maps the question resolution result back to a `CodexApprovalDecision`; rejected → denied, cancelled → null (bridge defaults to denied), answered → matches the selected option label
- Returns null when no renderer is available (graceful degradation to denied)

## 维护约束

- Does not render UI directly; relies on the view populating `approvalCardRenderer` via `installCodexApprovalHostContext()` on mount
- Host context is provided by the plugin instance and updated by the chat view at runtime
- When no UI context is available (background tasks, reload), returns null and the adapter bridge defaults to a safe `denied` decision
- Uses `applyResolution: false` when calling `showQuestionDialog` so the question runtime does not attempt to reply to a backend question — it only collects the user's choice

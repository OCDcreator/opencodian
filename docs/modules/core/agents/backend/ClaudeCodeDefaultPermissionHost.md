# ClaudeCodeDefaultPermissionHost

> **源码**: `src/core/agents/backend/ClaudeCodeDefaultPermissionHost.ts`
> **状态**: [REVIEW]

## 概述

Default host implementation for ClaudeCodePermissionBridge. Connects the bridge to OpenCodian's existing permission and question inline card renderers when the chat view is active. When no UI context is available, returns null and the bridge denies gracefully.

## 职责

- Provides `collectToolApproval` host callback that delegates to `PermissionInlineCardRenderer.collectResponse`
- Provides `collectQuestionAnswers` host callback that delegates to the current chat question renderer/flow
- Maps card results ('once', 'always', 'session', 'reject') to matching `PermissionReply` values; unlike the OpenCode inline responder, Claude `session` approvals stay session-scoped and are not widened to `always`
- Returns null when no renderer is available (graceful degradation)

## 维护约束

- Does not render UI directly; relies on injected card renderers.
- Host context is provided by the plugin instance and updated by the chat view at runtime.
- When no UI context is available (background tasks, reload), returns null and the bridge denies the request.

# BackendSessionBrowserModal

> **源码**: `src/features/chat/ui/BackendSessionBrowserModal.ts`
> **最近更新**: 2026-06-06 (preview transcript seeding into resumed conversations)

## 概述

Obsidian Modal，用于浏览和恢复后端 sessions。复用 `AgentBackendRouting` 的 `listBackendSessions()` 和 `getBackendSessionPreview()` 实现会话列表和 transcript 预览。

## 职责

- 调用 `listBackendSessions()` 列出当前 active backend 的 sessions
- 用户选中 session 后调用 `getBackendSessionPreview()` 加载 transcript 预览
- 点击 "Resume in chat" 后通过 host 创建 conversation 并加载

## Host 接口

`BackendSessionBrowserHost`:
- `getAgentServiceRegistry()` — 获取 registry 传给 `listBackendSessions()`
- `createConversationFromBackendSession(sessionId, title)` — 创建新 conversation 并返回 conversationId
- `loadConversation(conversationId)` — 加载 conversation 到聊天视图
- `getActiveBackendKind()` — 当前 backend 类型
- `showNotice(message)` — 显示 Obsidian Notice
- `isStreaming()` — 是否正在流式传输

## 集成

- `ConversationHistoryActionsCoordinator`: history dropdown footer 中 "Browse backend sessions" 按钮
- `OpenCodianView`: 实现 `BackendSessionBrowserHost`，创建 conversation 使用 `plugin.createConversationFromSession()`

## 恢复流程

1. Modal 列出 backend sessions
2. 用户选中一个 → 加载 preview
3. 点击 Resume → `host.createConversationFromBackendSession()` → `plugin.createConversationFromSession(sessionId, { title, backend })` → 设置 `backendSessionId`
4. `host.loadConversation(conversationId)` → 加载到当前视图
5. 用户发送消息时，`ClaudeCodeAdapter.getOrRestoreSession()` 检测到非 local session ID → 设置 `sdkSessionId` + `resumeValidationRequired: true`
6. `buildSdkOptions()` 传入 `resumeSessionId: session.sdkSessionId` → SDK 恢复该 session

## 维护约束

- 不直接使用 SDK；所有 session 操作通过 `AgentBackendRouting` helper
- 不提供 `continue` / `resumeSessionAt` / `forkSession` 操作
- Preview 只读，不修改 session 状态

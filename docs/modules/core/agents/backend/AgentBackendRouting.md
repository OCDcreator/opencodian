# AgentBackendRouting

> **源码**: `src/core/agents/backend/AgentBackendRouting.ts`
> **状态**: [REVIEW]

## 概述

`AgentBackendRouting.ts` 是 backend registry 的窄路由 helper。它把 conversation 的 `backend` 字段解析为实际 adapter，并用 capability narrowing 返回 chat/session 能力，避免 `main.ts`、`OpenCodianView` 和发送管线继续直接假设所有会话都归 OpenCode 所有。

## 职责

- 将缺失 `conversation.backend` 的历史会话视为 `opencode`
- 从 `AgentServiceRegistry` 解析 conversation-owned backend adapter
- 提供 `hasChatCapability()` / `hasSessionCapability()` 类型收窄
- 提供 active session backend 与 conversation session/chat backend helper
- 提供 `getConversationSessionHistoryService()` 用于 session 消息读取路由，仅返回同时实现了 `getSessionMessages()` 的 session backend
- 提供 `getActiveSessionHistoryService()` 用于 active backend 的 session 消息读取路由，供无 conversation context 的消费方（如 settings inspection surface）使用
- 提供 `readBackendSessionTitle()` 用于 backend-aware session 标题读取路由，通过 `getSession(sessionId)` 获取 session 详情并按已 productize 的 backend kind 提取标题字段（OpenCode: `.title`，Claude Code: `.summary`）；未来 backend 在明确字段语义前返回 `null`
- 提供 `readBackendSessionShareUrl()` 用于 backend-aware session 分享链接读取路由，通过 `getSession(sessionId)` 获取 session 详情并按已 productize 的 backend kind 提取分享 URL（OpenCode: `session.share.url`；Claude Code 及其他 backend 目前无分享概念，返回 `null`）。这是一个**窄的 backend-aware session-detail read seam**，仅用于分享链接读取，不作为 generic stable cross-backend session-detail object contract
- 提供 `listBackendSessions()` 用于 active backend 的 session 列表路由，调用 `listSessions()` 并将原始结果归一化为 `NormalizedSessionRow[]`（`id`/`title`/`shareUrl`/`updatedAt`），使 settings inspection surface 不再直接依赖 OpenCode `Session` 类型
- 提供 `getBackendSessionPreview()` 用于 active backend 的 session 消息预览路由，调用 `getSessionMessages()` 并将原始结果归一化为 `NormalizedSessionPreviewMessage[]`（`role`/`parts[]`），使 settings 预览不再假设 OpenCode `{info, parts}` 消息形状；当 backend 不支持该读取时返回 `null`，当 backend 支持但没有消息时返回空数组
- 提供 `NormalizedSessionRow`、`NormalizedSessionPreviewMessage`、`NormalizedSessionPreviewPart` 轻量类型，仅供 inspection surface 消费，不作为 stable cross-backend session contract

## 维护约束

- 这里只做 registry lookup 和 capability narrowing，不做 fallback 业务逻辑。
- 不在这里启用或注册 backend；可见 backend 仍由 `IMPLEMENTED_AGENT_BACKENDS` 和 settings normalization 控制。
- 新增 backend capability 路由时优先扩展此 helper，避免在 UI owner 中散落 `as AgentXCapability` 类型断言。

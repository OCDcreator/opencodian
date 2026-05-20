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

## 维护约束

- 这里只做 registry lookup 和 capability narrowing，不做 fallback 业务逻辑。
- 不在这里启用或注册 backend；可见 backend 仍由 `IMPLEMENTED_AGENT_BACKENDS` 和 settings normalization 控制。
- 新增 backend capability 路由时优先扩展此 helper，避免在 UI owner 中散落 `as AgentXCapability` 类型断言。

# AgentService

> **源码**: `src/core/agents/backend/AgentService.ts`
> **状态**: [REVIEW]

## 概述

`AgentService.ts` 定义多代理 backend 抽象层的核心服务契约。它把 OpenCode、Claude Code、Codex、Copilot、Pi 等后端统一成最小生命周期与能力查询接口，并把高级功能拆成可选 capability interface。

## 职责

- 暴露 `AgentService`，定义 backend kind、显示信息、连接状态、能力集合、生命周期和状态订阅契约
- 定义 `AgentConnectionStatus`、`AgentServiceInfo`、`Disposable`、`StatusChangeHandler` 等共享类型
- 暴露 chat、session、branching、todo、question、permission、model、MCP、config、tools、auth 等可选 capability interface
- 约束调用方先通过 `hasCapability()` / capability 集合判断，再按具体能力接口访问扩展方法

## 主要类型

- `AgentChatSendRequest`: backend-neutral 发送请求，当前包含 `sessionId`、`content` 和保持本地语义的 `options`，不直接泄漏 OpenCode 或 Claude SDK 形状。
- `AgentChatCapability`: 发送消息并取消指定 session stream 的最小 chat runtime 能力。
- `AgentSessionCapability`: 创建、删除、重命名 backend-owned session 的最小会话生命周期能力；可选 `listSessions()` / `getSession()` 允许 adapter 暴露 backend 原生 session directory，而不强制所有 backend 在 Phase 0 一次性实现完整 history UI。

## 依赖

- `src/core/types/chat.ts`：提供 `AgentBackendKind` 与 `SessionDiffEntry`
- `src/core/agents/AgentCapability.ts`：提供能力标识与 `BackendCapabilities`

## 维护约束

- 这是 backend adapter 的公共边界；新增能力时优先新增可选 capability interface，而不是扩大所有 backend 必须实现的 `AgentService`
- 接口里无法稳定类型化的后端特有 payload 暂以 `unknown` 承载，落地具体 UI/服务前再收窄类型
- chat/session contract 是 Phase 0 OpenCode regression seam；新增 backend 必须先实现这些窄接口，再由 chat runtime 做 capability narrowing。
- `listSessions()` / `getSession()` 返回值保持 `unknown` 是刻意的：不同 backend 的 session metadata 不同，调用方必须在具体 backend/capability 已确认后再解释 payload。
- 调整方法签名时需要同步 adapter、registry、功能门控测试以及 multi-agent foundation 规格文档

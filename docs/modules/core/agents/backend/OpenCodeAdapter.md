# OpenCodeAdapter

> **源码**: `src/core/agents/backend/OpenCodeAdapter.ts`
> **状态**: [REVIEW]

## 概述

`OpenCodeAdapter.ts` 将现有 `OpenCodeService` 包装成 `AgentService`。它是多代理 backend 抽象的首个 adapter，也是后续 backend 接入时的参考实现；当前不改写 OpenCode 运行时，只做能力声明、状态映射与方法委托。

## 职责

- 暴露 `OpenCodeAdapter` 类，并声明 backend kind 为 `opencode`
- 将 `OpenCodeService.getServerStatus()` 映射为通用 `AgentConnectionStatus`
- 声明 `OPENCODE_FULL_CAPABILITIES`，让 OpenCode 在 Phase 0 支持完整 capability 集合
- 实现所有可选 capability interface，并把 chat、session、todo、question、permission、model、MCP、config、tool、auth 调用委托给 `OpenCodeService`
- 通过 `AgentChatCapability.sendMessage()` 将 backend-neutral `{ sessionId, content, options }` 映射为既有 `OpenCodeService.sendMessage(content, { ...options, sessionId })`
- 通过 `AgentSessionCapability` 委托 `createSession()`、`deleteSession()`、`updateSessionTitle()`，并以 `listSessions()` / `getSession()` 保留 OpenCode session directory 访问能力；`cancelStream(sessionId)` 保持现有取消流行为
- 提供 adapter 级 `onStatusChange()` 订阅与 `notifyStatusChange()` 通知入口
- 保留 `underlying` 过渡访问口，供尚未迁移到统一接口的 OpenCode 专有调用路径复用

## 依赖

- `src/core/opencode/OpenCodeService.ts`：实际 OpenCode runtime 与 API facade
- `src/core/agents/AgentCapability.ts`：OpenCode 完整能力集合
- `src/core/agents/backend/AgentService.ts`：核心服务接口和可选 capability interface
- `src/core/types/chat.ts`：backend kind 类型

## 维护约束

- 不要在 adapter 内复制 OpenCode 业务状态；运行时真相仍属于 `OpenCodeService` 及其既有 owner
- `dispose()` 只清理 adapter 自身订阅，底层 `OpenCodeService` 由插件生命周期单独释放
- 新增 OpenCode 能力时需要同时更新 `AgentService.ts` capability interface、`OPENCODE_FULL_CAPABILITIES` 和本 adapter 的委托方法
- 保持 `underlying` 作为过渡访问口，避免在 Phase 0 一次性重写所有 OpenCode 特有调用路径
- adapter 只做形状转换和委托，不改变 OpenCode session id、stream chunk 或历史同步语义

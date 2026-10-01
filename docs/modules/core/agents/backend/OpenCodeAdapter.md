# OpenCodeAdapter

> 2026-09-30 (B5 other-backends-audit): 能力集从 `OPENCODE_FULL_CAPABILITIES` 改为 `OPENCODE_LEGACY_CAPABILITIES`（完整集合显式排除 `TurnSteering`）。legacy HTTP/SSE 适配器没有原生 mid-turn steer 接缝——mid-turn 输入经正常发送队列串行化——若声明 turn-steering，queued-follow-up 栏会渲染一个只能在点击时报 `steerUnavailable` 的 steer 按钮。真正的 steerTurn()（delivery 'steer'）归 `OpenCode2Adapter`。未来若此适配器接入原生 steer 接缝，必须在同一变更里同时新增 steerTurn() 并移除本过滤；`tests/unit/core/agents/backend/BackendCapabilitySets.test.ts` 锁定了该显式集合。

> **源码**: `src/core/agents/backend/OpenCodeAdapter.ts`
> **状态**: [REVIEW]

## 概述

`OpenCodeAdapter.ts` 将现有 `OpenCodeService` 包装成 `AgentService`。它是多代理 backend 抽象的首个 adapter，也是后续 backend 接入时的参考实现；当前不改写 OpenCode 运行时，只做能力声明、状态映射与方法委托。

## 职责

- 暴露 `OpenCodeAdapter` 类，并声明 backend kind 为 `opencode`
- 将 `OpenCodeService.getServerStatus()` 映射为通用 `AgentConnectionStatus`
- 声明 `OPENCODE_LEGACY_CAPABILITIES`（= `OPENCODE_FULL_CAPABILITIES` 显式排除 `TurnSteering`），让 OpenCode 在 Phase 0 支持完整 capability 集合，同时不把无原生接缝的 mid-turn steer 冒充为可用能力
- 实现所有可选 capability interface，并把 chat、session、todo、question、permission、model、MCP、config、tool、auth 调用委托给 `OpenCodeService`
- 通过 `AgentChatCapability.sendMessage()` 将 backend-neutral `{ sessionId, content, options }` 映射为既有 `OpenCodeService.sendMessage(content, { ...options, sessionId })`
- 通过 `AgentSessionCapability` 委托 `createSession()`、`deleteSession()`、`updateSessionTitle()`，并以 `listSessions()` / `getSession()` / `getSessionMessages()` 保留 OpenCode session directory 与消息历史访问能力；`cancelStream(sessionId)` 保持现有取消流行为；`getSession()` 使用底层 `OpenCodeService.getSessionInfo()` 进行单次 SDK `session.get()` 调用而非 O(n) 的 `listSessions()` + 客户端过滤
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
- 新增 OpenCode 能力时需要同时更新 `AgentService.ts` capability interface、`OPENCODE_FULL_CAPABILITIES` 和本 adapter 的委托方法；`TurnSteering` 例外——它对本 adapter 保持显式排除，只有同时落地原生 steerTurn() 时才能移除该排除
- 保持 `underlying` 作为过渡访问口，避免在 Phase 0 一次性重写所有 OpenCode 特有调用路径
- adapter 只做形状转换和委托，不改变 OpenCode session id、stream chunk 或历史同步语义
- 2026-09-08：移除 deprecated `respondToSessionPermission` adapter 透传；保留 `respondToPermission` 作为唯一权限回应能力。

- 2026-09-13: sendMessage 把 options.memoryInjection 翻译为 synthetic text part（kind: memory-injection），经 OpenCodePromptRequestBuilder 进入请求部件（记忆注入接缝 D-O2）。

- 2026-09-15: 实现 `AgentAuxQueryCapability.startAuxQuerySession()`：在独立的隔离 opencode 实例上建立只读会话，scope 的配置与私有会话目录都不落在 vault 或用户配置目录。实现见 `auxiliary/OpenCodeAuxScope.ts` 与 `auxiliary/OpenCodeAuxQuerySession.ts`。

- 2026-09-18 (FlowText R-B4): Obsidian 原生工具注入接缝接入——sendMessage 现在把 options.obsidianToolingInjection 也翻译为合成 text part（kind: obsidian-tooling-injection），与记忆注入并列，经同一选项袋接缝进入请求部件。

> 2026-09-18 (R-C3)：实现 `AgentInlineCompletionCapability`——`startInlineCompletionSession()` 在同一个共享隔离 scope 内建会话（scope 进程级复用，native 会话由包装层按 reset 语义重建），经 `WarmInlineCompletionSession` 包装；implements 子句新增 `AgentInlineCompletionCapability`。

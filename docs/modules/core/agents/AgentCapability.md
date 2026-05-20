# AgentCapability

> **源码**: `src/core/agents/AgentCapability.ts`
> **状态**: [REVIEW]

## 概述

`AgentCapability.ts` 定义 backend-aware UI 使用的能力标识符与能力集合类型。Phase 0 仍只有 OpenCode runtime，因此当前 active backend 永远返回完整能力集。

## 职责

- 暴露 `AgentCapability` 常量对象，集中列出 chat、sessions、tools、MCP、permissions、branching、questions、models、subagents 等能力标识
- 定义 `BackendCapabilities` 作为只读能力集合
- 暴露 `OPENCODE_FULL_CAPABILITIES`，表示 OpenCode 在 Phase 0 支持全部能力
- 暴露 `getActiveBackendCapabilities()` 和 `hasCapability()`，供 UI 以 capability 而不是 backend 名称做条件渲染

## 维护约束

- Phase 0 不在此处接入真实 backend registry；`getActiveBackendCapabilities()` 的 registry lookup 留给后续阶段
- 新增能力时需要同步更新相关 UI 条件、adapter 声明、测试和 multi-agent foundation 规格里的 capability mapping
- `chat` / `sessions` 是 Phase 0/1 backend 抽象的基础 runtime 能力；OpenCode 继续通过 `OPENCODE_FULL_CAPABILITIES` 声明支持，Claude 等新 backend 必须显式实现对应 capability interface 后才能接入发送和会话生命周期路径

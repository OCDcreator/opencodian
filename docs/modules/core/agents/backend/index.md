# backend/index

> **源码**: `src/core/agents/backend/index.ts`
> **状态**: [REVIEW]

## 概述

`backend/index.ts` 是 agent backend 抽象层的 barrel 入口。它集中导出 `AgentService` 契约、OpenCode adapter 和 registry，供上层 runtime 与 UI 通过一个稳定路径接入多代理 backend 能力。

## 职责

- 重新导出 `AgentService.ts` 中的核心接口、状态类型、共享 disposable 类型和可选 capability interface
- 导出 `OpenCodeAdapter` 作为当前 OpenCode backend 的 adapter 实现
- 导出 `AgentServiceRegistry` 作为 adapter 注册与 active backend 解析 owner

## 依赖

- `src/core/agents/backend/AgentService.ts`：核心类型导出面
- `src/core/agents/backend/OpenCodeAdapter.ts`：OpenCode adapter 实现
- `src/core/agents/backend/AgentServiceRegistry.ts`：backend registry 实现

## 维护约束

- 只聚合 backend 抽象层的公共导出，不在 barrel 中加入运行时逻辑
- 新增 backend adapter 或共享类型时，只有需要成为跨目录公共 API 的符号才从这里导出
- 保持 type-only 导出与 value 导出分离，避免 barrel 引入不必要的运行时依赖

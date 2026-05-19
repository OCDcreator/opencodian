# AgentServiceRegistry

> **源码**: `src/core/agents/backend/AgentServiceRegistry.ts`
> **状态**: [REVIEW]

## 概述

`AgentServiceRegistry.ts` 管理可用 agent backend adapter，并解析当前 active backend。它是多代理抽象层的集中注册点，负责区分“已注册”“已启用”和“当前激活”的 backend 状态。

## 职责

- 暴露 `AgentServiceRegistry` 类，用于注册、替换、注销和释放 `AgentService` adapter
- 维护 enabled backend 集合，并在启用、禁用或批量设置时解析 active backend
- 提供 `getActive()`、`getActiveKind()`、`get()`、`listEnabled()`、`listAll()`、`isEnabled()` 等查询入口
- 通过 `onActiveChange()` 通知 active backend 切换
- 默认优先选择已启用的 `opencode`，否则选择第一个已启用 backend

## 依赖

- `src/core/types/chat.ts`：backend kind 类型
- `src/core/agents/backend/AgentService.ts`：adapter、info、disposable 和状态处理类型
- `src/shared/logger.ts`（经 `src/shared/index.ts`）：注册表日志

## 维护约束

- Registry 只拥有 backend adapter 的注册/启用/active 选择，不应承载具体 backend 的业务状态
- 替换、注销和整体释放 adapter 时必须保持 dispose 幂等容错，避免一个 adapter 清理失败阻断其他 backend
- 修改 active 选择策略时需要同步 UI 的 backend 切换预期、功能门控测试和相关规格文档

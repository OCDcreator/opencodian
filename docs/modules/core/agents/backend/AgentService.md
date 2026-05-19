# AgentService

> **源码**: `src/core/agents/backend/AgentService.ts`
> **状态**: [REVIEW]

## 概述

`AgentService.ts` 定义多代理 backend 抽象层的核心服务契约。它把 OpenCode、Claude Code、Codex、Copilot、Pi 等后端统一成最小生命周期与能力查询接口，并把高级功能拆成可选 capability interface。

## 职责

- 暴露 `AgentService`，定义 backend kind、显示信息、连接状态、能力集合、生命周期和状态订阅契约
- 定义 `AgentConnectionStatus`、`AgentServiceInfo`、`Disposable`、`StatusChangeHandler` 等共享类型
- 暴露 branching、todo、question、permission、model、MCP、config、tools、auth 等可选 capability interface
- 约束调用方先通过 `hasCapability()` / capability 集合判断，再按具体能力接口访问扩展方法

## 依赖

- `src/core/types/chat.ts`：提供 `AgentBackendKind` 与 `SessionDiffEntry`
- `src/core/agents/AgentCapability.ts`：提供能力标识与 `BackendCapabilities`

## 维护约束

- 这是 backend adapter 的公共边界；新增能力时优先新增可选 capability interface，而不是扩大所有 backend 必须实现的 `AgentService`
- 接口里无法稳定类型化的后端特有 payload 暂以 `unknown` 承载，落地具体 UI/服务前再收窄类型
- 调整方法签名时需要同步 adapter、registry、功能门控测试以及 multi-agent foundation 规格文档

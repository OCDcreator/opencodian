# AcpClientManager

> **源码**: `src/core/acp/AcpClientManager.ts`
> **状态**: [REVIEW]

## 概述

`AcpClientManager` 是 ACP agent 进程生命周期 owner。它加载设置中的 agent 配置，按 agent id 维护连接状态、子进程句柄和当前活动 session id，并提供 connect / disconnect / dispose 的统一入口。

## 关键导出

- `AcpClientManager`: 管理 ACP agent 配置列表和本地子进程生命周期的 class。

## 核心逻辑

### 配置同步

- `loadConfigs()` 将传入的 `AcpAgentConfig[]` 同步到内部 registry。
- 已存在的 agent 会保留运行时槽位并更新 config；已删除的 agent 会先 disconnect 再移出 registry。
- `listAgents()` 返回当前 registry 中的配置快照。

### 连接状态

- `connect()` 使用 `node:child_process.spawn()` 启动配置中的 command / args / cwd / env。
- 连接中和已连接状态会直接复用，不重复启动进程。
- 进程 `error` 会把 agent 标记为 `error`，进程 `exit` 会清空 process 并回到 `disconnected`。

### 运行时访问

- `getState()` 返回 agent 当前连接状态，未知 agent 默认为 `disconnected`。
- `getProcess()` 暴露子进程句柄给后续 transport 层接入 stdin / stdout。
- `setActiveSessionId()` 记录当前 ACP session id，disconnect 时清空。
- `dispose()` 断开所有 agent 并清空 registry。

## 依赖

- `node:child_process`: 启动和管理 ACP agent 子进程。
- `src/shared`: 提供 `createLogger()`。
- `src/core/acp/types.ts`: 提供 `AcpAgentConfig` 和 `AcpConnectionState`。

## 注意事项

- 该模块只负责进程生命周期，不解析 ACP 协议消息。
- `disconnect()` 对未知 agent 是 no-op，便于配置删除和 dispose 重入。
- 子进程环境会合并 `process.env` 与 agent-local `env`，避免遗漏宿主环境变量。

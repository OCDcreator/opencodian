# ACP Types

> **源码**: `src/core/acp/types.ts`
> **状态**: [REVIEW]

## 概述

`src/core/acp/types.ts` 定义 ACP 集成的共享类型契约。它覆盖 agent 配置、运行时状态、prompt options、tool call/update、usage 和 permission request 等结构，供 ACP 进程管理和 transport 翻译层复用。

## 关键导出

- `AcpConnectionState`: ACP agent 的连接状态枚举 union。
- `AcpAgentConfig`: 设置中持久化的 ACP agent 启动配置。
- `AcpAgentRuntime`: agent 配置、状态、进程句柄和 active session 的运行时视图。
- `AcpPromptOptions`: ACP prompt 发送时的 agent、session 和 cwd options。
- `AcpToolCall`: ACP tool call payload。
- `AcpToolCallUpdate`: ACP tool call 进度 / 完成 / 错误更新 payload。
- `AcpUsageUpdate`: ACP token usage payload。
- `AcpPermissionRequest`: ACP permission request payload。

## 核心逻辑

### 配置模型

- `AcpAgentConfig` 保存 agent id、显示名、启动命令、参数、环境变量、enabled 状态和可选 cwd。
- `AcpAgentRuntime` 在配置基础上增加 runtime-only 的连接状态、process 和 active session。

### 消息模型

- `AcpPromptOptions` 标识消息应发送到哪个 agent，以及可选的既有 session 和工作目录。
- `AcpToolCall` / `AcpToolCallUpdate` 描述工具调用和调用结果更新。
- `AcpUsageUpdate` 和 `AcpPermissionRequest` 对应聊天流里的 usage 与 permission_request 信号。

## 依赖

- 无运行时依赖；该文件只导出 TypeScript 类型。

## 注意事项

- `process` 在 `AcpAgentRuntime` 中保持为 `unknown | null`，避免共享类型直接绑定 Node 子进程实现。
- `AcpConnectionState` 的状态值需要与 `AcpClientManager` 的状态迁移保持一致。

# CodexAppServerClientNormalization

> **源码**: `src/core/agents/backend/CodexAppServerClientNormalization.ts`
> **状态**: [RUNTIME_ADJUNCT]

## 概述

从 `CodexAppServerClient` 拆出的纯函数模块，把 app-server 原始 thread/turn/item 数据归一化为 `AgentBackendRouting` 可消费的 preview-message 形状。`CodexAppServerClient` 保留向后兼容的静态 delegate（`normalizeThreadList` / `normalizeTurnsToPreviewMessages`）转发到这里的独立函数。

## 职责

- `normalizeThreadList(threads)`: 把 app-server threads 归一化为 `listBackendSessions` 期望的形状（保留 `archived` 布尔字段）
- `normalizeTurnsToPreviewMessages(turns)`: 把 app-server turns 归一化为 `getBackendSessionPreview` 期望的 preview messages
- 内部 helper `extractItemMessages` / `normalizeUserMessageItem` / `normalizeActivityItem`: 从单个 turn item 提取可预览内容；非文本 item（`reasoning`、`contextCompaction`）返回 `null`，activity item（`mcpToolCall`、`fileChange`、`webSearch`）产生 activity 消息

## 维护约束

- 纯函数模块，无类状态、无副作用
- `CodexAppServerClient` 的静态 delegate 仅转发到此模块，新增归一化逻辑应在此文件实现

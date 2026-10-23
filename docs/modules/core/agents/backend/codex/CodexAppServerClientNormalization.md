# CodexAppServerClientNormalization

> **源码**: `src/core/agents/backend/codex/CodexAppServerClientNormalization.ts`
> **状态**: [RUNTIME_ADJUNCT]

## 概述

从 `CodexAppServerClient` 拆出的纯函数模块，把 app-server 原始 thread/turn/item 数据归一化为 `AgentBackendRouting` 可消费的 preview-message 形状。`CodexAppServerClient` 保留向后兼容的静态 delegate（`normalizeThreadList` / `normalizeTurnsToPreviewMessages`）转发到这里的独立函数。

## 职责

- `normalizeThreadList(threads)`: 把 app-server threads 归一化为 `listBackendSessions` 期望的形状（保留 `archived` 布尔字段）
- `normalizeTurnsToPreviewMessages(turns)`: 把 app-server turns 归一化为 `getBackendSessionPreview` 期望的 preview messages
- `normalizeTurnsPageToPreviewMessages(page)`: 把 `thread/turns/list` 分页结果（通常 `itemsView: 'summary'`）归一化为 `AppServerPreviewMessagePage`（messages + `nextCursor`/`backwardsCursor`），供 paginated transcript seam 使用
- `normalizeThreadItemsPageToPreviewMessages(page)`: 把 `thread/items/list` 分页结果归一化为 `AppServerPreviewMessagePage`，每个 entry 的 item 走与 turn 内嵌 item 相同的提取逻辑；用于 per-turn full-items 扩展
- 内部 helper `extractItemMessages` / `normalizeUserMessageItem` / `normalizeActivityItem`: 从单个 turn item 提取可预览内容；非文本 item（`reasoning`、`contextCompaction`）返回 `null`，activity item（`mcpToolCall`、`fileChange`、`webSearch`）产生 activity 消息

## 维护约束

- 纯函数模块，无类状态、无副作用
- `CodexAppServerClient` 的静态 delegate 仅转发到此模块，新增归一化逻辑应在此文件实现
- 分页 normalizer 只包装现有 flat 提取逻辑并透传 cursor；不要引入与 flat 输出不一致的消息形状

## 2026-10-05 Codex 消息前分支与恢复

assistant 的原生 item ID 和 owning turn 同样保留在恢复 seed 中，不使用本地 assistant alias 替代原生身份。

userMessage 正文保留，真实 item.id→sourceMessageId、所属 turn.id→sourceTurnId；thread/items/list 使用 entry.turnId。缺失 ID 仍可展示正文，但没有可分支 identity；不以正文、数组下标或 rollout UUID 补造。

## 目录定位（2026-10-23）

- 源码位置：`src/core/agents/backend/codex/CodexAppServerClientNormalization.ts`。
- 原位置：`src/core/agents/backend/CodexAppServerClientNormalization.ts`；文件名、导出接口与业务职责保持不变。
- 随目录调整更新的依赖：`src/core/agents/backend/codex/CodexAppServerClientTypes.ts`。

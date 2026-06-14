# CodexStreamNormalizer

> **源码**: `src/core/agents/backend/CodexStreamNormalizer.ts`
> **状态**: [RUNTIME_PROVEN]
> **Updated**: 2026-06-09 Checkpoint 5C — visible `web_search` transcript lifecycle

## 概述

`CodexStreamNormalizer.ts` 是 Codex SDK stream 事件的兼容边界。它把 Codex SDK 的 typed `ThreadEvent` discriminated union 转换为 OpenCodian 的 `StreamChunk` 格式，供 `CodexAdapter` 的 `sendMessage` 消费。

## 职责

- 接收 8 种 `ThreadEvent`：`thread.started`、`turn.started`、`turn.completed`、`turn.failed`、`item.started`、`item.updated`、`item.completed`、`error`
- 将 `thread.started` 映射为仅设置内部 sessionId（不发出 chunk）
- 将 `turn.started` → `message_metadata`（per-turn messageId: `${threadId}::turn-${turnIndex}`）+ `message_start`
- `turnIndex` 在每次 `turn.started` 时递增，确保同一 thread 内不同 turn 有不同的 messageId
- 将 8 种 `ThreadItem` 映射到对应 StreamChunk：
  - `agent_message` → `text`（delta tracking via textLengths）
  - `reasoning` → `thinking`（delta tracking via thinkingLengths）
  - `command_execution` → `tool_use`/`tool_result`/`backend_event`
  - `file_change` → `file_edited` + `tool_use`/`tool_result`
  - `mcp_tool_call` → `tool_use`/`tool_result`/`backend_event`
  - `web_search` → `tool_use` / `backend_event(updated)` / `tool_result`
  - `todo_list` → `backend_event` (tool_progress diagnostic downgrade)
- 跟踪 per-item 文本/思考长度，在 `started` → `updated` 事件间只产出增量
- `turn.failed` 和 `ThreadErrorEvent` 映射为 `error` chunk
- `usage` 包含 `reasoning_output_tokens` 在 `outputTokens` 中
- `web_search` **不**映射为 `structured_output`：Checkpoint 5C 将其提升到普通可见工具生命周期，避免继续被 chat transcript 丢弃
- `todo_list` 仍保持 diagnostic-only `tool_progress` 降级，不跟随 `web_search` 一起提升

## 维护约束

- 仅使用 `import type` 引用 `@openai/codex-sdk`，不引入运行时依赖
- 不在这里触发 UI 交互、权限审批或持久化
- 新增 Codex stream 事件时先补 fixture 测试，再扩展转换逻辑
- `backend_event.source` 固定为 `'codex'`
- `web_search` 当前是唯一从 diagnostic downgrade 提升为普通可见工具块的先例；不要顺手把 `todo_list` 或其他诊断 item 一起产品化

# ClaudeCodeStreamNormalizer

> **源码**: `src/core/agents/backend/ClaudeCodeStreamNormalizer.ts`
> **状态**: [REVIEW]

## 概述

`ClaudeCodeStreamNormalizer.ts` 是 Claude Code Agent SDK 接入的 stream 兼容边界。它把 SDK `query()` 返回的宽松 message/event 形状转换成 OpenCodian 既有 `StreamChunk`，供 `ClaudeCodeAdapter` 复用；当前不 import 官方 SDK 包。

## 职责

- 接收 SDK-style `system`、`assistant`、`user`、`content_block_delta`、`result` message/event
- 将文本、thinking、tool use、tool result、usage、error 映射到现有 `StreamChunk`
- 将 SDK message 上的 `session_id` 写入 `message_metadata.sessionId`，供 adapter 和发送持久化链路捕获真实 Claude session identity
- 将 assistant-level SDK 错误（例如 `authentication_failed`）优先映射成 `error` chunk，避免把认证失败提示当普通 assistant 文本渲染
- 将 result-level `errors[]` 汇总为 error chunk 内容，保留 SDK 认证/运行时错误关键词
- 记录 message/content block 已输出长度，避免 partial assistant message 和 final assistant message 重复输出文本或 thinking
- 记录已输出 tool use/result id，避免 final message 重放同一工具事件
- 为 Claude tool chunk 写入 `toolMetadata.source = 'claude-code'`，并保留 session/tool id 供后续 UI 与 permission bridge 使用
- 复用通用 tool identity 规则识别 Claude built-in、MCP、question、plan、task 等工具 kind

## 维护约束

- 这是 SDK stream 形状的本地兼容边界；引入 `@anthropic-ai/claude-agent-sdk` 后再把输入类型收窄到官方类型。
- 不在这里触发权限审批或用户提问 UI；`canUseTool` 和 `AskUserQuestion` 的交互桥接属于 `ClaudeCodePermissionBridge`。
- 不在这里持久化 session/history；normalizer 只负责把 SDK `session_id` 作为 metadata 传下去，真正的 identity alias 与 conversation 保存属于 adapter / send pipeline。
- 新增 Claude 特有 stream 事件时先补 fixture 测试，再扩展转换逻辑。

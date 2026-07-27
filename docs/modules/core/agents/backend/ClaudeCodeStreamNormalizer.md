# ClaudeCodeStreamNormalizer

> **源码**: `src/core/agents/backend/ClaudeCodeStreamNormalizer.ts`
> **状态**: [REVIEW]

## 概述

`ClaudeCodeStreamNormalizer.ts` 是 Claude Code Agent SDK 接入的 stream 兼容边界。它把 SDK `query()` 返回的宽松 message/event 形状转换成 OpenCodian 既有 `StreamChunk`，供 `ClaudeCodeAdapter` 复用；当前不 import 官方 SDK 包。

## 职责

- 接收 SDK-style `system`、`assistant`、`user`、`content_block_delta`、`result` message/event
- 将文本、thinking、tool use、tool result、usage、error 映射到现有 `StreamChunk`
- 对终态 `result.total_usage`，除保留上下文 usage chunk 外，还生成 `billingUsage` 分类（input、raw output、reasoning、cache read/write）；它是成本估算的独立 request ledger，不能用 assistant message 的上下文累计数替代。非终态 usage 不生成 ledger，避免重复计费。
- 将 SDK message 上的 `session_id` 写入 `message_metadata.sessionId`，供 adapter 和发送持久化链路捕获真实 Claude session identity
- 遇到带 `uuid` 字段的 SDK `type: 'user'` message 时，通过 `appendUserMessageIdentityChunk()` 产出 `user_message_identity` chunk，把 Claude SDK user message identity 传给发送持久化链路
- 将 SDK `prompt_suggestion` 消息映射为 `StreamChunk { type: 'prompt_suggestion', suggestion, uuid, sessionId }`，供后结果回调通道使用
- 将 assistant-level SDK 错误（例如 `authentication_failed`）优先映射成 `error` chunk，避免把认证失败提示当普通 assistant 文本渲染
- 将 result-level `errors[]` 汇总为 error chunk 内容，保留 SDK 认证/运行时错误关键词
- 记录 message/content block 已输出长度，避免 partial assistant message 和 final assistant message 重复输出文本或 thinking
- 当一轮成功 `result` 未伴随任何可见 assistant text 时，将非空 `result.result` 作为唯一 text fallback；若 assistant text 已输出则不回放 result，并在每个 result 后重置这轮 fallback 状态，兼容持久 `query()` 的下一轮
- 记录已输出 tool use/result id，避免 final message 重放同一工具事件
- 为 Claude tool chunk 写入 `toolMetadata.source = 'claude-code'`，并保留 session/tool id 供后续 UI 与 permission bridge 使用
- 复用通用 tool identity 规则识别 Claude built-in、MCP、question、plan、task 等工具 kind
- 将 SDK `hook_started` / `hook_progress` / `hook_response`、`task_started` / `task_progress` / `task_notification` / `task_updated`、`tool_progress` 和 result `structured_output` 映射为 `backend_event` 诊断 chunk，供日志和后续实验 UI 使用
- 过滤 `user` 类型消息中的 `text` / `thinking` / `tool_use` 内容块，防止 hook 反馈或 synthetic user 文本泄漏到可见 assistant transcript；保留 `user` 消息中的 `tool_result` 块，因为工具结果仍需要正常路由
- 只把包含 input/output/reasoning token 计数字段的 usage 形状映射为主 `usage` chunk，避免把 subagent `usage.total_tokens` 误写进上下文用量
- 通过 `claudeCode` debug module 的 `stream` channel 记录 SDK message summary 与产出 chunk summary，覆盖 text、thinking、tool_use、tool_result、backend_event、usage、error、message_metadata、user_message_identity；日志跳过无 chunk 消息，并用 fingerprint 节流相同形状的高频 delta summary，只保留 type/subtype/session/message id、content length、metadata keys 和 counts，不记录文本全文、tool input 全文或 message metadata 的 model id

## 维护约束

- 这是 SDK stream 形状的本地兼容边界；引入 `@anthropic-ai/claude-agent-sdk` 后再把输入类型收窄到官方类型。
- normalizer 的摘要日志必须只使用 shared logger 的 `debug`/`info` 可选日志路径，继续受 `enableDebugLogging`、`claudeCode` module 和 `stream` channel 控制。
- 不在这里触发权限审批或用户提问 UI；`canUseTool` 和 `AskUserQuestion` 的交互桥接属于 `ClaudeCodePermissionBridge`。
- `backend_event` 当前是诊断事件，不直接渲染成用户 transcript；完整 hook/subagent/structured-output UI 需要单独的 runtime proof。
- 不在这里持久化 session/history；normalizer 只负责把 SDK `session_id` 作为 metadata、把 SDK user message `uuid` 作为 `user_message_identity` 传下去，真正的 identity alias、`sourceMessageId` 写入与 conversation 保存属于 adapter / send pipeline。
- 新增 Claude 特有 stream 事件时先补 fixture 测试，再扩展转换逻辑。

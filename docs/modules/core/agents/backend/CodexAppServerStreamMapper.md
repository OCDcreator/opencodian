# CodexAppServerStreamMapper

> **源码**: `src/core/agents/backend/CodexAppServerStreamMapper.ts`
> **状态**: [RUNTIME_ADJUNCT]
> **Updated**: 2026-09-30 — 0.159.0 item/notification rendering（imageGeneration、subAgentActivity、thread lifecycle 通知）

## 概述

`CodexAppServerStreamMapper` 是 Codex app-server 的纯协议转换层。它将单个 JSON-RPC 通知转换为 OpenCodian `StreamChunk[]`，并把权威的 `thread/tokenUsage/updated` 快照作为独立结果交给 `CodexAdapter` 持久化。

## 职责

- 映射 token usage、文本/推理 delta、MCP 进度、文件变更、tool、todo、结构化输出、warning/error 与 completed turn items
- `imageGeneration`（ThreadItem，camelCase）与 `image_generation_call`（ResponseItem，snake_case）→ `tool_use`（kind `'image'`，name `image_generation`）：started 发卡片，completed 发卡片更新 + `tool_result`；b64 `result` 按 magic bytes 推断 MIME 转 `data:image/...;base64` URL，`savedPath` 优先，usageLimitExceeded failure 同时发 `isError` tool_result 与 `error` chunk（含 limitId/resetsAt）
- `subAgentActivity` → `tool_use`（kind `'task'`，name `'task'`），以 `agentThreadId` 为卡片 key 合并 started/interacted/interrupted/completed 状态迁移；interrupted 以 `isError` tool_result 收尾
- `thread/name/updated` / `thread/goal/updated` / `thread/goal/cleared` / `thread/deleted` / `deprecationNotice` → `backend_event`（thread_deleted 另附 `error` notice chunk）；thread 级通知校验 `params.threadId` 与当前订阅 thread 一致，防止重放/错路由影响其它会话。这些 chunk 是 adapter owner 消费机器可读 seam（标题刷新、goal 状态、删除处理），聊天视图当前不渲染 backend_event
- 只将 `tokenUsage.total.totalTokens` 作为 context-ring 分子、`modelContextWindow` 作为分母
- 保留 input、cached input、output、reasoning output；`cache_write_input_tokens`（Codex SDK >= 0.152）存在时映射为 `cacheWriteTokens`，旧 app-server 缺省该字段时保持 `null`（不伪造 0）；费用保持 `null`
- app-server 未公开 `model_provider` 时保留 provider 为 `null`，不能硬编码为 OpenAI；后续本地价格 owner 只可按模型 ID 的无歧义 models.dev 条目推断
- 跟踪已流式送出的 agent/reasoning item，防止 completed item 重复渲染
- 不创建 thread、发起 turn、展示 UI 或写入会话；这些副作用归 `CodexAdapter` 所有

## 维护约束

- 对未知通知或 item 返回空 chunks，不能用账户 usage 或估算值伪造上下文数据
- 新增协议 item 先补 app-server adapter fixture，再扩展该映射
- b64 图像结果会作为 tool result 进入持久化 content block（与 ImageAttachment 先例一致）；新增大结果类型前先评估 vault 存储成本
- Context snapshot 必须由调用方以真实 app-server thread ID 持久化，不能绑定 provisional 本地 ID

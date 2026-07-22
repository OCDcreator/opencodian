# CodexAppServerStreamMapper

> **源码**: `src/core/agents/backend/CodexAppServerStreamMapper.ts`
> **状态**: [RUNTIME_ADJUNCT]
> **Updated**: 2026-07-22 — app-server primary-chat notification mapping extraction

## 概述

`CodexAppServerStreamMapper` 是 Codex app-server 的纯协议转换层。它将单个 JSON-RPC 通知转换为 OpenCodian `StreamChunk[]`，并把权威的 `thread/tokenUsage/updated` 快照作为独立结果交给 `CodexAdapter` 持久化。

## 职责

- 映射 token usage、文本/推理 delta、MCP 进度、文件变更、tool、todo、结构化输出、warning/error 与 completed turn items
- 只将 `tokenUsage.total.totalTokens` 作为 context-ring 分子、`modelContextWindow` 作为分母
- 保留 input、cached input、output、reasoning output；app-server 未提供的 cache-write 与费用保持 `null`
- app-server 未公开 `model_provider` 时保留 provider 为 `null`，不能硬编码为 OpenAI；后续本地价格 owner 只可按模型 ID 的无歧义 models.dev 条目推断
- 跟踪已流式送出的 agent/reasoning item，防止 completed item 重复渲染
- 不创建 thread、发起 turn、展示 UI 或写入会话；这些副作用归 `CodexAdapter` 所有

## 维护约束

- 对未知通知或 item 返回空 chunks，不能用账户 usage 或估算值伪造上下文数据
- 新增协议 item 先补 app-server adapter fixture，再扩展该映射
- Context snapshot 必须由调用方以真实 app-server thread ID 持久化，不能绑定 provisional 本地 ID

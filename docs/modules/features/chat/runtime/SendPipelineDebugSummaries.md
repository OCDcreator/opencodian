# SendPipelineDebugSummaries

> **源码**: `src/features/chat/runtime/SendPipelineDebugSummaries.ts`
> **状态**: [REVIEW]

## 概述

`SendPipelineDebugSummaries` 拥有 send pipeline 调试摘要的完整词汇表。它将原来由 `OpenCodianView` 直接拥有的调试摘要逻辑提取为独立的纯函数模块，供 send pipeline 运行时和关联服务统一调用。

包含的摘要函数：

- `summarizeContentBlocksForDebug` — 统计 content block 的数量、类型、文本长度、工具调用数和 thinking 块数
- `summarizeChatMessageForDebug` — 提取聊天消息的关键字段摘要（ID、角色、内容长度预览、contentBlocks 摘要等）
- `summarizeCoreStreamChunkForDebug` — 为每种 `CoreStreamChunk` 类型生成调试摘要
- `summarizeRenderedStreamChunkForDebug` — 为每种渲染层 `StreamChunk` 类型生成调试摘要

此外还导出两个内部工具函数：

- `getLogPreview` — 截断并归一化文本用于日志预览
- `stringifyLogPayload` — 安全地 JSON.stringify 日志负载

## 导入关系

```text
上游:
- ../../../core/types (ChatMessage, StreamChunk as CoreStreamChunk)
- ../../../utils/streaming (StreamChunk as StreamingChunk)
- ./SendPipelineTypes (SendPipelineDebugContentBlock)

下游:
- src/features/chat/OpenCodianView.ts (消费者，通过委托调用)
- src/features/chat/runtime/SendPipelineTrace.ts (通过 SendPipelineTraceHost)
- src/features/chat/runtime/StreamChunkRouter.ts (通过 StreamChunkRouterHost)
- src/features/chat/runtime/StreamLocalFinalizer.ts (通过 StreamLocalFinalizerHost)
- src/features/chat/runtime/LocalStreamMessagePersistence.ts (通过 LocalStreamPersistenceHost)
- 以及多个 service 层 host 接口
```

## 核心函数

| 函数 | 说明 |
|------|------|
| `summarizeContentBlocksForDebug(blocks)` | 返回 content blocks 的计数摘要 |
| `summarizeChatMessageForDebug(message)` | 返回聊天消息的字段摘要；输入为 null/undefined 时返回 null |
| `summarizeCoreStreamChunkForDebug(chunk)` | 按 chunk 类型分派，返回类型相关的摘要对象 |
| `summarizeRenderedStreamChunkForDebug(chunk)` | 按渲染层 chunk 类型分派，返回类型相关的摘要对象 |
| `getLogPreview(text, maxLength)` | 归一化空白并截断文本，用于日志预览 |
| `stringifyLogPayload(payload)` | 安全的 JSON.stringify，失败时返回 `'[unserializable]'` |

`summarizeCoreStreamChunkForDebug()` 现在识别 `backend_event`，把 Claude Code hook、subagent、tool progress、structured output 等诊断事件压缩为 source/event/status/id/name/contentLength/metadataKeys。它不泄露完整 structured output payload 到日志摘要，也不把这些事件当成可渲染 transcript。

## 设计约束

- 所有函数均为纯函数，不依赖外部状态
- 不直接操作 DOM 或 Obsidian API
- 保持与原始 `OpenCodianView` 实现完全一致的输出形状和日志标签

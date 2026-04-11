# sendPipelineContent

> **源码**: `src/features/chat/runtime/sendPipelineContent.ts`
> **状态**: [REVIEW]

## 概述

`sendPipelineContent` 提供发送 runtime 里最基础的 content helper。它把“流式 block 如何落成持久化 message block”“哪些 chunk 算可见内容”“如何提取纯文本 assistant content”这几件纯函数逻辑从流程类模块里拆出来。

## 公开函数

```typescript
mapStreamingContentBlocksToMessageContentBlocks(blocks): ContentBlock[]
getStreamedTextContent(blocks): string
hasVisibleStreamingContent(chunk): boolean
```

## 关键行为

- `mapStreamingContentBlocksToMessageContentBlocks()`：把 `StreamController` 的 text / thinking / tool_call block 变成会话持久化使用的 `ContentBlock`
- `getStreamedTextContent()`：只拼接 text block，供 assistant message `content` 字段回填
- `hasVisibleStreamingContent()`：统一定义“首次可见内容”的判定，供 pending indicator 与 reveal 逻辑复用

## 下游消费者

- `StreamChunkRouter`：判断何时 reveal shell、何时清 pending indicator
- `buildLocalStreamOutcome`：生成本地 assistant message 的纯文本内容
- `LocalStreamMessagePersistence`：把 block 转成最终持久化消息结构

## 注意事项

- 这里的“可见内容”故意不把 `error` 算进去；错误显示由 router 单独控制优先级。
- 新增 streaming block 类型时，要同时检查这里的映射与可见性规则是否需要扩展。

# forkMessages

> **源码**: `src/features/chat/forkMessages.ts`
> **状态**: [REVIEW]

## 概述

这个文件只提供一个纯函数：`cloneMessagesBeforeForkTarget()`。它负责在本地消息数组里截取“分叉目标之前”的历史消息，并返回深拷贝结果，供 `OpenCodianView.handleForkRequest()` 创建 fork 对话时使用。

## 函数行为

```typescript
cloneMessagesBeforeForkTarget(
  messages: ChatMessage[],
  targetMessage: Pick<ChatMessage, 'id' | 'sourceMessageId'>,
): ChatMessage[]
```

处理顺序如下：

1. 在原始数组里查找目标消息
2. 优先按 `message.id === targetMessage.id` 匹配
3. 如果目标携带 `sourceMessageId`，也允许按 `message.sourceMessageId === targetMessage.sourceMessageId` 匹配
4. 找到后返回 `slice(0, targetIndex)`，也就是不包含目标消息本身
5. 没找到时，退回整个 `messages` 数组
6. 最终统一用 `JSON.parse(JSON.stringify(...))` 返回深拷贝

## 模块关系

- 上游依赖：`../../core/types`
- 下游消费者：`OpenCodianView.cloneMessagesBefore()`

## 注意事项

- 这里的“深拷贝”是 JSON 语义深拷贝，适用于当前 `ChatMessage` 这类纯数据对象。
- 这个模块不调用服务端 fork API。真正的服务器分叉由 `OpenCodianView.handleForkRequest()` 里的 `openCodeService.forkSession()` 完成。

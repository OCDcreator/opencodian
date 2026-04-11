# StreamShellFinalizer

> **源码**: `src/features/chat/runtime/StreamShellFinalizer.ts`
> **状态**: [REVIEW]

## 概述

`StreamShellFinalizer` 专门处理“已经存在的 streaming shell DOM 最后该怎么落地”。它只负责 UI 壳体收尾，不负责构建 conversation message，也不决定最终 server sync。

## 公开函数

```typescript
finalizeStreamingShell(options): Promise<string>
```

返回值是一个简短 action label，供上层 trace 记录：

- `timestamp-added`
- `error-notice-rendered`
- `interrupted-notice-rendered`
- `removed`

## 关键行为

- 有 stream content blocks：追加时间戳与 copy button
- 只有 error：把占位 assistant shell 渲染成 error notice
- interrupted 且没有 block：通过 `AssistantNoticeRenderer.buildInterruptedAssistantNotice()` 创建 interrupted notice 并渲染到原 shell
- 既无内容也无 notice：移除空 shell

## 协作边界

- 依赖 `LocalStreamOutcome` 提供判定结果
- 可能会补写 `outcome.interruptedNoticeMessage`
- 不负责把 notice 或 assistant message 追加到 conversation

## 注意事项

- 这个模块假定 shell 已经创建完成；如果 `finalizedStreamingMessageEl` 为空，只返回 `removed`。
- interrupted badge 的展示文本仍来自 i18n `chat.stream.interruptedBadge`。

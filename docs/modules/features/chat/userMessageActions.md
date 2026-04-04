# userMessageActions

> **源码**: `src/features/chat/userMessageActions.ts`
> **状态**: [REVIEW]

## 概述

这个模块只有一个 DOM 辅助函数，用来同步用户消息底部“rewind / fork”按钮的禁用态。

## 导出

```typescript
syncUserMessageStreamingActionState(
  container: ParentNode,
  isStreaming: boolean,
): void
```

## 实现事实

- 目标选择器固定为 `.opencodian-user-action-btn`
- 函数会遍历 `container` 下所有匹配按钮
- 对每个按钮直接写入 `button.disabled = isStreaming`

## 模块关系

- 无上游依赖
- 下游消费者：`OpenCodianView.syncTabUserMessageActionButtons()`

## 注意事项

- 这个函数不会处理用户消息里的复制按钮，因为复制按钮使用的是另一套 class：`opencodian-copy-btn-inline--user`。
- 它也不判断“是否允许 fork / rewind”；业务判断由 `OpenCodianView` 完成，这里只负责同步当前 tab 的 streaming 禁用态。

# TrailingAssistantPatchTailStateApplierHelper

> **源码**: `src/features/chat/services/TrailingAssistantPatchTailStateApplierHelper.ts`
> **状态**: [REVIEW]

## 概述

`TrailingAssistantPatchTailStateApplierHelper` 把 trailing-assistant patch 成功后的尾部 DOM 副作用从 `ConversationRenderService` 抽成了一个更窄的 helper：

- 应用新的 `messageId` / `sourceMessageId` dataset
- 清除尾部 message 的入场动画，避免 patch 后重复播放
- 仅在 `tailStatePlan.shouldStickToBottom` 为真时调用 `scrollToBottom({ tabId })`

它不参与 patch 预检、正文重渲、footer finalize、debug logging 或 plan 组装；只负责消费已经预计算好的 `tailStatePlan` 并落地对应的尾部状态。

## 公开接口

```typescript
export type TrailingAssistantPatchTailStatePlan = {
  messageEl: HTMLElement;
  messageId: string;
  sourceMessageId: string | null;
  shouldStickToBottom: boolean;
};

export function applyTrailingAssistantPatchTailState(
  tailStatePlan: TrailingAssistantPatchTailStatePlan,
  tabId: TabId | null,
  applier: {
    scrollToBottom(options?: { tabId?: TabId | null }): void;
  },
): void;
```

## 与其他模块的关系

- `ConversationRenderService` 继续负责 trailing-assistant patch 的控制流，只在 patch 成功后把预建的 `tailStatePlan` 交给这里执行
- `buildTrailingAssistantPatchTailStatePlan()` 继续留在 `ConversationRenderService` 内，负责从 planning-context 预计算副作用输入
- 该 helper 与 debug logging helpers 相互独立：它不关心 completion / skipped log context，也不会读取整份 `successPlan`

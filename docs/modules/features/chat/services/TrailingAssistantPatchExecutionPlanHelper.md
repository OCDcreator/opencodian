# TrailingAssistantPatchExecutionPlanHelper

> **源码**: `src/features/chat/services/TrailingAssistantPatchExecutionPlanHelper.ts`
> **状态**: [REVIEW]

## 概述

`TrailingAssistantPatchExecutionPlanHelper` 把 trailing-assistant patch 里 execution-plan 的最终 shape 装配从 `ConversationRenderService` 抽成了独立纯 helper：

- 接收已经完成正文签名比较后的 `shouldFinalizeFooterOnly` 结论
- 统一返回稳定的 `finalize-footer` / `rerender-content` execution-plan contract
- 让 `ConversationRenderService` 在 execution-plan 阶段只保留 execution-tail context 协调与签名比较

它不读取 previous tail、不自行比较正文签名，也不执行任何 DOM 副作用；只负责根据既有决策装配最终 execution plan。

## 公开接口

```typescript
export type TrailingAssistantPatchExecutionPlanSource = {
  nextTailMessage: ChatMessage;
  patchTarget: {
    messageEl: HTMLElement;
    contentEl: HTMLElement;
  };
  shouldFinalizeFooterOnly: boolean;
};

export type TrailingAssistantPatchExecutionPlan =
  | {
    kind: 'finalize-footer';
    messageEl: HTMLElement;
    nextTailMessage: ChatMessage;
  }
  | {
    kind: 'rerender-content';
    messageEl: HTMLElement;
    contentEl: HTMLElement;
    nextTailMessage: ChatMessage;
  };

export function buildTrailingAssistantPatchExecutionPlan(
  source: TrailingAssistantPatchExecutionPlanSource,
): TrailingAssistantPatchExecutionPlan;
```

## 与其他模块的关系

- `TrailingAssistantPatchExecutionTailExecutionPlanHelper` 现在会在更窄的 execution-tail planning-context 边界上复用这里，不再由 `ConversationRenderService` 直接调用
- `TrailingAssistantPatchExecutionTailPlanningContextHelper` 继续负责从 success planning-context 缩成 execution/tail 共用的窄 contract
- `TrailingAssistantPatchSuccessPlanHelper` 继续只负责 success-plan 顶层 shape，并复用这里导出的 `TrailingAssistantPatchExecutionPlan` 类型

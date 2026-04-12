# TrailingAssistantPatchExecutionTailPlanningContextHelper

> **源码**: `src/features/chat/services/TrailingAssistantPatchExecutionTailPlanningContextHelper.ts`
> **状态**: [REVIEW]

## 概述

`TrailingAssistantPatchExecutionTailPlanningContextHelper` 把 trailing-assistant success-plan 里 execution-tail planning-context 的纯装配从 `ConversationRenderService` 抽成了独立 helper：

- 从更宽的 success `planningContext` 里只挑出 execution plan / tail outcome 共用的四个字段
- 保持 `previousTailMessage`、`nextTailMessage`、`patchTarget` 与 `shouldStickToBottom` 的 contract shape 不变
- 让 `ConversationRenderService` 更接近只负责组合 execution plan、tail outcome plans 与其他已预建子计划

它不负责正文签名比较、不负责 tail outcome plan 构建，也不触碰 DOM 副作用；只负责 execution-tail planning-context 的纯输入收束。

## 公开接口

```typescript
export type TrailingAssistantPatchExecutionTailPlanningContextSource = {
  previousTailMessage: ChatMessage;
  nextTailMessage: ChatMessage;
  patchTarget: {
    messageEl: HTMLElement;
    contentEl: HTMLElement;
  };
  shouldStickToBottom: boolean;
};

export type TrailingAssistantPatchExecutionTailPlanningContext = {
  previousTailMessage: ChatMessage;
  nextTailMessage: ChatMessage;
  patchTarget: {
    messageEl: HTMLElement;
    contentEl: HTMLElement;
  };
  shouldStickToBottom: boolean;
};

export function buildTrailingAssistantPatchExecutionTailPlanningContext(
  source: TrailingAssistantPatchExecutionTailPlanningContextSource,
): TrailingAssistantPatchExecutionTailPlanningContext;
```

## 与其他模块的关系

- `ConversationRenderService` 现在直接把 success `planningContext` 交给这里，不再在 service 内自行拼装 execution-tail inputs 或 planning-context
- `ConversationRenderService` 里的 `buildTrailingAssistantPatchExecutionPlanFromExecutionTailPlanningContext()` 现在只负责基于这里返回的窄 context 做正文签名比较，再把最终 execution-plan shape 委托给 `TrailingAssistantPatchExecutionPlanHelper`
- `ConversationRenderService` 里的 `buildTrailingAssistantPatchTailOutcomePlansFromExecutionTailPlanningContext()` 继续消费这里返回的窄 context
- 当 `executionPlan` 与 `tailOutcomePlans` 都已预建后，service 会再把二者交给 `TrailingAssistantPatchExecutionTailPlanPartsHelper` 收口成 execution/tail plan-parts
- 下一步若继续拆分 execution/tail 链路，可以继续沿着这里返回的窄 contract 抽离更细的子计划编排

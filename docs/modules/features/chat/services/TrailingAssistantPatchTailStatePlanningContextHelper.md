# TrailingAssistantPatchTailStatePlanningContextHelper

> **源码**: `src/features/chat/services/TrailingAssistantPatchTailStatePlanningContextHelper.ts`
> **状态**: [REVIEW]

## 概述

`TrailingAssistantPatchTailStatePlanningContextHelper` 把 trailing-assistant success-plan 里 tail-state planning-context 的纯装配从 `ConversationRenderService` 抽成了独立 helper：

- 接收 tail-outcome planning-context 风格的 source：tail messages、`messageEl` 与 `shouldStickToBottom`
- 在 helper 内部去掉仅供 completion-debug 使用的 `previousTailMessage`
- 保持下游 `TrailingAssistantPatchTailStateTailOutcomePlanHelper` 继续消费同一份稳定的 tail-state contract

它不负责生成 `tailStatePlan`、不处理 completion debug，也不执行任何 DOM 副作用；只负责 tail-state planning-context 的纯输入收口。

## 公开接口

```typescript
export type TrailingAssistantPatchTailStatePlanningContextSource = {
  previousTailMessage: ChatMessage;
  nextTailMessage: ChatMessage;
  messageEl: HTMLElement;
  shouldStickToBottom: boolean;
};

export type TrailingAssistantPatchTailStatePlanningContext = {
  nextTailMessage: ChatMessage;
  messageEl: HTMLElement;
  shouldStickToBottom: boolean;
};

export function buildTrailingAssistantPatchTailStatePlanningContext(
  source: TrailingAssistantPatchTailStatePlanningContextSource,
): TrailingAssistantPatchTailStatePlanningContext;
```

## 与其他模块的关系

- `TrailingAssistantPatchTailStateTailOutcomePlanHelper` 现在直接把 tail-outcome `planningContext` 交给这里，不再在上游自行拼装 tail-state inputs
- `TrailingAssistantPatchTailOutcomePlanningContextHelper` 继续负责收束 `previousTailMessage`、`nextTailMessage`、`messageEl` 与 `shouldStickToBottom` 的共享 tail-outcome contract；本 helper 再把它进一步缩成 tail-state 专用 contract
- `TrailingAssistantPatchTailStateTailOutcomePlanHelper` 继续消费这里返回的窄 planning-context，并把最终 `tailStatePlan` 交给 `TrailingAssistantPatchTailStateApplierHelper`

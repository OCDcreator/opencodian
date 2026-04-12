# TrailingAssistantPatchTailStatePlanningContextInputsHelper

> **源码**: `src/features/chat/services/TrailingAssistantPatchTailStatePlanningContextInputsHelper.ts`
> **状态**: [REVIEW]

## 概述

`TrailingAssistantPatchTailStatePlanningContextInputsHelper` 把 trailing-assistant tail-state planning-context 的局部 inputs 装配从 `TrailingAssistantPatchTailStatePlanningContextHelper` 抽成了独立 pure helper：

- 接收 tail-outcome planning-context 风格的 source：tail messages、`messageEl` 与 `shouldStickToBottom`
- 只保留 tail-state 下游真正需要的 `nextTailMessage`、`messageEl` 与 `shouldStickToBottom`
- 统一返回 `TrailingAssistantPatchTailStatePlanningContextHelper` 消费的稳定 inputs shape

它不生成最终 planning-context shape、不计算 `tailStatePlan`，也不执行任何 DOM/runtime 副作用；只负责 source fields 到 tail-state inputs 的纯收束。

## 公开接口

```typescript
export type TrailingAssistantPatchTailStatePlanningContextInputsSource = {
  previousTailMessage: ChatMessage;
  nextTailMessage: ChatMessage;
  messageEl: HTMLElement;
  shouldStickToBottom: boolean;
};

export type TrailingAssistantPatchTailStatePlanningContextInputs = {
  nextTailMessage: ChatMessage;
  messageEl: HTMLElement;
  shouldStickToBottom: boolean;
};

export function buildTrailingAssistantPatchTailStatePlanningContextInputs(
  source: TrailingAssistantPatchTailStatePlanningContextInputsSource,
): TrailingAssistantPatchTailStatePlanningContextInputs;
```

## 与其他模块的关系

- `TrailingAssistantPatchTailStatePlanningContextHelper` 现在先委托这里把 tail-outcome source 收束成 tail-state inputs，再装配最终 planning-context shape
- `TrailingAssistantPatchTailOutcomePlanningContextHelper` 继续提供更上游的 tail-outcome planning-context source
- `TrailingAssistantPatchTailStateTailOutcomePlanHelper` 继续经由 planning-context helper 暴露 tail-state planning-context 给更下游的 tail-state plan 装配

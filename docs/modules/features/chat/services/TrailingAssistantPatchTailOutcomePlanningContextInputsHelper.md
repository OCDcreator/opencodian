# TrailingAssistantPatchTailOutcomePlanningContextInputsHelper

> **源码**: `src/features/chat/services/TrailingAssistantPatchTailOutcomePlanningContextInputsHelper.ts`
> **状态**: [REVIEW]

## 概述

`TrailingAssistantPatchTailOutcomePlanningContextInputsHelper` 把 trailing-assistant tail-outcome planning-context 的局部 inputs 装配从 `TrailingAssistantPatchTailOutcomePlanningContextHelper` 抽成了独立 pure helper：

- 接收 execution-tail planning-context 风格的 source：tail messages、`patchTarget` 与 `shouldStickToBottom`
- 只从 `patchTarget.messageEl` 提取 tail-outcome 专用的 `messageEl`
- 统一返回 `TrailingAssistantPatchTailOutcomePlanningContextHelper` 消费的稳定 inputs shape

它不生成最终 planning-context shape、不计算 tail-state 或 completion-debug plan，也不执行任何 DOM/runtime 副作用；只负责 source fields 到 tail-outcome inputs 的纯收束。

## 公开接口

```typescript
export type TrailingAssistantPatchTailOutcomePlanningContextInputsSource = {
  previousTailMessage: ChatMessage;
  nextTailMessage: ChatMessage;
  patchTarget: {
    messageEl: HTMLElement;
  };
  shouldStickToBottom: boolean;
};

export type TrailingAssistantPatchTailOutcomePlanningContextInputs = {
  previousTailMessage: ChatMessage;
  nextTailMessage: ChatMessage;
  messageEl: HTMLElement;
  shouldStickToBottom: boolean;
};

export function buildTrailingAssistantPatchTailOutcomePlanningContextInputs(
  source: TrailingAssistantPatchTailOutcomePlanningContextInputsSource,
): TrailingAssistantPatchTailOutcomePlanningContextInputs;
```

## 与其他模块的关系

- `TrailingAssistantPatchTailOutcomePlanningContextHelper` 现在先委托这里把 execution-tail source 收束成 tail-outcome inputs，再装配最终 planning-context shape
- `TrailingAssistantPatchExecutionTailPlanningContextHelper` 继续提供更上游的 execution-tail planning-context source
- `TrailingAssistantPatchTailOutcomeExecutionTailPlanSourceContractHelper` 继续通过 planning-context helper 暴露 tail-outcome planning-context 给更下游的 execution-tail plan helper

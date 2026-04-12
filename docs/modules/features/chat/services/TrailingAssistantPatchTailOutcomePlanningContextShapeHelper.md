# TrailingAssistantPatchTailOutcomePlanningContextShapeHelper

> **源码**: `src/features/chat/services/TrailingAssistantPatchTailOutcomePlanningContextShapeHelper.ts`
> **状态**: [REVIEW]

## 概述

`TrailingAssistantPatchTailOutcomePlanningContextShapeHelper` 把 trailing-assistant tail-outcome planning-context 的最后一层 `{ previousTailMessage, nextTailMessage, messageEl, shouldStickToBottom }` shape 装配从 `TrailingAssistantPatchTailOutcomePlanningContextHelper` 抽成了独立 pure helper：

- 接收已经收束好的 tail-outcome inputs
- 统一返回稳定的 tail-outcome planning-context contract
- 让上游 planning-context helper 更接近只负责编排 `source -> inputs -> final shape`

它不读取 `patchTarget`、不生成 `tailStatePlan` 或 `completionDebugPlan`，也不处理任何 DOM/runtime 副作用；只负责最终 planning-context shape 的纯收口。

## 公开接口

```typescript
export type TrailingAssistantPatchTailOutcomePlanningContextShapeInputs = {
  previousTailMessage: ChatMessage;
  nextTailMessage: ChatMessage;
  messageEl: HTMLElement;
  shouldStickToBottom: boolean;
};

export type TrailingAssistantPatchTailOutcomePlanningContext =
  TrailingAssistantPatchTailOutcomePlanningContextShapeInputs;

export function buildTrailingAssistantPatchTailOutcomePlanningContextShape(
  inputs: TrailingAssistantPatchTailOutcomePlanningContextShapeInputs,
): TrailingAssistantPatchTailOutcomePlanningContext;
```

## 与其他模块的关系

- `TrailingAssistantPatchTailOutcomePlanningContextHelper` 现在把最终 planning-context shape 的装配委托给这里，自己只负责编排上游 source 与 inputs helper
- `TrailingAssistantPatchTailOutcomePlanningContextInputsHelper` 继续负责把 execution-tail source fields 收束成这里消费的窄 inputs
- `TrailingAssistantPatchTailOutcomeExecutionTailPlanHelper` 继续消费这里最终稳定的 tail-outcome planning-context shape，并展开 `{ tailStatePlan, completionDebugPlan }`

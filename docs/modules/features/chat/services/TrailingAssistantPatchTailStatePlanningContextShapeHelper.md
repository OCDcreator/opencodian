# TrailingAssistantPatchTailStatePlanningContextShapeHelper

> **源码**: `src/features/chat/services/TrailingAssistantPatchTailStatePlanningContextShapeHelper.ts`
> **状态**: [REVIEW]

## 概述

`TrailingAssistantPatchTailStatePlanningContextShapeHelper` 把 trailing-assistant tail-state planning-context 的最后一层 `{ nextTailMessage, messageEl, shouldStickToBottom }` shape 装配从 `TrailingAssistantPatchTailStatePlanningContextHelper` 抽成了独立 pure helper：

- 接收已经收束好的 tail-state inputs
- 统一返回稳定的 tail-state planning-context contract
- 让上游 planning-context helper 更接近只负责编排 `source -> inputs -> final shape`

它不读取 `previousTailMessage`、不生成 `tailStatePlan`，也不处理任何 DOM/runtime 副作用；只负责最终 planning-context shape 的纯收口。

## 公开接口

```typescript
export type TrailingAssistantPatchTailStatePlanningContextShapeInputs = {
  nextTailMessage: ChatMessage;
  messageEl: HTMLElement;
  shouldStickToBottom: boolean;
};

export type TrailingAssistantPatchTailStatePlanningContext =
  TrailingAssistantPatchTailStatePlanningContextShapeInputs;

export function buildTrailingAssistantPatchTailStatePlanningContextShape(
  inputs: TrailingAssistantPatchTailStatePlanningContextShapeInputs,
): TrailingAssistantPatchTailStatePlanningContext;
```

## 与其他模块的关系

- `TrailingAssistantPatchTailStatePlanningContextHelper` 现在把最终 planning-context shape 的装配委托给这里，自己只负责编排上游 source 与 inputs helper
- `TrailingAssistantPatchTailStatePlanningContextInputsHelper` 继续负责把 tail-outcome source fields 收束成这里消费的窄 inputs
- `TrailingAssistantPatchTailStateTailOutcomePlanHelper` 继续消费这里最终稳定的 tail-state planning-context shape，并展开 `tailStatePlan`

# TrailingAssistantPatchTailStateTailOutcomePlanHelper

> **源码**: `src/features/chat/services/TrailingAssistantPatchTailStateTailOutcomePlanHelper.ts`
> **状态**: [REVIEW]

## 概述

`TrailingAssistantPatchTailStateTailOutcomePlanHelper` 把 trailing-assistant tail-outcome 路径里“tail-outcome planning-context → tailStatePlan”的纯编排从 `ConversationRenderService` 抽成了独立 helper：

- 接收共享的 tail-outcome planning-context
- 先委托 `TrailingAssistantPatchTailStatePlanningContextHelper` 收束 tail-state 专用 planning-context
- 再返回稳定的 `tailStatePlan`

它不触碰 DOM 副作用、不处理 completion debug，也不读取 host；只负责 tail-state tail-outcome 子链的纯 plan 装配。

## 公开接口

```typescript
export type TrailingAssistantPatchTailStateTailOutcomePlanSource =
  TrailingAssistantPatchTailStatePlanningContextSource;

export function buildTrailingAssistantPatchTailStatePlanFromTailOutcomePlanningContext(
  source: TrailingAssistantPatchTailStateTailOutcomePlanSource,
): TrailingAssistantPatchTailStatePlan;
```

## 与其他模块的关系

- `ConversationRenderService` 现在只把共享的 tail-outcome planning-context 交给这里，不再在 service 内直接串联 tail-state planning-context 与最终 `tailStatePlan` shape
- `TrailingAssistantPatchTailStatePlanningContextHelper` 继续负责把 tail-outcome source 缩成 tail-state 专用 planning-context
- `TrailingAssistantPatchTailStateApplierHelper` 继续消费这里返回的 `tailStatePlan` 并执行真正的尾部 DOM 状态更新

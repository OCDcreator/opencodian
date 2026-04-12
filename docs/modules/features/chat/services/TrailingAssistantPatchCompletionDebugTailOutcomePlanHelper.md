# TrailingAssistantPatchCompletionDebugTailOutcomePlanHelper

> **源码**: `src/features/chat/services/TrailingAssistantPatchCompletionDebugTailOutcomePlanHelper.ts`
> **状态**: [REVIEW]

## 概述

`TrailingAssistantPatchCompletionDebugTailOutcomePlanHelper` 把 trailing-assistant tail-outcome 路径里“tail-outcome context parts → completionDebugPlan”的纯编排从更上游的 success-plan 组合链中抽成了独立 helper：

- 接收共享的 tail-outcome planning-context、已经算好的窄 `tailStatePlan` 与消息摘要函数
- 先委托 `TrailingAssistantPatchCompletionDebugPlanningContextSourceContractHelper` 组装 completion-debug source contract
- 再交给 `TrailingAssistantPatchCompletionDebugPlanningContextHelper` 收束 completion-debug planning-context
- 最后通过 `TrailingAssistantPatchCompletionDebugPlanHelper` 返回稳定的 `completionDebugPlan`

它不读取 host、不触碰 DOM 副作用，也不发送 debug 日志；只负责 completion-debug tail-outcome 子链的纯 helper 编排。

## 公开接口

```typescript
export type TrailingAssistantPatchCompletionDebugTailOutcomePlanParts =
  TrailingAssistantPatchCompletionDebugPlanningContextSourceContractParts;

export function buildTrailingAssistantPatchCompletionDebugPlanFromTailOutcomePlanningContext(
  parts: TrailingAssistantPatchCompletionDebugTailOutcomePlanParts,
): TrailingAssistantPatchCompletionDebugPlan;
```

## 与其他模块的关系

- `TrailingAssistantPatchTailOutcomeExecutionTailPlanHelper` 现在只把 tail-outcome planning-context、`tailStatePlan` 与 `summarizeChatMessageForDebug` 回调交给这里，不再让更上游模块直接串联 completion-debug source / planning-context / final-plan helper
- `TrailingAssistantPatchCompletionDebugPlanningContextSourceContractHelper` 继续负责 `{ ...planningContext, tailStatePlan, summarizeChatMessageForDebug }` source contract 的纯装配
- `TrailingAssistantPatchCompletionDebugPlanningContextHelper` 继续负责把 source contract 缩成 completion-debug 专用 planning-context
- `TrailingAssistantPatchCompletionDebugPlanHelper` 继续负责最终 `completionDebugPlan` shape 的字段展开

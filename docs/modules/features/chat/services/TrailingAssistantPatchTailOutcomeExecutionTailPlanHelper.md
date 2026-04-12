# TrailingAssistantPatchTailOutcomeExecutionTailPlanHelper

> **源码**: `src/features/chat/services/TrailingAssistantPatchTailOutcomeExecutionTailPlanHelper.ts`
> **状态**: [REVIEW]

## 概述

`TrailingAssistantPatchTailOutcomeExecutionTailPlanHelper` 把 trailing-assistant success-plan 里“execution-tail planning-context → tailOutcomePlans”的纯编排从 `ConversationRenderService` 抽成了独立 helper：

- 接收共享的 execution-tail planning-context 与 completion-debug 消息摘要函数
- 先委托 `TrailingAssistantPatchTailOutcomePlanningContextHelper` 收束 tail-outcome 专用 planning-context
- 再串联 `TrailingAssistantPatchTailStateTailOutcomePlanHelper`、`TrailingAssistantPatchCompletionDebugTailOutcomePlanHelper` 与 `TrailingAssistantPatchTailOutcomePlanHelper`
- 最后返回稳定的 `{ tailStatePlan, completionDebugPlan }` contract

它不比较正文签名、不执行 DOM/runtime 副作用，也不直接读取 host；只负责 tail-outcome execution-tail 子链的纯 helper 编排。

## 公开接口

```typescript
export type TrailingAssistantPatchTailOutcomeExecutionTailPlanSource = {
  planningContext: TrailingAssistantPatchExecutionTailPlanningContext;
  summarizeChatMessageForDebug: TrailingAssistantPatchCompletionDebugMessageSummarizer;
};

export function buildTrailingAssistantPatchTailOutcomePlansFromExecutionTailPlanningContext(
  source: TrailingAssistantPatchTailOutcomeExecutionTailPlanSource,
): TrailingAssistantPatchTailOutcomePlans;
```

## 与其他模块的关系

- `ConversationRenderService` 现在只把 execution-tail planning-context 与 `summarizeChatMessageForDebug` 依赖交给这里，不再在 service 内直接串联 tail-outcome planning-context、tail-state plan 与 completion-debug plan
- `TrailingAssistantPatchTailOutcomePlanningContextHelper` 继续负责把 execution-tail contract 缩成 tail-outcome 专用 planning-context
- `TrailingAssistantPatchTailStateTailOutcomePlanHelper` 与 `TrailingAssistantPatchCompletionDebugTailOutcomePlanHelper` 继续分别负责各自子计划的纯编排
- `TrailingAssistantPatchTailOutcomePlanHelper` 继续负责最终 `{ tailStatePlan, completionDebugPlan }` 顶层 shape 收口

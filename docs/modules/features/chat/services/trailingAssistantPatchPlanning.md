# trailingAssistantPatchPlanning

> **源码**: `src/features/chat/services/trailingAssistantPatchPlanning.ts`
> **状态**: [REVIEW]

## 概述

`trailingAssistantPatchPlanning` 是 trailing-assistant patch 家族里的纯 planning bundle。它把原先分散在多个 `CompletionDebug*`、`TailState*`、`TailOutcome*` helper 里的输入收束、shape 装配与 plan 聚合合并到一个模块里，同时保持现有 assistant tail finalization 语义不变。

## 责任边界

- completion debug：汇总前后 tail message summary、planning context 与最终 debug plan
- tail state：从 tail-outcome 输入收束出 dataset / scroll 所需的 `tailStatePlan`
- tail outcome：把 tail-state 与 completion-debug 两条子计划收口成稳定的 `tailOutcomePlans`
- planning context：统一维护 tail-outcome / tail-state / completion-debug 所需的窄 contract

## 公开接口

```typescript
export function buildTrailingAssistantPatchCompletionDebugPlanFromTailOutcomePlanningContext(
  parts: TrailingAssistantPatchCompletionDebugTailOutcomePlanParts,
): TrailingAssistantPatchCompletionDebugPlan;

export function buildTrailingAssistantPatchTailStatePlanFromTailOutcomePlanningContext(
  source: TrailingAssistantPatchTailStateTailOutcomePlanSource,
): TrailingAssistantPatchTailStatePlan;

export function buildTrailingAssistantPatchTailOutcomePlansFromExecutionTailPlanningContext(
  source: TrailingAssistantPatchTailOutcomeExecutionTailPlanSource,
): TrailingAssistantPatchTailOutcomePlans;
```

## 与其他模块的关系

- `trailingAssistantPatchExecution.ts` 复用这里的 tail-outcome / completion-debug planning 结果来生成最终 success-plan
- `trailingAssistantPatchDebug.ts` 不再直接参与 tail-outcome 计划构建，只消费成功或跳过后的稳定 logging context
- `trailingAssistantPatchTypes.ts` 为这里提供共享 contract，避免 execution/debug bundle 重新声明同名 shape
- `ConversationRenderService` 不再直接面对几十个微型 helper，只通过 execution bundle 间接消费这里的 plan

## 注意事项

- 新增 trailing-assistant planning 逻辑时，优先扩展这里而不是重新拆回多个 `*Helper.ts`
- 保持 `tailStatePlan` / `completionDebugPlan` 的字段语义稳定，避免影响 `ConversationRenderService.trailingAssistantPatch` 路径

# trailingAssistantPatchExecution

> **源码**: `src/features/chat/services/trailingAssistantPatchExecution.ts`
> **状态**: [REVIEW]

## 概述

`trailingAssistantPatchExecution` 是 trailing-assistant patch 的 execution bundle。它把 execution-tail planning context、footer finalization decision、success-plan 装配、turn-body scope 切换，以及 patch 成功后的 tail-state 应用收拢到同一个运行时 owner 中。

## 核心职责

- 生成 `executionPlan`，统一 finalize-footer / rerender-content 两条执行分支
- 计算 execution-tail child plans，并与 planning bundle 返回的 `tailOutcomePlans` 组合成最终 success-plan
- 收口 turn-body scope 的 plan 预计算与运行时切换/恢复
- 在 patch 成功后应用 `messageId` / `sourceMessageId` / animation / scroll-to-bottom 更新

## 公开接口

```typescript
export function buildTrailingAssistantPatchSuccessPlanFromPlanningContext(
  source: TrailingAssistantPatchSuccessPlanningContextPlanSource,
): TrailingAssistantPatchSuccessPlan;

export function applyTrailingAssistantPatchTailState(
  tailStatePlan: TrailingAssistantPatchTailStatePlan,
  tabId: TabId | null,
  applier: TrailingAssistantPatchTailStateApplier,
): void;

export async function withTrailingAssistantTurnBodyScope<T>(
  turnBodyScopePlan: TrailingAssistantPatchTurnBodyScopePlan,
  run: () => Promise<T>,
): Promise<T>;
```

## 与其他模块的关系

- `ConversationRenderService` 直接依赖这里来构建 success-plan、执行 turn-body scope，以及应用 tail-state
- `trailingAssistantPatchPlanning.ts` 负责提供 tail-outcome / completion-debug 子计划，这里负责把它们编排进最终 execution success path
- `trailingAssistantPatchTypes.ts` 提供 execution plan、scope plan、success plan 等共享 contract

## 注意事项

- 不要把 footer-finalization decision、turn-body scope 或 tail-state apply 再拆回单独薄文件
- 新 execution 分支应继续复用现有 `executionPlan.kind` contract，而不是让 `ConversationRenderService` 回到手工 if/else 装配

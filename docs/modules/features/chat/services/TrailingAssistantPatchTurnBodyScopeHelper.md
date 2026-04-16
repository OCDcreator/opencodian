# TrailingAssistantPatchTurnBodyScopeHelper

> **源码**: `src/features/chat/services/TrailingAssistantPatchTurnBodyScopeHelper.ts`
> **状态**: [REVIEW]

## 概述

`TrailingAssistantPatchTurnBodyScopeHelper` 把 trailing-assistant patch 执行期间的 turn-body runtime 临时切换从 `ConversationRenderService` 抽成了一个小型副作用 helper：

- 接收预计算好的 `turnBodyScopePlan`
- 在 patch 正文执行前临时设置 `runtime.currentTurnBodyEl`
- 在成功或失败后恢复 plan 中指定的 `restoreTurnBodyEl`
- 缺少 runtime 时直接运行回调，不触碰任何 DOM runtime 状态

## 公开接口

```typescript
export type TrailingAssistantPatchTurnBodyRuntimeState = {
  currentTurnBodyEl: HTMLElement | null;
};

export type TrailingAssistantPatchTurnBodyScopePlan =
  | { runtime: null }
  | {
      runtime: TrailingAssistantPatchTurnBodyRuntimeState;
      scopedTurnBodyEl: HTMLElement;
      restoreTurnBodyEl: HTMLElement;
    };

export function withTrailingAssistantTurnBodyScope<T>(
  turnBodyScopePlan: TrailingAssistantPatchTurnBodyScopePlan,
  run: () => Promise<T>,
): Promise<T>;
```

## 边界

- 本 helper 不决定 scope plan 应该如何构建；`TrailingAssistantPatchTurnBodyScopePlanHelper` 负责预计算 `scopedTurnBodyEl` 与 `restoreTurnBodyEl`
- 本 helper 不执行 assistant 正文渲染、footer finalization、tail-state 更新或 debug logging
- `finally` 恢复保证 scoped work 抛错时也会回到 plan 指定的 turn body

## 与 `ConversationRenderService` 的关系

- `ConversationRenderService` 继续负责编排 trailing-assistant patch 成功路径
- patch 执行时，service 只把由 `TrailingAssistantPatchTurnBodyScopePlanHelper` 预建的 `turnBodyScopePlan` 和正文执行回调交给这里
- 这样 service 内部不再直接承担 `currentTurnBodyEl` 临时切换 / 恢复副作用

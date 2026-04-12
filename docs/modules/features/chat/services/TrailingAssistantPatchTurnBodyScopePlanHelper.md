# TrailingAssistantPatchTurnBodyScopePlanHelper

> **源码**: `src/features/chat/services/TrailingAssistantPatchTurnBodyScopePlanHelper.ts`
> **状态**: [REVIEW]

## 概述

`TrailingAssistantPatchTurnBodyScopePlanHelper` 把 trailing-assistant patch success-plan 里的 turn-body scope 计划构建从更高层 success-plan 编排中抽成了独立纯 helper：

- 接收最小化的 source：`runtime` 与目标 `parentEl`
- 在 helper 内部完成 scope-plan inputs 装配
- 统一决定 `restoreTurnBodyEl` 是沿用既有 `currentTurnBodyEl` 还是回退到 `parentEl`
- 返回稳定的 `turnBodyScopePlan`，供副作用 helper 执行

它不触碰 DOM runtime 状态，也不执行正文 patch；只负责纯数据计划装配。

## 公开接口

```typescript
export type TrailingAssistantPatchTurnBodyScopePlanSource = {
  runtime: TrailingAssistantPatchTurnBodyRuntimeState | null;
  parentEl: HTMLElement;
};

export function buildTrailingAssistantPatchTurnBodyScopePlan(
  source: TrailingAssistantPatchTurnBodyScopePlanSource,
): TrailingAssistantPatchTurnBodyScopePlan;
```

## 与其他 helper 的关系

- `TrailingAssistantPatchSuccessChildPlansHelper` 现在会把更窄的 `turnBodyScopePlanSource` 交给这里，不再让 `ConversationRenderService` 直接协调 scope-plan 预建
- `TrailingAssistantPatchTurnBodyScopeHelper` 继续负责真正的 `currentTurnBodyEl` 临时切换与恢复
- 这样 turn-body scope 的“计划构建”和“副作用执行”边界被拆成两个更单一的模块

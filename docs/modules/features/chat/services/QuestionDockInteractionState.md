# QuestionDockInteractionState

> **源码**: `src/features/chat/services/QuestionDockInteractionState.ts`
> **状态**: [REVIEW]

## 概述

`QuestionDockInteractionState` 是上方 question dock 的交互状态 helper，负责把 dock callback 产生的 draft answer、active group 与 active question index 写回 tab runtime。它复用 `questionDockState` 的纯函数 view-model 推导，让加厚后的 `QuestionDockCoordinator` 可以拥有 lifecycle map，同时避免把 answer sanitize / selection 推导铺在 render callback 内。

## 公开接口

```typescript
export interface QuestionDockInteractionRuntimeState {
  questionDraftAnswers: Map<string, string[][]>;
  questionActiveGroupKeys: Map<string, string>;
  questionActiveIndexes: Map<string, number>;
}

export function getQuestionDockActiveInteractionState(...): QuestionDockActiveInteractionState;
export function getQuestionDockDraftAnswers(...): string[][];
export function setQuestionDockDraftAnswer(...): void;
export function selectQuestionDockGroup(...): void;
export function selectQuestionDockQuestion(...): void;
export function sanitizeQuestionDockAnswer(...): string[];
```

## 关键行为

- `getQuestionDockDraftAnswers()` 会按 request 问题数规范化 `string[][]` 草稿答案，并在 runtime 存在时写回 `questionDraftAnswers`
- `getQuestionDockActiveInteractionState()` 会构建 `QuestionDockViewModel`，然后把推导出的 active group / active index 持久化到 runtime map
- `setQuestionDockDraftAnswer()` 负责对单选答案 trim + 取首项，对多选答案 trim + 去空 + 去重，再写入 request 对应的草稿答案
- `selectQuestionDockGroup()` 与 `selectQuestionDockQuestion()` 封装 dock callback 对 active group/index 的同步规则，避免 coordinator 直接操作这两组 map

## 与其他模块的边界

- 上游由 `QuestionDockCoordinator` 经 `QuestionDockRenderAdapter` 与 `QuestionDockResolutionActionFacade` 间接调用；coordinator 负责 pending-question hydration、waiter lifecycle、dock render 入口、submit/reject API 调用与 resolve 后 follow-up
- 下游复用 `questionDockState` 的 `normalizeQuestionDraftAnswers()`、`buildQuestionDockViewModel()` 与 `getPreferredQuestionIndexForGroup()`，保持分组和显示模式推导规则一致
- 本模块不触碰 dock queue waiter、pending refresh suppression、resolved card state 或 DOM 渲染；这些仍分别由 `QuestionDockCoordinator`、`QuestionResolutionCoordinator` 与 `QuestionDock` 负责

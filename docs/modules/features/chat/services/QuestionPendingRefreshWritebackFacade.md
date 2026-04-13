# QuestionPendingRefreshWritebackFacade

> **源码**: `src/features/chat/services/QuestionPendingRefreshWritebackFacade.ts`
> **状态**: [REVIEW]

## 概述

`QuestionPendingRefreshWritebackFacade` 把 pending-question refresh 完成后的 **tab attention 与 dock render writeback** 从 `QuestionDockCoordinator` 中收束到一个小型 facade，专门负责：

- 在 active tab 的 pending questions 被 clear 或 refresh 后清掉 `needsAttention` 并触发 dock 重绘
- 在后台 tab refresh 后根据 merged pending request 数量设置 `needsAttention`
- 在后台 tab clear 后清掉 `needsAttention`，但不触发 active dock 重绘

它不负责 OpenCode pending question API fetch、session 过滤、pending question runtime merge/pruning、dock queue waiter 生命周期、dock callback 处理，或 question resolve 后的 status/sync follow-up；这些仍分别由 `QuestionDockCoordinator`、`QuestionPendingRefreshRuntimeFacade`、`QuestionDockQueueRuntimeFacade`、`QuestionDockInteractionState`、`QuestionResolutionWritebackFacade` 与 `QuestionPostResolutionRuntimeFacade` 负责。

## 公开接口

```typescript
export interface QuestionPendingRefreshWritebackFacadeHost {
  getActiveTabId(): TabId | null;
  setTabNeedsAttention(tabId: TabId | null, needsAttention: boolean): void;
  renderQuestionDock(): void;
}

export class QuestionPendingRefreshWritebackFacade {
  applyClearedPendingQuestions(tabId: TabId | null): void;
  applyRefreshedPendingQuestions(
    tabId: TabId | null,
    mergedRequests: readonly QuestionRequest[],
  ): void;
}
```

## 关键行为

- `applyClearedPendingQuestions()` 始终把目标 tab 的 attention 置为 `false`；只有目标 tab 是 active tab 时才重绘 dock
- `applyRefreshedPendingQuestions()` 对 active tab 固定清掉 attention 并重绘 dock，保证上方 dock 与最新 pending state 同步
- `applyRefreshedPendingQuestions()` 对后台 tab 不重绘 dock，只按 `mergedRequests.length > 0` 写入 attention，延续 post-sync/background-tab 的提醒行为

## 与 `OpenCodianView` 的边界

- `QuestionRuntimeHostAdapter` 负责装配本 facade，把 `setTabNeedsAttention()` 继续接到稳定的 tab attention port，并把 `renderQuestionDock()` late-bind 到 `QuestionDockCoordinator.render()`
- `QuestionDockCoordinator` 继续负责 pending question API fetch/session filter 与 dock callbacks；refresh 完成后的 active/background attention/render 分流交给本 facade
- `QuestionPendingRefreshRuntimeFacade` 继续只维护 pending question runtime state；本 facade 只消费它返回的 merged request 数量作为后台 attention writeback 输入

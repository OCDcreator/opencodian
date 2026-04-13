# QuestionDockCoordinator

> **源码**: `src/features/chat/services/QuestionDockCoordinator.ts`
> **状态**: [REVIEW]

## 概述

`QuestionDockCoordinator` 把 `OpenCodianView` 中与上方 question dock 相关的 **pending-question API refresh、dock 渲染入口，以及 dock 回答/拒绝流程** 收束到一个 dedicated service，专门负责：

- 把 dock waiter、enqueue/remove queue runtime state 维护委托给 `QuestionDockQueueRuntimeFacade`，并把 pending refresh 期间的 resolved-id suppression / stale runtime pruning 委托给 `QuestionPendingRefreshRuntimeFacade`
- 把 `OpenCodeService.getPendingQuestions()` 的结果过滤到当前 session，并保留仍在等待上方 dock 回答的 request
- 选择 active request 后把 `QuestionDock` 的 render state / callbacks 组装委托给 `QuestionDockRenderAdapter`，并把 draft answer sanitize、active group 与 active question index 写回继续委托给 `QuestionDockInteractionState`
- 在上方 dock 提交或拒绝问题后，统一执行 `replyToQuestion()` / `rejectQuestion()`，再把 resolved-id suppression、resolved state bridge 与 runtime follow-up 委托给共享的 `QuestionResolutionWritebackFacade`

它不负责 inline question card 的 DOM 渲染、answered/rejected 回顾卡片、dock queue runtime map 维护、pending refresh runtime map 维护、dock interaction map 写回、dock render payload composition，或 resolve 后的 status/sync follow-up；这些仍分别由 `QuestionInlineCardRenderer`、`QuestionResolutionCoordinator`、`QuestionDockQueueRuntimeFacade`、`QuestionPendingRefreshRuntimeFacade`、`QuestionDockInteractionState`、`QuestionDockRenderAdapter`、`QuestionResolutionWritebackFacade` 与 `QuestionPostResolutionRuntimeFacade` 负责。它的 host 装配现在通常由 `QuestionRuntimeHostAdapter` 统一提供。

## 公开接口

```typescript
export interface QuestionDockCoordinatorHost {
  getTabRuntimeState(tabId: TabId | null): QuestionDockCoordinatorRuntimeState | null;
  getActiveTabId(): TabId | null;
  getCurrentConversationSessionId(): string | null | undefined;
  getSessionIdForTab(tabId: TabId | null): string | null | undefined;
  getQuestionDock(): Pick<QuestionDock, 'render'> | null;
  getQuestionDisplayMode(): QuestionDisplayMode;
  shouldUseAboveInputQuestionDock(): boolean;
  setTabNeedsAttention(tabId: TabId | null, needsAttention: boolean): void;
  getPendingQuestions(): Promise<QuestionRequest[]>;
  replyToQuestion(requestId: string, answers: string[][]): Promise<void>;
  rejectQuestion(requestId: string): Promise<void>;
}

export class QuestionDockCoordinator {
  render(): void;
  clearPendingQuestionsForTab(tabId?: TabId | null): void;
  refreshPendingQuestionsForTab(tabId: TabId | null, sessionId?: string | null): Promise<QuestionRequest[]>;
  waitForDockResolutionIfEnabled(request: QuestionRequest, tabId?: TabId | null): Promise<boolean>;
}
```

## 关键行为

### pending-question refresh

- `refreshPendingQuestionsForTab()` 先按 `sessionId` 过滤服务端 pending question，再去掉本地已经标记 resolved、但服务端尚未移除的 request
- 如果某个 request 仍被上方 dock waiter 持有，即使当前 refresh 没再返回它，也会保留在 tab runtime，避免提交/拒绝中的 UI 被服务端短暂快照抹掉
- resolved-id suppression、waiter-owned request 合并、draft answer normalization 与 stale draft/group/index pruning 现在统一委托给 `QuestionPendingRefreshRuntimeFacade`
- active tab refresh 完成后会立即重绘 dock；后台 tab 只更新 `needsAttention`

### 上方 dock render / resolution

- `render()` 会检查 `questionCardPosition === 'above_input'`、active tab、active request 与当前 conversation session 是否一致，不满足时统一回退到空 dock
- dock callback 组合与空 dock payload 现在由 `QuestionDockRenderAdapter` 统一产出；draft answer 规范化/sanitize、active group 与 active question index 写回继续由 `QuestionDockInteractionState` 承接
- waiter 创建、request 入队/出队与对应 runtime map 清理由 `QuestionDockQueueRuntimeFacade` 承接，真实 DOM 渲染仍由 `QuestionDock` 完成
- 提交/拒绝成功后，coordinator 会经由 `QuestionResolutionWritebackFacade` 先写 resolved suppression/state，再在 follow-up 前移除 pending request 与重绘 dock，最后把 session status refresh / sync loop / visible background sync follow-up 交给共享的 `QuestionPostResolutionRuntimeFacade`

## 与 `OpenCodianView` 的边界

- `OpenCodianView` 不再直接持有 `QuestionDock` slot lifecycle；这部分 UI ownership 现在由 `QuestionDockSlotCoordinator` 负责，而 question dock/pending question 的主要 orchestration 继续留在本 coordinator
- `BackgroundTaskPostSyncCoordinator` 与 `TabConversationStateBridge` 仍需要 pending-question refresh / clear，但现在会经由同一份 question runtime bundle 调用本 service，而不是继续走 view 内单独 forwarding 方法
- `QuestionInlineCardRenderer` 继续负责 inline 提问 UI；dock 未接管时的 inline resolve orchestration 由 `QuestionResolutionFlowCoordinator` 处理，并与 dock 一样经由 `QuestionResolutionWritebackFacade` 标记 resolved-request suppression 与 resolved state
- dock queue 的 waiter / enqueue / remove runtime map 维护现在由 `QuestionDockQueueRuntimeFacade` 承接，dock interaction map 写回由 `QuestionDockInteractionState` 承接，dock render payload 组合由 `QuestionDockRenderAdapter` 承接，pending-question refresh 的 resolved-state / stale-state 维护继续由 `QuestionPendingRefreshRuntimeFacade` 承接，本模块只保留 fetch/session-filter、attention 与 dock render 决策
- dock resolve 后的 resolved-state 写回现在与 inline fallback 共用 `QuestionResolutionWritebackFacade`，最终 runtime 收尾仍由 `QuestionPostResolutionRuntimeFacade` 处理，本模块不再单独持有 suppression/status/sync follow-up 细节

# QuestionDockCoordinator

> **源码**: `src/features/chat/services/QuestionDockCoordinator.ts`
> **状态**: [REVIEW]

## 概述

`QuestionDockCoordinator` 把 `OpenCodianView` 中与上方 question dock 相关的 **pending-question API refresh、dock 渲染回调，以及 dock 回答/拒绝流程** 收束到一个 dedicated service，专门负责：

- 管理每个 tab 的 dock waiter 生命周期，并把 pending refresh 期间的 queue / resolved-id / draft runtime map 维护委托给 `QuestionPendingRefreshRuntimeFacade`
- 把 `OpenCodeService.getPendingQuestions()` 的结果过滤到当前 session，并保留仍在等待上方 dock 回答的 request
- 组装 `QuestionDock` 的 render state / callbacks，处理 group 切换、单题/多题显示模式和 answer sanitize
- 在上方 dock 提交或拒绝问题后，统一执行 `replyToQuestion()` / `rejectQuestion()`、resolved state bridge，并把 runtime follow-up 委托给共享的 `QuestionPostResolutionRuntimeFacade`

它不负责 inline question card 的 DOM 渲染、answered/rejected 回顾卡片、pending refresh runtime map 维护，或 resolve 后的 status/sync follow-up；这些仍分别由 `QuestionInlineCardRenderer`、`QuestionResolutionCoordinator`、`QuestionPendingRefreshRuntimeFacade` 与 `QuestionPostResolutionRuntimeFacade` 负责。它的 host 装配现在通常由 `QuestionRuntimeHostAdapter` 统一提供。

## 公开接口

```typescript
export interface QuestionDockCoordinatorHost {
  getTabRuntimeState(tabId: TabId | null): QuestionDockCoordinatorRuntimeState | null;
  ensureTabRuntimeState(tabId: TabId | null): QuestionDockCoordinatorRuntimeState | null;
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
  applyResolvedQuestionState(resolution: QuestionResolution, tabId: TabId | null): void;
}

export class QuestionDockCoordinator {
  render(): void;
  clearPendingQuestionsForTab(tabId?: TabId | null): void;
  refreshPendingQuestionsForTab(tabId: TabId | null, sessionId?: string | null): Promise<QuestionRequest[]>;
  markQuestionRequestResolved(requestId: string, tabId?: TabId | null): void;
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
- dock callback 里维护 draft answer、active group 与 active question index；真实 DOM 渲染仍由 `QuestionDock` 完成
- 提交/拒绝成功后，coordinator 会统一调用 `QuestionResolutionCoordinator` host bridge，并把 session status refresh / sync loop / visible background sync follow-up 交给共享的 `QuestionPostResolutionRuntimeFacade`

## 与 `OpenCodianView` 的边界

- `OpenCodianView` 不再直接持有 `QuestionDock` slot lifecycle；这部分 UI ownership 现在由 `QuestionDockSlotCoordinator` 负责，而 question dock/pending question 的主要 orchestration 继续留在本 coordinator
- `BackgroundTaskPostSyncCoordinator` 与 `TabConversationStateBridge` 仍需要 pending-question refresh / clear，但现在会经由同一份 question runtime bundle 调用本 service，而不是继续走 view 内单独 forwarding 方法
- `QuestionInlineCardRenderer` 继续负责 inline 提问 UI；dock 未接管时的 inline resolve orchestration 现在改由 `QuestionResolutionFlowCoordinator` 统一调用 `markQuestionRequestResolved()` 与 `QuestionResolutionCoordinator`
- pending-question refresh 的 tab runtime map 维护现在由 `QuestionPendingRefreshRuntimeFacade` 承接，本模块只保留 fetch/session-filter、attention 与 dock render 决策
- dock resolve 后的 runtime 收尾现在与 inline fallback 共用 `QuestionPostResolutionRuntimeFacade`，本模块不再单独持有 sync/status follow-up 细节

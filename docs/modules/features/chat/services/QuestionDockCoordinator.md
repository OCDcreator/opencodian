# QuestionDockCoordinator

> **源码**: `src/features/chat/services/QuestionDockCoordinator.ts`
> **状态**: [REVIEW]

## 概述

`QuestionDockCoordinator` 把 `OpenCodianView` 中与上方 question dock 相关的 **pending-question 队列、草稿答案、dock 渲染回调、server refresh，以及回答/拒绝后的 follow-up 编排** 收束到一个 dedicated service，专门负责：

- 管理每个 tab 的 `pendingQuestionRequests`、`resolvedQuestionRequestIds`、draft answers、active group/index 与 waiter 生命周期
- 把 `OpenCodeService.getPendingQuestions()` 的结果过滤到当前 session，并保留仍在等待上方 dock 回答的 request
- 组装 `QuestionDock` 的 render state / callbacks，处理 group 切换、单题/多题显示模式和 answer sanitize
- 在上方 dock 提交或拒绝问题后，统一执行 `replyToQuestion()` / `rejectQuestion()`、resolved state bridge、status refresh 与 visible-conversation sync follow-up

它不负责 inline question card 的 DOM 渲染，也不负责 answered/rejected 回顾卡片；这些仍分别由 `QuestionInlineCardRenderer` 与 `QuestionResolutionCoordinator` 负责。它的 host 装配现在通常由 `QuestionRuntimeHostAdapter` 统一提供。

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
  refreshTabSessionStatus(...): Promise<unknown>;
  startConversationSyncLoop(): void;
  syncVisibleConversationInBackground(): Promise<void>;
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
- active tab refresh 完成后会立即重绘 dock；后台 tab 只更新 `needsAttention`

### 上方 dock render / resolution

- `render()` 会检查 `questionCardPosition === 'above_input'`、active tab、active request 与当前 conversation session 是否一致，不满足时统一回退到空 dock
- dock callback 里维护 draft answer、active group 与 active question index；真实 DOM 渲染仍由 `QuestionDock` 完成
- 提交/拒绝成功后，coordinator 会统一调用 `QuestionResolutionCoordinator` host bridge、刷新 session status、重启 conversation sync loop，并在当前 tab 非 streaming 时触发 visible background sync

## 与 `OpenCodianView` 的边界

- `OpenCodianView` 仍实例化 `QuestionDock` 并保存 tab runtime 字段，但 question dock/pending question 的主要 orchestration 已迁到 `QuestionDockCoordinator`，其 host 也由 `QuestionRuntimeHostAdapter` 统一装配
- `BackgroundTaskPostSyncCoordinator` 与 `TabConversationStateBridge` 仍需要 pending-question refresh / clear，但现在会经由同一份 question runtime bundle 调用本 service，而不是继续走 view 内单独 forwarding 方法
- `QuestionInlineCardRenderer` 继续负责 inline 提问 UI；inline resolve 仍经由 view 调用 `markQuestionRequestResolved()` 与 `QuestionResolutionCoordinator`

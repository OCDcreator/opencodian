# BackgroundTaskLiveSignalCoordinator

> **源码**: `src/features/chat/services/BackgroundTaskLiveSignalCoordinator.ts`
> **状态**: [REVIEW]

## 概述

`BackgroundTaskLiveSignalCoordinator` 把 `OpenCodianView` 里 background task live-signal reconciliation 与 authoritative-sync gate runtime bridge 独立出来，专门负责：

- 统一维护 `backgroundTaskAwaitingAuthoritativeSync` / `backgroundTaskLastAuthoritativeSyncAt` 的 arm、clear 与 ready 过渡
- 统一维护 background-task indicator 的 live/grace-period 运行态判定，回答某个 tab 当前是否仍应算作 background-task running
- 在 session todo/status live signal 到来时，根据 hydration、authoritative-sync、grace period 与 pending launch 状态决定是否继续保留 indicator
- 当后台任务已经明显 stale 时，协调 stopped notice 追加请求与 indicator reset 的触发时机

它不负责 inline panel DOM 渲染或 post-sync completion notice 编排；这些能力现在由 `BackgroundTaskInlinePanelRenderer`、`BackgroundTaskIndicatorCoordinator`、`BackgroundConversationPostSyncHandoffCoordinator` 和 `BackgroundTaskCompletionNoticeService` 分别承接。它会直接组合 `SessionTodoStateService`、`BackgroundTaskTimelineService` 与 `BackgroundTaskNoticeStateService` 来完成 stale follow-up，而不是再通过 `OpenCodianView` 转发这组 callback。`OpenCodianView` 与本模块之间的 host assembly 现在直接由本模块导出的 `createBackgroundTaskLiveSignalCoordinatorHost()` 承接。

## 公开接口

```typescript
export interface BackgroundTaskLiveSignalCoordinatorHost {
  getTabRuntimeState(tabId: TabId | null): BackgroundTaskLiveSignalRuntime | null;
  getSessionIdForTab(tabId: TabId | null): string | null;
  getTabSessionStatus(tabId: TabId | null, sessionId: string | null): SessionActivityStatus | null;
  syncTabStreamLikeState(tabId: TabId | null): void;
  resetBackgroundTaskIndicator(tabId: TabId | null): void;
}

export class BackgroundTaskLiveSignalCoordinator {
  hasIndicator(...): boolean;
  armAuthoritativeSyncGate(...): void;
  clearAuthoritativeSyncGate(...): void;
  markAuthoritativeSync(...): void;
  reconcileStateFromLiveSignals(...): void;
}
```

## 关键行为

### authoritative-sync gate

- `armAuthoritativeSyncGate()` 在 hydration、search-mode user injection 和 task tool live update 之后重新挂起 authoritative-sync gate
- `clearAuthoritativeSyncGate()` 在 runtime reset / conversation-derived state rebuild 前清掉旧 gate，避免沿用失效的 sync timestamp
- `markAuthoritativeSync()` 只有在当前 tab 仍等待权威同步、且不处于 hydration 时才会落下 gate 并写入最新 ready 时间

### indicator running predicate

- `hasIndicator()` 现在集中复用 `backgroundTaskStartedAt`、pending launch、session status / todos 与 search-mode runtime，统一回答 tab badge / stream finalize 是否还应把该 tab 视为 background-task running
- grace period 计时不再由 `OpenCodianView` 额外保留一个私有 helper，而是作为 live-signal coordinator 的内部运行时规则，与后续 stale downgrade 判定共用同一份 started-at 语义

### live-signal reconciliation

- `reconcileStateFromLiveSignals()` 会先直接复用 `SessionTodoStateService` 的 stale todo 协调，再通过 `BackgroundTaskTimelineService` 查询 pending launch，并在需要时调用 `BackgroundTaskNoticeStateService` 追加 stopped notice
- 当 session 仍 busy/retry，或仍有未完成 todo 且尚未 idle 时，coordinator 只更新 `backgroundTaskWaitingForFollowUp` 并刷新 tab stream-like UI
- 只有在 authoritative-sync gate 已落下、grace period 已结束、且 pending launch 仍未完成时，才会触发 stopped notice 请求并清空 indicator

## 与 `OpenCodianView` 的边界

- `SessionTodoStateService` 负责 session todo/status runtime 与 stale todo suppression；live-signal coordinator 直接复用它的 incomplete/stale 判定
- `BackgroundTaskTimelineService` 负责 background task segment/timeline 推导，并向 live-signal coordinator 提供 pending launch 查询
- `BackgroundTaskNoticeStateService` 负责 stopped/stale notice 的 content、fingerprint 与 persisted dedupe；live-signal coordinator 直接调用它落地 stale follow-up notice
- `BackgroundTaskInlinePanelRenderer` 负责 inline panel DOM 渲染
- `BackgroundTaskIndicatorCoordinator` 现在直接复用本模块的 foreground live-signal reconcile，再串联 inline render、completion notice queue/flush 与 tab runtime UI 写回
- `ConversationSessionSignalRuntime` 在 session todo/status live update 写入 tab runtime 后直接调用本模块，不再经由 `OpenCodianView` host callback 转发 reconcile
- `OpenCodianView` 只保留扁平的 tab runtime / session lookup / view writeback seam；grouped host assembly 已并回 `BackgroundTaskLiveSignalCoordinator` 模块自身的 host builder
- `OpenCodianView` 只保留 tab runtime、session status 与主动刷新后的上层触发入口；foreground indicator lane 与 live listener lane 都不再经由 view wrapper 转发 reconcile callback
- `BackgroundConversationPostSyncHandoffCoordinator` 负责 hidden signal/background-tab sync 后的 question/todo/background-task post-sync handoff
- `BackgroundTaskLiveSignalCoordinator` 现在同时负责 authoritative-sync runtime gate、indicator running predicate 与 live-signal reconciliation 决策
- 这让 P2 `question / todo / background task` lane 继续把 background task 的运行时判定从主 view 迁到 dedicated coordinator，而不是把这段状态机继续留在 `OpenCodianView`

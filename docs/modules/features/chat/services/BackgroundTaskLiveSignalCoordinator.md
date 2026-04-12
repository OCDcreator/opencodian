# BackgroundTaskLiveSignalCoordinator

> **源码**: `src/features/chat/services/BackgroundTaskLiveSignalCoordinator.ts`
> **状态**: [REVIEW]

## 概述

`BackgroundTaskLiveSignalCoordinator` 把 `OpenCodianView` 里 background task live-signal reconciliation 与 authoritative-sync gate runtime bridge 独立出来，专门负责：

- 统一维护 `backgroundTaskAwaitingAuthoritativeSync` / `backgroundTaskLastAuthoritativeSyncAt` 的 arm、clear 与 ready 过渡
- 在 session todo/status live signal 到来时，根据 hydration、authoritative-sync、grace period 与 pending launch 状态决定是否继续保留 indicator
- 当后台任务已经明显 stale 时，协调 stopped notice 追加请求与 indicator reset 的触发时机

它不负责 background task timeline 推导、inline panel DOM 渲染、post-sync completion notice 编排，也不直接操作 notice 内容；这些能力现在由 `BackgroundTaskTimelineService`、`BackgroundTaskInlinePanelRenderer`、`BackgroundTaskPostSyncCoordinator`、`BackgroundTaskNoticeStateService` 和 `BackgroundTaskCompletionNoticeService` 分别承接。

## 公开接口

```typescript
export interface BackgroundTaskLiveSignalCoordinatorHost {
  getTabRuntimeState(tabId: TabId | null): BackgroundTaskLiveSignalRuntime | null;
  getSessionIdForTab(tabId: TabId | null): string | null;
  getTabSessionStatus(tabId: TabId | null, sessionId: string | null): SessionActivityStatus | null;
  hasIncompleteTabSessionTodos(tabId: TabId | null): boolean;
  isBackgroundTaskGracePeriodActive(tabId: TabId | null): boolean;
  getPendingBackgroundTaskLaunches(tabId: TabId | null): BackgroundTaskLiveSignalLaunchInfo[];
  reconcileStaleSessionTodoState(tabId: TabId | null): void;
  syncTabStreamLikeState(tabId: TabId | null): void;
  appendBackgroundTaskStoppedNotice(...): Promise<void>;
  resetBackgroundTaskIndicator(tabId: TabId | null): void;
}

export class BackgroundTaskLiveSignalCoordinator {
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

### live-signal reconciliation

- `reconcileStateFromLiveSignals()` 先复用 `SessionTodoStateService` 的 stale todo 协调，再根据 session status、todo 完成度和 grace period 判断 background task 是否仍应显示为 running
- 当 session 仍 busy/retry，或仍有未完成 todo 且尚未 idle 时，coordinator 只更新 `backgroundTaskWaitingForFollowUp` 并刷新 tab stream-like UI
- 只有在 authoritative-sync gate 已落下、grace period 已结束、且 pending launch 仍未完成时，才会触发 stopped notice 请求并清空 indicator

## 与 `OpenCodianView` 的边界

- `BackgroundTaskTimelineService` 负责 background task segment/timeline 推导
- `BackgroundTaskInlinePanelRenderer` 负责 inline panel DOM 渲染
- `OpenCodianView` 负责具体 notice / reset host bridge，以及这组 background-task helper 的上层触发
- `BackgroundTaskPostSyncCoordinator` 负责 hidden signal/background-tab sync 后的 question/todo/background-task post-sync orchestration
- `BackgroundTaskLiveSignalCoordinator` 只负责 authoritative-sync runtime gate 与 live-signal reconciliation 决策
- 这让 P2 `question / todo / background task` lane 继续把 background task 的运行时判定从主 view 迁到 dedicated coordinator，而不是把这段状态机继续留在 `OpenCodianView`

# BackgroundTaskIndicatorCoordinator

> **源码**: `src/features/chat/runtime/BackgroundTaskIndicatorCoordinator.ts`
> **状态**: [REVIEW]

## 概述

`BackgroundTaskIndicatorCoordinator` 是 background-task lane 的 indicator render/runtime coordinator。它把 `OpenCodianView.renderBackgroundTaskIndicatorIfNeeded()` 里原本内联的 live-signal reconcile、inline panel render、completion notice queue/flush 与 tab stream-like sync 编排收束成一个 dedicated runtime boundary。

本轮之后，它不再通过 `OpenCodianView` callback bridge 转发 foreground live-signal reconcile 或 stream-like UI sync，而是直接组合 `BackgroundTaskLiveSignalCoordinator` 与 `TabRuntimeStateBridge`。

## 公开接口

```typescript
export interface BackgroundTaskIndicatorCoordinatorHost {
  getActiveTabId(): TabId | null;
  getCurrentConversation(): Conversation | null;
  hasTabRuntime(tabId: TabId | null): boolean;
}

export class BackgroundTaskIndicatorCoordinator {
  renderIfNeeded(...): Promise<void>;
  queueAndFlushCompletionNotices(...): Promise<void>;
}
```

## 关键行为

- `renderIfNeeded()` 先确认目标 tab runtime 仍存在，再直接调用 `BackgroundTaskLiveSignalCoordinator.reconcileStateFromLiveSignals()`、`BackgroundTaskInlinePanelRenderer.render()`、completion notice queue/flush，以及 `TabRuntimeStateBridge.syncStreamLikeState()`
- `queueAndFlushCompletionNotices()` 复用 `BackgroundTaskTimelineService.collectSegments()` 收集 completion events，再把 queue/flush 顺序集中交给 `BackgroundTaskCompletionNoticeService`
- 当 conversation 不可用时，completion notice refresh 会 no-op；inline panel render 仍可在 `renderIfNeeded()` 中收到 `null` conversation 并清理 stale panel
- streaming tool-call start/end 与 primary-stream finalize 触发不再由本 coordinator 负责，而是交给 `BackgroundTaskStreamTriggerCoordinator`，本模块只保留 render/notice/sync 顺序

## 与 `OpenCodianView` 的边界

- `OpenCodianView` 只保留 active tab / current conversation / runtime presence 这类更薄的 host bridge 与 `renderBackgroundTaskIndicatorIfNeeded()` 入口，不再转发 foreground live-signal reconcile 或 stream-like sync callback
- `BackgroundTaskInlinePanelRenderer` 继续只负责 mounted inline panel 的 DOM 生命周期
- `BackgroundTaskCompletionNoticeService` 继续只负责 queued notice state、content/fingerprint 与 persisted append/dedupe
- `BackgroundTaskLiveSignalCoordinator` 负责 foreground live-signal reconcile 决策，供本 coordinator 直接复用
- `TabRuntimeStateBridge` 负责 foreground render 结束后的 tab badge / send-button / rewind-fork 状态写回
- `BackgroundTaskStreamTriggerCoordinator` 负责把 stream-side tool-call / finalize 触发折叠成对本 coordinator 的 `renderIfNeeded()` 调用
- `BackgroundTaskPostSyncCoordinator` 现在通过本 coordinator 的 `queueAndFlushCompletionNotices()` 刷新 completion notices，避免 post-sync host 继续暴露分散的 queue/flush 回调
- 这让 P2 `question / todo / background task` lane 继续把 background-task runtime/UI orchestration 从主 view 下沉到可单测边界，而不是回到 paused trailing-assistant helper chain

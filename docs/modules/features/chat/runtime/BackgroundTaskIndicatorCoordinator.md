# BackgroundTaskIndicatorCoordinator

> **源码**: `src/features/chat/runtime/BackgroundTaskIndicatorCoordinator.ts`
> **状态**: [REVIEW]

## 概述

`BackgroundTaskIndicatorCoordinator` 是 background-task lane 的 indicator runtime coordinator。它把 `OpenCodianView.renderBackgroundTaskIndicatorIfNeeded()` 里原本内联的 live-signal reconcile、inline panel render、completion notice queue/flush 与 tab stream-like sync 编排收束成一个 dedicated runtime boundary。

## 公开接口

```typescript
export interface BackgroundTaskIndicatorCoordinatorHost {
  getActiveTabId(): TabId | null;
  getCurrentConversation(): Conversation | null;
  getTabRuntimeState(tabId: TabId | null): object | null;
  reconcileBackgroundTaskStateFromLiveSignals(tabId: TabId | null): void;
  syncTabStreamLikeState(tabId: TabId | null): void;
}

export class BackgroundTaskIndicatorCoordinator {
  renderIfNeeded(...): Promise<void>;
  queueAndFlushCompletionNotices(...): Promise<void>;
}
```

## 关键行为

- `renderIfNeeded()` 先确认目标 tab runtime 仍存在，再触发 live-signal reconcile、`BackgroundTaskInlinePanelRenderer.render()`、completion notice queue/flush，以及 tab stream-like 状态刷新
- `queueAndFlushCompletionNotices()` 复用 `BackgroundTaskTimelineService.collectSegments()` 收集 completion events，再把 queue/flush 顺序集中交给 `BackgroundTaskCompletionNoticeService`
- 当 conversation 不可用时，completion notice refresh 会 no-op；inline panel render 仍可在 `renderIfNeeded()` 中收到 `null` conversation 并清理 stale panel

## 与 `OpenCodianView` 的边界

- `OpenCodianView` 只保留 host bridge 与 `renderBackgroundTaskIndicatorIfNeeded()` 入口，不再直接编排 inline render 与 completion notice queue/flush 顺序
- `BackgroundTaskInlinePanelRenderer` 继续只负责 mounted inline panel 的 DOM 生命周期
- `BackgroundTaskCompletionNoticeService` 继续只负责 queued notice state、content/fingerprint 与 persisted append/dedupe
- `BackgroundTaskPostSyncCoordinator` 现在通过本 coordinator 的 `queueAndFlushCompletionNotices()` 刷新 completion notices，避免 post-sync host 继续暴露分散的 queue/flush 回调
- 这让 P2 `question / todo / background task` lane 继续把 background-task runtime/UI orchestration 从主 view 下沉到可单测边界，而不是回到 paused trailing-assistant helper chain

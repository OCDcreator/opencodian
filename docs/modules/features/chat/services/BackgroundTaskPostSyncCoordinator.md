# BackgroundTaskPostSyncCoordinator

> **源码**: `src/features/chat/services/BackgroundTaskPostSyncCoordinator.ts`
> **状态**: [REVIEW]

## 概述

`BackgroundTaskPostSyncCoordinator` 把 `OpenCodianView` 里 hidden signal sync / background-tab sync 完成后的 background-task 收尾编排独立出来，专门负责：

- 在 signal sync 完成后落下 background task authoritative-sync ready 标记
- 刷新 pending question、session todo/status live state
- 调用 view 侧 background task timeline rebuild host bridge
- 协调 completion notice queue/flush 与 tab stream-like 状态刷新
- 根据 sync fingerprint 变化标记后台 tab attention

它不负责 background task segment/timeline 推导，也不负责 inline panel DOM 渲染；这些仍保留在 `OpenCodianView`，并通过 host bridge 被 post-sync coordinator 调用。

## 公开接口

```typescript
export interface BackgroundTaskPostSyncCoordinatorHost {
  getTabRuntimeState(tabId: TabId | null): BackgroundTaskPostSyncRuntime | null;
  hasIncompleteTodos(todos: readonly SessionTodo[]): boolean;
  markBackgroundTaskAuthoritativeSync(tabId: TabId | null, reason: string): void;
  refreshPendingQuestionsForTab(...): Promise<QuestionRequest[]>;
  syncBackgroundTaskStateFromConversation(...): void;
  refreshTabSessionStatus(...): Promise<SessionActivityStatus | null>;
  refreshTabSessionTodos(...): Promise<SessionTodo[]>;
  queueBackgroundTaskCompletionNotices(...): Promise<void>;
  flushQueuedBackgroundTaskCompletionNotices(...): Promise<void>;
  syncTabStreamLikeState(tabId: TabId | null): void;
  setTabNeedsAttention(tabId: TabId | null, needsAttention: boolean): void;
}

export class BackgroundTaskPostSyncCoordinator {
  handleSignalSyncComplete(...): Promise<void>;
  handleBackgroundTabSyncComplete(...): Promise<void>;
}
```

## 关键行为

### signal sync 收尾

- `handleSignalSyncComplete()` 保留原有 signal-sync authoritative mark，随后统一执行 question refresh、background task rebuild、todo/status refresh、completion notice queue/flush 和 tab stream-like refresh
- 只有 sync result changed 或 fingerprint 相对上一轮变化时，才更新 tab attention；如果目标 tab 不是当前 active tab，则标记为需要关注

### background-tab sync 收尾

- `handleBackgroundTabSyncComplete()` 面向已有 background-task indicator 的后台 tab，固定刷新 todo/status live state，避免后台任务完成后状态停留在旧快照
- 同样复用 fingerprint 判断 attention，变化时把后台 tab 标为需要关注

## 与 `OpenCodianView` 的边界

- `OpenCodianView` 仍负责 conversation sync 的发起、background task segment/timeline 推导、inline panel DOM 渲染，以及 completion notice segment 的收集实现
- `BackgroundTaskPostSyncCoordinator` 只负责 hidden signal/background-tab sync 之后的跨 question/todo/background-task service 编排
- 这让 P2 `question / todo / background task` lane 把后台同步后的运行时收尾 ownership 从主 view 迁到 dedicated coordinator，而不是继续散落在 `syncConversationFromSignal()` 和 `syncBackgroundTaskTabsInBackground()` 中

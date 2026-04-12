# BackgroundTaskPostSyncCoordinator

> **源码**: `src/features/chat/services/BackgroundTaskPostSyncCoordinator.ts`
> **状态**: [REVIEW]

## 概述

`BackgroundTaskPostSyncCoordinator` 把原本散落在 `OpenCodianView`、现在经由 `ConversationSyncBridge` 汇入的 hidden signal sync / background-tab sync / active visible-conversation background sync 收尾编排独立出来，专门负责：

- 在 signal sync 完成后落下 background task authoritative-sync ready 标记
- 刷新 pending question、session todo/status live state
- 判定 visible background sync 完成后当前 conversation 是否仍然匹配发起同步时的 active conversation
- 在 visible background sync 仍命中当前 conversation 时提交 `currentConversationRevertState` 与 active-tab sync fingerprint
- 调用 background task timeline rebuild host bridge
- 协调 completion notice queue/flush 与 tab stream-like 状态刷新
- 根据 sync fingerprint 变化标记后台 tab attention

它不负责 background task segment/timeline 推导，也不负责 inline panel DOM 渲染；这些现在分别由 `BackgroundTaskTimelineService` 和 `BackgroundTaskInlinePanelRenderer` 承接，并通过 host bridge 被 post-sync coordinator 调用。

## 公开接口

```typescript
export interface BackgroundTaskPostSyncCoordinatorHost {
  getCurrentConversationId(): string | null;
  getCurrentConversationSessionId(): string | undefined;
  getTabRuntimeState(tabId: TabId | null): BackgroundTaskPostSyncRuntime | null;
  hasIncompleteTodos(todos: readonly SessionTodo[]): boolean;
  setCurrentConversationRevertState(...): void;
  setTabConversationSyncFingerprint(...): void;
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
  handleVisibleConversationSyncComplete(...): Promise<VisibleConversationPostSyncOutcome>;
  handleSignalSyncComplete(...): Promise<void>;
  handleBackgroundTabSyncComplete(...): Promise<void>;
}
```

## 关键行为

### visible active-conversation sync 收尾

- `handleVisibleConversationSyncComplete()` 统一接手 `ConversationSyncBridge.syncVisibleConversationInBackground()` 里原本散落的 question refresh、todo/status live refresh，以及“当前 conversation 是否还是发起 sync 时那一页”的判定
- 当 visible sync 仍对应当前 conversation 时，coordinator 会顺手提交 `currentConversationRevertState`；只有 `syncResult.changed === true` 时才同步 active-tab `lastConversationSyncFingerprint`
- coordinator 继续只把 render plan 回传给 view：是否还能继续 `applySyncedConversationUpdate()`，或者应回退到 `renderBackgroundTaskIndicatorIfNeeded()`；真正的 inline panel DOM 渲染则由 `BackgroundTaskInlinePanelRenderer` 执行
- todo/status refresh 仍沿用既有 runtime gate：只有存在 incomplete todos、pending background-task launch 或 waiting-for-follow-up 时才会主动刷新

### signal sync 收尾

- `handleSignalSyncComplete()` 保留原有 signal-sync authoritative mark，随后统一执行 question refresh、background task rebuild、todo/status refresh、completion notice queue/flush 和 tab stream-like refresh
- 只有 sync result changed 或 fingerprint 相对上一轮变化时，才更新 tab attention；如果目标 tab 不是当前 active tab，则标记为需要关注

### background-tab sync 收尾

- `handleBackgroundTabSyncComplete()` 面向已有 background-task indicator 的后台 tab，固定刷新 todo/status live state，避免后台任务完成后状态停留在旧快照
- 同样复用 fingerprint 判断 attention，变化时把后台 tab 标为需要关注

## 与 `OpenCodianView` 的边界

- `OpenCodianView` 负责把 timeline rebuild / inline-panel render / notice queue host bridge 接到各个 background-task helper
- `BackgroundTaskTimelineService` 负责 background task segment/timeline 推导，以及 completion notice 所需的 segment 收集
- `BackgroundTaskInlinePanelRenderer` 负责 inline panel DOM 渲染与 mounted panel 生命周期
- `ConversationSyncBridge` 负责把 visible/signal/background sync 的 server-sync 结果统一路由到 post-sync coordinator 和 view render host
- `BackgroundTaskPostSyncCoordinator` 负责 hidden signal/background-tab sync，以及 active visible-conversation background sync 之后的跨 question/todo/background-task service 编排
- 这让本轮继续沿着 master-plan 的 `OpenCodianView` sync orchestration ownership 迁移，把后台同步后的 question/todo/background-task 收尾，以及 visible sync 的 state-commit 判定，稳定留在 dedicated coordinator，而不是继续散落在 view 的多个 sync 入口中

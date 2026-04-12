# BackgroundTaskPostSyncCoordinator

> **源码**: `src/features/chat/services/BackgroundTaskPostSyncCoordinator.ts`
> **状态**: [REVIEW]

## 概述

`BackgroundTaskPostSyncCoordinator` 把原本散落在 `OpenCodianView`、现在经由 `ConversationSyncBridge` 汇入的 hidden signal sync / background-tab sync / active visible-conversation background sync 收尾编排独立出来，专门负责：

- 在 signal sync 完成后落下 background task authoritative-sync ready 标记
- 委托 `PostSyncQuestionTodoRefreshFacade` 执行 question / todo / background-task refresh 收尾
- 判定 visible background sync 完成后当前 conversation 是否仍然匹配发起同步时的 active conversation
- 在 visible background sync 仍命中当前 conversation 时提交 `currentConversationRevertState` 与 active-tab sync fingerprint
- 根据 sync fingerprint 变化标记后台 tab attention

它不负责 background task segment/timeline 推导，也不负责 inline panel DOM 渲染；这些现在分别由 `BackgroundTaskTimelineService` 和 `BackgroundTaskInlinePanelRenderer` 承接。completion notice 的 queue/flush 顺序也不再由本 coordinator 拆开编排，而是通过 `PostSyncQuestionTodoRefreshFacade` 统一接在组合刷新之后。signal/background-tab 到 todo/status 强制刷新布尔值的映射也交给 facade，coordinator 只传递同步来源与必要的 signal metadata。pending-question 与 todo/status 组合刷新顺序本身则继续委托给 `QuestionTodoStatusRefreshCoordinator`。它的 host 装配现在通常由 `QuestionTodoBackgroundTaskRefreshHostAdapter` 统一提供。

## 公开接口

```typescript
export interface BackgroundTaskPostSyncCoordinatorHost {
  getCurrentConversationId(): string | null;
  setCurrentConversationRevertState(...): void;
  setTabConversationSyncFingerprint(...): void;
  markBackgroundTaskAuthoritativeSync(tabId: TabId | null, reason: string): void;
  setTabNeedsAttention(tabId: TabId | null, needsAttention: boolean): void;
}

export class BackgroundTaskPostSyncCoordinator {
  constructor(host: BackgroundTaskPostSyncCoordinatorHost, postSyncQuestionTodoRefreshFacade: PostSyncQuestionTodoRefreshPort);
  handleVisibleConversationSyncComplete(...): Promise<VisibleConversationPostSyncOutcome>;
  handleSignalSyncComplete(...): Promise<void>;
  handleBackgroundTabSyncComplete(...): Promise<void>;
}
```

## 关键行为

### visible active-conversation sync 收尾

- `handleVisibleConversationSyncComplete()` 统一接手 `ConversationSyncBridge.syncVisibleConversationInBackground()` 里原本散落的 post-sync 收尾，并把 visible sync 的 question/todo refresh session 配对委托给 `PostSyncQuestionTodoRefreshFacade`
- 当 visible sync 仍对应当前 conversation 时，coordinator 会顺手提交 `currentConversationRevertState`；只有 `syncResult.changed === true` 时才同步 active-tab `lastConversationSyncFingerprint`
- coordinator 继续只把 render plan 回传给 view：是否还能继续 `applySyncedConversationUpdate()`，或者应回退到 `renderBackgroundTaskIndicatorIfNeeded()`；真正的 inline panel DOM 渲染则由 `BackgroundTaskInlinePanelRenderer` 执行
- todo/status refresh 的 runtime gate 现在由 `QuestionTodoStatusRefreshCoordinator` 承接：只有存在 incomplete todos、pending background-task launch 或 waiting-for-follow-up 时才会主动刷新

### signal sync 收尾

- `handleSignalSyncComplete()` 保留原有 signal-sync authoritative mark，随后把 `signal-sync` refresh policy 与 `tabHasBackgroundTask` 交给 `PostSyncQuestionTodoRefreshFacade`，再执行 pending-question refresh → background task rebuild hook → todo/status refresh → completion notice / stream-like sync
- 只有 sync result changed 或 fingerprint 相对上一轮变化时，才更新 tab attention；如果目标 tab 不是当前 active tab，则标记为需要关注

### background-tab sync 收尾

- `handleBackgroundTabSyncComplete()` 面向已有 background-task indicator 的后台 tab，把 `background-tab` refresh policy 交给 `PostSyncQuestionTodoRefreshFacade`，由 facade 固定刷新 todo/status live state，避免后台任务完成后状态停留在旧快照
- 同样复用 `PostSyncQuestionTodoRefreshFacade` 的 refresh 顺序和 fingerprint 判断 attention，变化时把后台 tab 标为需要关注

## 与 `OpenCodianView` 的边界

- `OpenCodianView` 现在通过 `QuestionTodoBackgroundTaskRefreshHostAdapter` 把 visible sync state-commit、authoritative mark 与 attention host bridge 接到本 coordinator
- `BackgroundTaskTimelineService` 负责 background task segment/timeline 推导，以及 completion notice 所需的 segment 收集
- `BackgroundTaskInlinePanelRenderer` 负责 inline panel DOM 渲染与 mounted panel 生命周期
- `BackgroundTaskIndicatorCoordinator` 负责 inline render 场景和 post-sync 场景共用的 completion notice queue/flush 顺序
- `PostSyncQuestionTodoRefreshFacade` 负责把 question/todo refresh、background-task rebuild、completion notice / stream-like follow-up，以及 signal/background-tab 的 todo/status force-refresh 策略串成共享 post-sync 边界
- `QuestionTodoStatusRefreshCoordinator` 负责 activation/post-sync 共享的 pending-question + todo/status refresh 顺序与 runtime gate
- `ConversationSyncBridge` 负责把 visible/signal/background sync 的 server-sync 结果统一路由到 post-sync coordinator 和 view render host
- `BackgroundTaskPostSyncCoordinator` 负责 hidden signal/background-tab sync，以及 active visible-conversation background sync 之后的 authoritative mark、attention 与 visible sync state-commit 判定
- 这让本轮继续沿着 master plan 的 P2 `question / todo / background task` lane，把后台同步后的组合 refresh 与 visible sync state-commit 判定拆成两个稳定边界，而不是继续散落在 view 的多个 sync 入口中

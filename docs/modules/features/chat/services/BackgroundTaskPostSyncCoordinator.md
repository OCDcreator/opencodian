# BackgroundTaskPostSyncCoordinator

> **源码**: `src/features/chat/services/BackgroundTaskPostSyncCoordinator.ts`
> **状态**: [REVIEW]

## 概述

`BackgroundTaskPostSyncCoordinator` 把原本散落在 `OpenCodianView`、现在经由 `ConversationSyncBridge` 汇入的 hidden signal sync / background-tab sync / active visible-conversation background sync 收尾编排独立出来，专门负责：

- 委托 `PostSyncQuestionTodoRefreshFacade` 执行 visible question/todo refresh，并把 background-only refresh 收尾交给 `BackgroundConversationPostSyncRefreshExecutor`
- 在 visible background sync 完成后把 current-conversation state commit 判定委托给 `VisibleConversationPostSyncStateCoordinator`
- 把 signal/background-tab sync 的 source-specific handoff 委托给 `BackgroundConversationPostSyncHandoffCoordinator`

它不负责 background task segment/timeline 推导，也不负责 inline panel DOM 渲染；这些现在分别由 `BackgroundTaskTimelineService` 和 `BackgroundTaskInlinePanelRenderer` 承接。completion notice 的 queue/flush 顺序也不再由本 coordinator 拆开编排，而是通过 `BackgroundConversationPostSyncRefreshExecutor` 统一接在 background 组合刷新之后。signal/background-tab 到 todo/status 强制刷新布尔值的映射交给 `PostSyncQuestionTodoRefreshPlanBuilder`，signal authoritative-sync state 与 attention outcome 则继续分别留在 dedicated seam 中；本 coordinator 只负责 visible current-conversation refresh/state-commit，并把 hidden/background source routing 委托给 `BackgroundConversationPostSyncHandoffCoordinator`。pending-question 与 todo/status 组合刷新顺序本身则继续委托给 `QuestionTodoStatusRefreshCoordinator`。它的 host 装配现在通常由 `QuestionTodoBackgroundTaskRefreshHostAdapter` 统一提供。

## 公开接口

```typescript
export class BackgroundTaskPostSyncCoordinator {
  constructor(...);
  handleVisibleConversationSyncComplete(...): Promise<VisibleConversationPostSyncOutcome>;
  handleSignalSyncComplete(...): Promise<void>;
  handleBackgroundTabSyncComplete(...): Promise<void>;
}
```

## 关键行为

### visible active-conversation sync 收尾

- `handleVisibleConversationSyncComplete()` 统一接手 `ConversationSyncBridge.syncVisibleConversationInBackground()` 里原本散落的 post-sync 收尾，并把 visible sync 的 question/todo refresh session 配对委托给 `PostSyncQuestionTodoRefreshFacade`
- refresh 完成后，current-conversation match、`currentConversationRevertState` 写回、active-tab `lastConversationSyncFingerprint` 更新，以及 render outcome 判定全部委托给 `VisibleConversationPostSyncStateCoordinator`
- coordinator 继续只把 render plan 回传给 view：是否还能继续 `applySyncedConversationUpdate()`，或者应回退到 `renderBackgroundTaskIndicatorIfNeeded()`；真正的 inline panel DOM 渲染则由 `BackgroundTaskInlinePanelRenderer` 执行
- todo/status refresh 的 runtime gate 现在由 `QuestionTodoStatusRefreshCoordinator` 承接：只有存在 incomplete todos、pending background-task launch 或 waiting-for-follow-up 时才会主动刷新

### signal sync 收尾

- `handleSignalSyncComplete()` 现在只把 signal 路径委托给 `BackgroundConversationPostSyncHandoffCoordinator.handleSignalSyncComplete()`
- signal authoritative mark、background refresh 与 attention outcome 顺序在 dedicated handoff seam 中保持不变，`BackgroundTaskPostSyncCoordinator` 不再直接持有 signal-specific host policy

### background-tab sync 收尾

- `handleBackgroundTabSyncComplete()` 现在只把 background-tab 路径委托给 `BackgroundConversationPostSyncHandoffCoordinator.handleBackgroundTabSyncComplete()`
- background refresh 与 attention outcome 的具体顺序改由 dedicated handoff seam 维护，`BackgroundTaskPostSyncCoordinator` 不再区分 signal/background-tab 两条 hidden source 路径的编排细节

## 与 `OpenCodianView` 的边界

- `OpenCodianView` 现在通过 `QuestionTodoBackgroundTaskRefreshHostAdapter` 把 authoritative mark host bridge 接到 `BackgroundConversationSignalSyncStateCoordinator`；attention writeback 则由 `BackgroundConversationAttentionCoordinator` 单独承接
- `VisibleConversationPostSyncStateCoordinator` 负责 visible sync 的 current-conversation state-commit 判定，避免本 coordinator 同时拥有 refresh orchestration 和 current-conversation runtime bridge 规则
- `BackgroundConversationPostSyncHandoffCoordinator` 负责 hidden/background source-specific post-sync routing，避免本 coordinator 同时拥有 visible sync orchestration 与 signal/background-tab handoff policy
- `BackgroundConversationSignalSyncStateCoordinator` 负责 signal sync 的 authoritative-sync ready writeback 与 `sync-event:*` reason 规范化，避免 hidden signal state policy 回流到本 coordinator
- `BackgroundConversationAttentionCoordinator` 负责 signal/background-tab sync 的 fingerprint 对比与 tab attention outcome，避免 background-specific state policy 回流到本 coordinator
- `BackgroundTaskTimelineService` 负责 background task segment/timeline 推导，以及 completion notice 所需的 segment 收集
- `BackgroundTaskInlinePanelRenderer` 负责 inline panel DOM 渲染与 mounted panel 生命周期
- `BackgroundTaskIndicatorCoordinator` 负责 inline render 场景和 post-sync 场景共用的 completion notice queue/flush 顺序
- `PostSyncQuestionTodoRefreshFacade` 负责 visible-conversation 的 question/todo refresh 收尾
- `BackgroundConversationPostSyncRefreshExecutor` 负责 signal/background-tab source 的 question/todo refresh、background-task rebuild 与 completion notice / stream-like follow-up 执行顺序
- `BackgroundConversationPostSyncHandoffCoordinator` 负责把 signal/background-tab source-specific handoff 串到 signal state / background refresh / attention seams 上
- `PostSyncQuestionTodoRefreshPlanBuilder` 负责 visible/background session-id 与 signal/background-tab todo/status force-refresh policy 选择
- `QuestionTodoStatusRefreshCoordinator` 负责 post-sync 的 pending-question + todo/status refresh 顺序与 runtime gate，而 activation/open 侧 supplemental refresh 由 `QuestionTodoActivationRefreshBridge` 单独承接
- `ConversationSyncBridge` 负责把 visible/signal/background sync 的 server-sync 结果统一路由到 post-sync coordinator 和 view render host
- `BackgroundTaskPostSyncCoordinator` 负责 active visible-conversation background sync 之后的 visible refresh/state-commit，以及把 hidden/background path 交给 handoff seam
- 这让本轮继续沿着 master plan 的 P2 `question / todo / background task` lane，把 visible refresh、background execution、background handoff、visible state-commit、background signal state 与 background attention 判定保持在六个稳定边界，而不是继续散落在 view 的多个 sync 入口中

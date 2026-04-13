# QuestionTodoStatusRefreshCoordinator

> **源码**: `src/features/chat/services/QuestionTodoStatusRefreshCoordinator.ts`
> **状态**: [REVIEW]

## 概述

`QuestionTodoStatusRefreshCoordinator` 把 post-sync 收尾里反复出现的 **pending question + session status + session todo** 组合刷新顺序收束成一个 dedicated coordinator。它专门负责：

- 在 visible/signal/background post-sync 后，先刷新 pending question，再执行 background-task runtime reconcile hook，最后按 runtime gate 刷新 todo/status live state
- 复用 `SessionTodoCoordinator` 的 request-id stale guard 与 `QuestionDockCoordinator` 的 pending-question state 更新，而不是在 view/bridge/coordinator host 上继续暴露三组分散 callback

它不直接调用 OpenCode API，也不拥有 question dock DOM、todo/status snapshot state、background-task timeline rebuild 或 completion notice flush；这些仍分别由 `QuestionDockCoordinator`、`SessionTodoCoordinator`、`SessionTodoStateService`、`BackgroundTaskTimelineService` 与 `PostSyncQuestionTodoRefreshFacade` 承接。activation/open 侧的 supplemental refresh 现在改由 `QuestionTodoActivationRefreshBridge` 负责。本模块只负责 post-sync 场景里的组合刷新顺序与 runtime gate。它的 host 装配现在通常由 `PostSyncQuestionTodoRefreshHostAdapter` 统一提供。

## 公开接口

```typescript
export interface QuestionTodoStatusRefreshCoordinatorHost {
  getTabRuntimeState(tabId: TabId | null): QuestionTodoStatusRefreshRuntime | null;
  hasIncompleteTodos(todos: readonly SessionTodo[]): boolean;
  refreshPendingQuestionsForTab(...): Promise<QuestionRequest[]>;
  refreshTabSessionStatus(...): Promise<SessionActivityStatus | null>;
  refreshTabSessionTodos(...): Promise<SessionTodo[]>;
}

export class QuestionTodoStatusRefreshCoordinator {
  refreshAfterPostSync(options: PostSyncQuestionTodoStatusRefreshOptions): Promise<void>;
}
```

## 关键行为

- `refreshAfterPostSync()` 保持 post-sync 语义：先等待 pending-question refresh，再运行 `afterPendingQuestionRefresh` hook，让 background-task rebuild / follow-up facade 仍能稳定发生在 todo/status gate 之前
- todo/status post-sync refresh 只有在 tab runtime 存在，且存在 incomplete todos、background-task launch、waiting-for-follow-up，或调用方强制刷新时才会执行
- visible-conversation post-sync 可把 pending-question session 与当前 todo/status session 分开传入，保留“当前 conversation 已切换时仍刷新当前 session live state”的旧行为

## 与 `OpenCodianView` 的边界

- `OpenCodianView` 现在通过 `PostSyncQuestionTodoRefreshHostAdapter` 提供 host：adapter 继续映射 tab runtime、`QuestionDockCoordinator` pending-question refresh，以及 `SessionTodoCoordinator` 暴露的 incomplete/status/todo refresh 端口
- `QuestionTodoActivationRefreshBridge` 现在负责 activation/open 侧的 status/question/todo lazy refresh，避免本 coordinator 同时承接 activation 与 post-sync 两条路径
- `PostSyncQuestionTodoRefreshFacade` 会在 signal/background sync 后复用本 coordinator，再串起 background-task rebuild、completion notice refresh 与 stream-like follow-up
- visible/background post-sync 的 state commit、authoritative mark 与 attention 判定分别由 `VisibleConversationPostSyncCoordinator`、`BackgroundConversationSignalSyncStateCoordinator` 与 `BackgroundConversationAttentionCoordinator` 承接；pending-question + todo/status refresh order 继续由本 coordinator 承接
- current-tab conversation open fast path 通过 activation bridge 复用同一条 supplemental refresh，而 post-sync gate 则继续保留在本 coordinator
- 这条边界推进的是 master plan 的 P2 `question / todo / background task` lane：把 post-sync 的组合刷新 ownership 从 view/bridge host surface 中继续下沉

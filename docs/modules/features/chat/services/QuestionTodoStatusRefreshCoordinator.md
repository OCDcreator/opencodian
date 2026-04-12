# QuestionTodoStatusRefreshCoordinator

> **源码**: `src/features/chat/services/QuestionTodoStatusRefreshCoordinator.ts`
> **状态**: [REVIEW]

## 概述

`QuestionTodoStatusRefreshCoordinator` 把 conversation activation / post-sync 收尾里反复出现的 **session status + pending question + session todo** 组合刷新顺序收束成一个 dedicated coordinator。它专门负责：

- 在 streaming / loaded / current-tab open activation 后，按既有顺序启动 status → pending question → todo 的 fire-and-forget lazy refresh
- 在 visible/signal/background post-sync 后，先刷新 pending question，再执行 background-task runtime reconcile hook，最后按 runtime gate 刷新 todo/status live state
- 复用 `SessionTodoStatusRefreshService` 的 request-id stale guard 与 `QuestionDockCoordinator` 的 pending-question state 更新，而不是在 view/bridge/coordinator host 上继续暴露三组分散 callback

它不直接调用 OpenCode API，也不拥有 question dock DOM、todo/status snapshot state、background-task timeline rebuild 或 completion notice flush；这些仍分别由 `QuestionDockCoordinator`、`SessionTodoStatusRefreshService`、`SessionTodoStateService`、`BackgroundTaskTimelineService` 与 `PostSyncQuestionTodoRefreshFacade` 承接。本模块只负责 activation/post-sync 场景里的组合刷新顺序与 runtime gate。

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
  refreshAfterActivation(tabId: TabId | null, sessionId: string | null | undefined): Promise<void>;
  refreshAfterPostSync(options: PostSyncQuestionTodoStatusRefreshOptions): Promise<void>;
}
```

## 关键行为

- `refreshAfterActivation()` 保持原来的 activation/open fast path 语义：同步启动 status、pending-question、todo 三个 lazy refresh，不等待其中一个完成后才发起下一个
- `refreshAfterPostSync()` 保持 post-sync 语义：先等待 pending-question refresh，再运行 `afterPendingQuestionRefresh` hook，让 background-task rebuild / follow-up facade 仍能稳定发生在 todo/status gate 之前
- todo/status post-sync refresh 只有在 tab runtime 存在，且存在 incomplete todos、background-task launch、waiting-for-follow-up，或调用方强制刷新时才会执行
- visible-conversation post-sync 可把 pending-question session 与当前 todo/status session 分开传入，保留“当前 conversation 已切换时仍刷新当前 session live state”的旧行为

## 与 `OpenCodianView` 的边界

- `OpenCodianView` 只装配 host：提供 tab runtime、`QuestionDockCoordinator` pending-question refresh、`SessionTodoStatusRefreshService` todo/status refresh，以及 `SessionTodoStateService` 的 incomplete-todo 判断
- `TabViewActivationBridge` 现在只负责 activation UI writeback，并把 status/question/todo lazy refresh 委托给本 coordinator
- `PostSyncQuestionTodoRefreshFacade` 会在 signal/background sync 后复用本 coordinator，再串起 background-task rebuild、completion notice refresh 与 stream-like follow-up
- `BackgroundTaskPostSyncCoordinator` 现在只负责 authoritative mark、attention 与 state-commit 判定；pending-question + todo/status refresh order 继续由本 coordinator 承接
- current-tab conversation open fast path 同样复用本 coordinator，避免 `OpenCodianView` 再内联三段刷新调用
- 这条边界推进的是 master plan 的 P2 `question / todo / background task` lane：把 activation/post-sync 的组合刷新 ownership 从 view/bridge host surface 中继续下沉

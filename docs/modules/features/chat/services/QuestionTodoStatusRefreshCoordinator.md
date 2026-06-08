# QuestionTodoStatusRefreshCoordinator

> **源码**: `src/features/chat/services/QuestionTodoStatusRefreshCoordinator.ts`
> **状态**: [REVIEW]

## 概述

`QuestionTodoStatusRefreshCoordinator` 把 question/todo runtime 里反复出现的 **pending question + session status + session todo** 组合刷新顺序收束成一个 dedicated coordinator。它专门负责：

- 在 activation/open fast path 上并行启动 status、pending-question、todo 三条 supplemental refresh
- 在 visible/signal/background post-sync 后，先刷新 pending question，再执行 background-task runtime reconcile hook，最后按 runtime gate 刷新 todo/status live state
- 复用 `SessionTodoCoordinator` 的 request-id stale guard 与 `QuestionDockCoordinator` 的 pending-question state 更新，而不是在 view/bridge/coordinator host 上继续暴露三组分散 callback

它不直接调用 OpenCode API，也不拥有 question dock DOM、todo/status snapshot state、background-task timeline rebuild 或 completion notice flush；这些仍分别由 `QuestionDockCoordinator`、`SessionTodoCoordinator`、`SessionTodoStateService`、`BackgroundTaskTimelineService` 与 `PostSyncQuestionTodoRefreshFacade` 承接。`QuestionTodoActivationRefreshCoordinator` 继续拥有 dock writeback 顺序，而本模块统一承接 activation/open 与 post-sync 共享的 supplemental refresh。它的 host 装配现在通常由 `PostSyncQuestionTodoRefreshHostAdapter` 统一提供。

## 公开接口

```typescript
export interface QuestionTodoStatusRefreshCoordinatorHost {
  getTabRuntimeState(tabId: TabId | null): QuestionTodoStatusRefreshRuntime | null;
  hasIncompleteTodos(todos: readonly SessionTodo[]): boolean;
  getCurrentConversationBackend(): string;
  refreshPendingQuestionsForTab(...): Promise<QuestionRequest[]>;
  refreshTabSessionStatus(...): Promise<SessionActivityStatus | null>;
  refreshTabSessionTodos(...): Promise<SessionTodo[]>;
}
```

## 关键行为

- `refreshAfterActivation()` 保持 activation/open fast path 语义：并行启动 status、pending-question、todo 三条 lazy refresh，不等待其中一条完成后才发起下一条。**后端守护**：非 OpenCode 后端跳过 `refreshPendingQuestionsForTab()`（pending-questions REST 轮询仅限 OpenCode）
- `refreshAfterPostSync()` 保持 post-sync 语义：先等待 pending-question refresh，再运行 `afterPendingQuestionRefresh` hook，让 background-task rebuild / follow-up facade 仍能稳定发生在 todo/status gate 之前。**后端守护**：非 OpenCode 后端跳过 `refreshPendingQuestionsForTab()`
- todo/status post-sync refresh 只有在 tab runtime 存在，且存在 incomplete todos、background-task launch、waiting-for-follow-up，或调用方强制刷新时才会执行
- visible-conversation post-sync 可把 pending-question session 与当前 todo/status session 分开传入，保留“当前 conversation 已切换时仍刷新当前 session live state”的旧行为

## 与 `OpenCodianView` 的边界

- `OpenCodianView` 现在通过 `PostSyncQuestionTodoRefreshHostAdapter` 提供 host：adapter 继续映射 tab runtime、`QuestionDockCoordinator` pending-question refresh，以及 `SessionTodoCoordinator` 暴露的 incomplete/status/todo refresh 端口
- `QuestionTodoActivationRefreshCoordinator` 在 activation/open 入口先处理 todo dock render 与 question dock render，再把 supplemental refresh 委托给本 coordinator
- `PostSyncQuestionTodoRefreshFacade` 会在 signal/background sync 后复用本 coordinator，再串起 background-task rebuild、completion notice refresh 与 stream-like follow-up
- visible/background post-sync 的 state commit、authoritative mark 与 attention 判定分别由 `VisibleConversationPostSyncCoordinator` 与 `BackgroundConversationPostSyncHandoffCoordinator` 承接；pending-question + todo/status refresh order 继续由本 coordinator 承接
- current-tab conversation open fast path 通过 activation coordinator 复用同一条 supplemental refresh，而 post-sync gate 则继续保留在本 coordinator
- 这条边界推进的是 master plan 的 P2 `question / todo / background task` lane：把 post-sync 的组合刷新 ownership 从 view/bridge host surface 中继续下沉

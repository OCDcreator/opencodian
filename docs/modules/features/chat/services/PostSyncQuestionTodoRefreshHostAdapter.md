# PostSyncQuestionTodoRefreshHostAdapter

> **源码**: `src/features/chat/services/PostSyncQuestionTodoRefreshHostAdapter.ts`
> **状态**: [REVIEW]

## 概述

`PostSyncQuestionTodoRefreshHostAdapter` 把 visible/background post-sync question / todo refresh 这条共享 host 装配单独收束成一个模块，专门负责：

- 从窄 `PostSyncQuestionTodoRefreshViewHost` 派生 `QuestionTodoStatusRefreshCoordinator` 与 `PostSyncQuestionTodoRefreshPlanBuilder` 需要的 host 回调
- 统一实例化 `QuestionTodoStatusRefreshCoordinator`、`PostSyncQuestionTodoRefreshPlanBuilder` 与 `PostSyncQuestionTodoRefreshFacade`
- 让 `QuestionTodoBackgroundTaskRefreshHostAdapter` 不再继续持有 visible question/todo post-sync refresh 的 pass-through host 装配

它不拥有 activation-side dock writeback、background-task writeback、visible sync state commit、authoritative mark 或 tab attention 判定；这些职责仍分别留在 `QuestionTodoActivationRefreshCoordinator`、`BackgroundConversationPostSyncRefreshExecutor`、`VisibleConversationPostSyncCoordinator` 与 `BackgroundConversationPostSyncHandoffCoordinator`。activation/open 与 post-sync 共用的 supplemental refresh 已统一回落到 `QuestionTodoStatusRefreshCoordinator`。

## 公开接口

```typescript
export interface PostSyncQuestionTodoRefreshViewHost {
  getCurrentConversation(): Conversation | null;
  getTabRuntimeState(tabId: TabId | null): QuestionTodoStatusRefreshRuntime | null;
  hasIncompleteTodos(todos: readonly SessionTodo[]): boolean;
  refreshPendingQuestionsForTab(...): Promise<QuestionRequest[]>;
  refreshTabSessionStatus(...): Promise<SessionActivityStatus | null>;
  refreshTabSessionTodos(...): Promise<SessionTodo[]>;
}

export function createPostSyncQuestionTodoRefreshHosts(...): PostSyncQuestionTodoRefreshHosts;
export function createPostSyncQuestionTodoRefreshServices(...): PostSyncQuestionTodoRefreshServices;
```

## 关键行为

- `createPostSyncQuestionTodoRefreshHosts()` 把 runtime gate、pending-question refresh、todo/status refresh 与当前 conversation session 读取收束到单独的 post-sync host 层
- `createPostSyncQuestionTodoRefreshServices()` 固定装配 `QuestionTodoStatusRefreshCoordinator` → `PostSyncQuestionTodoRefreshPlanBuilder` → `PostSyncQuestionTodoRefreshFacade`
- visible source 继续通过当前 live conversation session 生成 plan；signal/background-tab source 则复用同一组 coordinator/builder，再由 background refresh executor 持有 source-specific follow-up
- `getCurrentConversationSessionId()` 现在使用 `getConversationBackendSessionId()` 解析 session identity，而非直接访问 `openCodeSessionId`

## 与 `OpenCodianView` 的边界

- `OpenCodianView` 仍只提供共享的 question/todo/background-task view bridge，不直接装配 visible post-sync refresh host
- `QuestionTodoBackgroundTaskRefreshHostAdapter` 现在复用本模块提供的 post-sync refresh services，再专注于 activation host、background-task writeback host、visible state commit host 与 background handoff host
- 这条边界继续推进 master plan 的 P2 `question / todo / background task` lane：把 visible question/todo post-sync refresh 的装配从更宽的 background-task host bundle 中独立出来

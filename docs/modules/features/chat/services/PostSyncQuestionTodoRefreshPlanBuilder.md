# PostSyncQuestionTodoRefreshPlanBuilder

> **源码**: `src/features/chat/services/PostSyncQuestionTodoRefreshPlanBuilder.ts`
> **状态**: [REVIEW]

## 概述

`PostSyncQuestionTodoRefreshPlanBuilder` 是 question / todo / background-task post-sync 刷新的 session 与 policy seam，专门负责：

- 为 visible conversation sync 生成 `QuestionTodoStatusRefreshCoordinator.refreshAfterPostSync()` 所需的 question/todo session 配对
- 为 signal sync 的 background conversation refresh 选择 conversation session，并把 `tabHasBackgroundTask` 映射成 todo/status force-refresh 标记
- 为 background-tab sync 的 background conversation refresh 选择 conversation session，并固定强制刷新 todo/status live state
- 让 `PostSyncQuestionTodoRefreshFacade` 专注执行 refresh/writeback 顺序，而不再同时持有 session-id 与 policy 选择规则
- 让 `BackgroundConversationPostSyncRefreshExecutor` 只按 sync 来源调用 source-specific refresh method，而不再构造低层 todo/status refresh policy

它不执行任何异步刷新，不触碰 background-task runtime，也不写回 UI 状态；这些仍由 `PostSyncQuestionTodoRefreshFacade`、`QuestionTodoStatusRefreshCoordinator` 与 background-task post-sync refresh port 承接。

## 公开接口

```typescript
export interface PostSyncQuestionTodoRefreshPlanBuilderHost {
  getCurrentConversationSessionId(): string | null | undefined;
}

export class PostSyncQuestionTodoRefreshPlanBuilder {
  createVisibleConversationPlan(...): PostSyncQuestionTodoStatusRefreshOptions;
  createSignalSyncedBackgroundConversationPlan(...): PostSyncQuestionTodoStatusRefreshOptions;
  createBackgroundTabConversationPlan(...): PostSyncQuestionTodoStatusRefreshOptions;
}
```

## 关键行为

- visible sync 的 pending-question refresh 继续使用发起同步时传入的 `questionSessionId`，todo/status refresh 则使用 host 返回的当前 conversation session
- signal sync 的 background conversation refresh 同时使用 conversation 的 `openCodeSessionId` 刷新 pending questions 与 todo/status，并只在 `tabHasBackgroundTask` 为真时强制 todo/status refresh
- background-tab refresh 同样使用 conversation 的 `openCodeSessionId`，但始终把 `forceTodoStatusRefresh` 设为 `true`
- builder 返回的 plan 不包含 `afterPendingQuestionRefresh` hook；runtime rebuild 与 completion writeback 顺序仍留在 `PostSyncQuestionTodoRefreshFacade`

## 与 `OpenCodianView` 的边界

- `QuestionTodoBackgroundTaskRefreshHostAdapter` 从共享 refresh view host 派生 builder host，并在 service bundle 中装配 builder
- `PostSyncQuestionTodoRefreshFacade` 消费 builder 的 plan，只负责调用 `QuestionTodoStatusRefreshCoordinator` 与 background-task writeback port
- `BackgroundConversationPostSyncRefreshExecutor` 只选择 source-specific refresh method，session-id 与 force-refresh policy 由 builder 统一决定
- 这条边界推进 master plan 的 P2 `question / todo / background task` lane：把 post-sync session/policy 选择从 sync coordinator 与 facade 中拆成独立可测 seam

# PostSyncQuestionTodoRefreshFacade

> **源码**: `src/features/chat/services/PostSyncQuestionTodoRefreshFacade.ts`
> **状态**: [REVIEW]

## 概述

`PostSyncQuestionTodoRefreshFacade` 把 `BackgroundTaskPostSyncCoordinator` 里剩余的 **question / todo / background-task refresh** 组合收尾提成共享 facade，专门负责：

- 在 visible background sync 完成后，消费 `PostSyncQuestionTodoRefreshPlanBuilder` 生成的 session 配对，然后复用 `QuestionTodoStatusRefreshCoordinator`
- 在 signal sync / background-tab sync 完成后，沿用同一份 pending-question → background-task rebuild → todo/status refresh 顺序
- 通过 source-specific background refresh method 接收 signal/background-tab 场景，但不再自己持有 todo/status force-refresh policy
- 在 background conversation refresh 期间，通过 dedicated background-task post-sync refresh port 串起 runtime rebuild 与 completion/stream-like writeback

它不负责 authoritative mark、attention、visible sync 的 state-commit 判定，也不自己决定 todo/status runtime gate；这些职责仍分别留在 `BackgroundTaskPostSyncCoordinator` 与 `QuestionTodoStatusRefreshCoordinator`。visible/background session-id 与 source 到 `forceTodoStatusRefresh` 的映射现在由 `PostSyncQuestionTodoRefreshPlanBuilder` 持有，避免本 facade 与 coordinator 继续共享低层 refresh-policy 规则。它的 host 装配现在通常由 `QuestionTodoBackgroundTaskRefreshHostAdapter` 统一提供。

## 公开接口

```typescript
export interface BackgroundTaskPostSyncRefreshPort {
  syncBackgroundTaskStateFromConversation(...): void;
  flushBackgroundTaskPostSyncWriteback(...): Promise<void>;
}

export class PostSyncQuestionTodoRefreshFacade {
  refreshVisibleConversation(options: VisibleConversationRefreshOptions): Promise<void>;
  refreshSignalSyncedBackgroundConversation(...): Promise<void>;
  refreshBackgroundTabConversation(...): Promise<void>;
}
```

## 关键行为

- `refreshVisibleConversation()` 保留 visible background sync 的旧语义，但 session 配对由 `PostSyncQuestionTodoRefreshPlanBuilder` 生成
- `refreshSignalSyncedBackgroundConversation()` 与 `refreshBackgroundTabConversation()` 把 source-specific 调用映射到 builder 生成的 refresh plan，再复用同一条 background refresh 执行路径
- background refresh 执行路径把 `QuestionTodoStatusRefreshCoordinator.refreshAfterPostSync()` 与 dedicated port 上的 background-task runtime rebuild hook 绑定在一起，保证 rebuild 仍发生在 todo/status refresh gate 之前
- background conversation refresh 完成后，不再把 rebuild 留在 facade host、再把 UI writeback 拆给另一条 callback；而是统一调用同一个 `BackgroundTaskPostSyncRefreshPort`
- dedicated refresh port 让 question/todo refresh 与 background-task rebuild/writeback 继续保持固定顺序，同时把 background-task effect surface 从 facade host 中抽离出去

## 与 `OpenCodianView` 的边界

- `OpenCodianView` 现在通过 `QuestionTodoBackgroundTaskRefreshHostAdapter` 间接装配 `PostSyncQuestionTodoRefreshPlanBuilder` 的当前 conversation session host，以及一条更窄的 background-task post-sync refresh bridge
- `QuestionTodoStatusRefreshCoordinator` 继续拥有 pending-question + todo/status 的组合刷新顺序与 runtime gate
- `BackgroundTaskPostSyncCoordinator` 继续拥有 authoritative mark、attention、visible sync apply/indicator outcome 与 state-commit 判定
- signal/background-tab 的 todo/status 强制刷新策略现在由 `PostSyncQuestionTodoRefreshPlanBuilder` 持有，coordinator 只调用 source-specific facade method 并传递必要的 signal metadata
- background-task runtime rebuild 与 completion notice / stream-like 写回现在都经由 dedicated post-sync refresh port 收束，避免 facade host 再暴露 background-task 专属 effect
- 这条边界推进的是 master plan 的 P2 `question / todo / background task` lane：把 post-sync refresh 执行顺序留在 dedicated facade，同时把 session/policy 选择下沉到独立 builder

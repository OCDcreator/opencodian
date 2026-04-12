# PostSyncQuestionTodoRefreshFacade

> **源码**: `src/features/chat/services/PostSyncQuestionTodoRefreshFacade.ts`
> **状态**: [REVIEW]

## 概述

`PostSyncQuestionTodoRefreshFacade` 把 `BackgroundTaskPostSyncCoordinator` 里剩余的 **question / todo / background-task refresh** 组合收尾提成共享 facade，专门负责：

- 在 visible background sync 完成后，把 pending-question session 与当前活动 conversation 的 todo/status session 重新配对，然后复用 `QuestionTodoStatusRefreshCoordinator`
- 在 signal sync / background-tab sync 完成后，沿用同一份 pending-question → background-task rebuild → todo/status refresh 顺序
- 根据 background refresh 来源统一决定是否强制 todo/status refresh：signal sync 只在 tab 仍有 background task 时强制，background-tab sync 固定强制
- 在 background conversation refresh 期间，通过 dedicated background-task post-sync refresh port 串起 runtime rebuild 与 completion/stream-like writeback

它不负责 authoritative mark、attention、visible sync 的 state-commit 判定，也不自己决定 todo/status runtime gate；这些职责仍分别留在 `BackgroundTaskPostSyncCoordinator` 与 `QuestionTodoStatusRefreshCoordinator`。但 background conversation refresh 的来源到 `forceTodoStatusRefresh` 的映射现在由本 facade 收口，避免 coordinator 继续传递原始布尔刷新策略。它的 host 装配现在通常由 `QuestionTodoBackgroundTaskRefreshHostAdapter` 统一提供。

## 公开接口

```typescript
export interface PostSyncQuestionTodoRefreshFacadeHost {
  getCurrentConversationSessionId(): string | null | undefined;
}

export interface BackgroundTaskPostSyncRefreshPort {
  syncBackgroundTaskStateFromConversation(...): void;
  flushBackgroundTaskPostSyncWriteback(...): Promise<void>;
}

export type BackgroundConversationTodoStatusRefreshPolicy =
  | { source: 'signal-sync'; tabHasBackgroundTask: boolean }
  | { source: 'background-tab' };

export class PostSyncQuestionTodoRefreshFacade {
  refreshVisibleConversation(options: VisibleConversationRefreshOptions): Promise<void>;
  refreshBackgroundConversation(options: BackgroundConversationRefreshOptions): Promise<void>;
}
```

## 关键行为

- `refreshVisibleConversation()` 保留 visible background sync 的旧语义：pending-question refresh 仍按发起同步时的 session 执行，而 todo/status refresh 会跟随当前活动 conversation 的最新 session
- `refreshBackgroundConversation()` 把 `QuestionTodoStatusRefreshCoordinator.refreshAfterPostSync()` 与 dedicated port 上的 background-task runtime rebuild hook 绑定在一起，保证 rebuild 仍发生在 todo/status refresh gate 之前
- `BackgroundConversationTodoStatusRefreshPolicy` 把 signal/background-tab 来源映射成内部 force 判定：signal sync 复用 `tabHasBackgroundTask`，background-tab sync 总是强制刷新 todo/status live state
- background conversation refresh 完成后，不再把 rebuild 留在 facade host、再把 UI writeback 拆给另一条 callback；而是统一调用同一个 `BackgroundTaskPostSyncRefreshPort`
- dedicated refresh port 让 question/todo refresh 与 background-task rebuild/writeback 继续保持固定顺序，同时把 background-task effect surface 从 facade host 中抽离出去

## 与 `OpenCodianView` 的边界

- `OpenCodianView` 现在通过 `QuestionTodoBackgroundTaskRefreshHostAdapter` 提供当前 conversation session，以及一条更窄的 background-task post-sync refresh bridge
- `QuestionTodoStatusRefreshCoordinator` 继续拥有 pending-question + todo/status 的组合刷新顺序与 runtime gate
- `BackgroundTaskPostSyncCoordinator` 继续拥有 authoritative mark、attention、visible sync apply/indicator outcome 与 state-commit 判定
- signal/background-tab 的 todo/status 强制刷新策略现在由本 facade 内部持有，coordinator 只传递同步来源与必要的 signal metadata
- background-task runtime rebuild 与 completion notice / stream-like 写回现在都经由 dedicated post-sync refresh port 收束，避免 facade host 再暴露 background-task 专属 effect
- 这条边界推进的是 master plan 的 P2 `question / todo / background task` lane：把 post-sync refresh 组合装配从 `OpenCodianView` / `BackgroundTaskPostSyncCoordinator` 继续下沉到 dedicated facade

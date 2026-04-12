# PostSyncQuestionTodoRefreshFacade

> **源码**: `src/features/chat/services/PostSyncQuestionTodoRefreshFacade.ts`
> **状态**: [REVIEW]

## 概述

`PostSyncQuestionTodoRefreshFacade` 把 `BackgroundTaskPostSyncCoordinator` 里剩余的 **question / todo / background-task refresh** 组合收尾提成共享 facade，专门负责：

- 在 visible background sync 完成后，把 pending-question session 与当前活动 conversation 的 todo/status session 重新配对，然后复用 `QuestionTodoStatusRefreshCoordinator`
- 在 signal sync / background-tab sync 完成后，沿用同一份 pending-question → background-task rebuild → todo/status refresh 顺序
- 在 background conversation refresh 完成后，继续串起 completion notice refresh 与 tab stream-like 状态写回

它不负责 authoritative mark、attention、visible sync 的 state-commit 判定，也不自己决定 todo/status runtime gate；这些职责仍分别留在 `BackgroundTaskPostSyncCoordinator` 与 `QuestionTodoStatusRefreshCoordinator`。

## 公开接口

```typescript
export interface PostSyncQuestionTodoRefreshFacadeHost {
  getCurrentConversationSessionId(): string | null | undefined;
  syncBackgroundTaskStateFromConversation(...): void;
  refreshBackgroundTaskCompletionNotices(...): Promise<void>;
  syncTabStreamLikeState(tabId: TabId | null): void;
}

export class PostSyncQuestionTodoRefreshFacade {
  refreshVisibleConversation(options: VisibleConversationRefreshOptions): Promise<void>;
  refreshBackgroundConversation(options: BackgroundConversationRefreshOptions): Promise<void>;
}
```

## 关键行为

- `refreshVisibleConversation()` 保留 visible background sync 的旧语义：pending-question refresh 仍按发起同步时的 session 执行，而 todo/status refresh 会跟随当前活动 conversation 的最新 session
- `refreshBackgroundConversation()` 把 `QuestionTodoStatusRefreshCoordinator.refreshAfterPostSync()` 与 background-task runtime rebuild hook 绑定在一起，保证 rebuild 仍发生在 todo/status refresh gate 之前
- background conversation refresh 完成后，会继续刷新 completion notices，并同步 tab stream-like 状态，让 signal/background tab 的 UI 回写保持原顺序

## 与 `OpenCodianView` 的边界

- `OpenCodianView` 只负责提供当前 conversation session、background-task timeline rebuild、completion notice flush 和 stream-like 状态写回的 host bridge
- `QuestionTodoStatusRefreshCoordinator` 继续拥有 pending-question + todo/status 的组合刷新顺序与 runtime gate
- `BackgroundTaskPostSyncCoordinator` 继续拥有 authoritative mark、attention、visible sync apply/indicator outcome 与 state-commit 判定
- 这条边界推进的是 master plan 的 P2 `question / todo / background task` lane：把 post-sync refresh 组合装配从 `OpenCodianView` / `BackgroundTaskPostSyncCoordinator` 继续下沉到 dedicated facade

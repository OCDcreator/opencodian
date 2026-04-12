# PostSyncQuestionTodoRefreshFacade

> **源码**: `src/features/chat/services/PostSyncQuestionTodoRefreshFacade.ts`
> **状态**: [REVIEW]

## 概述

`PostSyncQuestionTodoRefreshFacade` 把 `BackgroundTaskPostSyncCoordinator` 里剩余的 **question / todo / background-task refresh** 组合收尾提成共享 facade，专门负责：

- 在 visible background sync 完成后，把 pending-question session 与当前活动 conversation 的 todo/status session 重新配对，然后复用 `QuestionTodoStatusRefreshCoordinator`
- 在 signal sync / background-tab sync 完成后，沿用同一份 pending-question → background-task rebuild → todo/status refresh 顺序
- 在 background conversation refresh 完成后，通过 dedicated background-task writeback port 串起 completion notice refresh 与 tab stream-like 状态写回

它不负责 authoritative mark、attention、visible sync 的 state-commit 判定，也不自己决定 todo/status runtime gate；这些职责仍分别留在 `BackgroundTaskPostSyncCoordinator` 与 `QuestionTodoStatusRefreshCoordinator`。它的 host 装配现在通常由 `QuestionTodoBackgroundTaskRefreshHostAdapter` 统一提供。

## 公开接口

```typescript
export interface PostSyncQuestionTodoRefreshFacadeHost {
  getCurrentConversationSessionId(): string | null | undefined;
  syncBackgroundTaskStateFromConversation(...): void;
}

export interface BackgroundTaskPostSyncWritebackPort {
  flushBackgroundTaskPostSyncWriteback(...): Promise<void>;
}

export class PostSyncQuestionTodoRefreshFacade {
  refreshVisibleConversation(options: VisibleConversationRefreshOptions): Promise<void>;
  refreshBackgroundConversation(options: BackgroundConversationRefreshOptions): Promise<void>;
}
```

## 关键行为

- `refreshVisibleConversation()` 保留 visible background sync 的旧语义：pending-question refresh 仍按发起同步时的 session 执行，而 todo/status refresh 会跟随当前活动 conversation 的最新 session
- `refreshBackgroundConversation()` 把 `QuestionTodoStatusRefreshCoordinator.refreshAfterPostSync()` 与 background-task runtime rebuild hook 绑定在一起，保证 rebuild 仍发生在 todo/status refresh gate 之前
- background conversation refresh 完成后，不再直接依赖分散的 completion-notice / stream-like host 回调，而是统一调用 `BackgroundTaskPostSyncWritebackPort`
- dedicated writeback port 让 question/todo refresh 与 background-task UI 回写继续保持固定顺序，同时把 effect surface 缩成单一 post-sync 能力

## 与 `OpenCodianView` 的边界

- `OpenCodianView` 现在通过 `QuestionTodoBackgroundTaskRefreshHostAdapter` 提供当前 conversation session、background-task timeline rebuild，以及一个更窄的 post-sync background-task writeback bridge
- `QuestionTodoStatusRefreshCoordinator` 继续拥有 pending-question + todo/status 的组合刷新顺序与 runtime gate
- `BackgroundTaskPostSyncCoordinator` 继续拥有 authoritative mark、attention、visible sync apply/indicator outcome 与 state-commit 判定
- `BackgroundTaskIndicatorCoordinator` 现在承接 completion notice + stream-like 状态写回的 post-sync effect port，避免 facade host 再暴露两段分散 UI writeback
- 这条边界推进的是 master plan 的 P2 `question / todo / background task` lane：把 post-sync refresh 组合装配从 `OpenCodianView` / `BackgroundTaskPostSyncCoordinator` 继续下沉到 dedicated facade

# PostSyncQuestionTodoRefreshFacade

> **源码**: `src/features/chat/services/PostSyncQuestionTodoRefreshFacade.ts`
> **状态**: [REVIEW]

## 概述

`PostSyncQuestionTodoRefreshFacade` 现在收窄为 visible-conversation 的 post-sync question / todo refresh facade，专门负责：

- 在 visible background sync 完成后，消费 `PostSyncQuestionTodoRefreshPlanBuilder` 生成的 session 配对，然后复用 `QuestionTodoStatusRefreshCoordinator`
- 保持 visible source 的窄 refresh 入口，不再同时承接 signal/background-tab 的 source routing
- 把 background-only 的 execution seam 让给 `BackgroundConversationPostSyncRefreshExecutor`，避免 visible/background 继续共享一个 facade surface

它不负责 authoritative mark、background attention、visible sync 的 state-commit 判定，也不自己决定 todo/status runtime gate；这些职责仍分别留在 `BackgroundConversationSignalSyncStateCoordinator`、`BackgroundConversationAttentionCoordinator`、`VisibleConversationPostSyncCoordinator` 与 `QuestionTodoStatusRefreshCoordinator`。visible session-id 配对仍由 `PostSyncQuestionTodoRefreshPlanBuilder` 持有；signal/background-tab source 到 force-refresh policy 的映射与执行则下沉到 `BackgroundConversationPostSyncRefreshExecutor`。它的 host 装配现在通常由 `QuestionTodoBackgroundTaskRefreshHostAdapter` 统一提供。

## 公开接口

```typescript
export class PostSyncQuestionTodoRefreshFacade {
  refreshVisibleConversation(options: VisibleConversationRefreshOptions): Promise<void>;
}
```

## 关键行为

- `refreshVisibleConversation()` 保留 visible background sync 的旧语义，但 session 配对仍由 `PostSyncQuestionTodoRefreshPlanBuilder` 生成
- visible source 现在只需把 question-session 与当前 live conversation session 对齐，不再关心 signal/background-tab refresh 的 source routing
- background-task runtime rebuild 与 completion notice / stream-like writeback 的固定顺序现在由 `BackgroundConversationPostSyncRefreshExecutor` 单独持有，避免 visible facade 再携带 background-only effect surface

## 与 `OpenCodianView` 的边界

- `OpenCodianView` 现在通过 `QuestionTodoBackgroundTaskRefreshHostAdapter` 间接装配 `PostSyncQuestionTodoRefreshPlanBuilder` 的当前 conversation session host
- `QuestionTodoStatusRefreshCoordinator` 继续拥有 pending-question + todo/status 的组合刷新顺序与 runtime gate
- `VisibleConversationPostSyncCoordinator` 继续把 visible refresh 与 visible state-commit 串成一个窄 seam，避免 facade 直接感知 apply/indicator outcome
- `VisibleConversationPostSyncCoordinator` 继续拥有 visible refresh + state-commit 组合，`BackgroundConversationPostSyncHandoffCoordinator` 则直接拥有 hidden/background source handoff 与 signal authoritative mark 交接点
- `BackgroundConversationAttentionCoordinator` 负责 signal/background-tab sync 的 fingerprint/attention outcome，避免 visible facade 再耦合 background tab state policy
- signal/background-tab 的 todo/status 强制刷新策略仍由 `PostSyncQuestionTodoRefreshPlanBuilder` 持有，只是执行入口不再和 visible source 共享同一个 facade
- 这条边界推进的是 master plan 的 P2 `question / todo / background task` lane：让 visible refresh 与 background refresh 进入不同模块，同时继续把 session/policy 选择留在 builder、runtime gate 留在 coordinator

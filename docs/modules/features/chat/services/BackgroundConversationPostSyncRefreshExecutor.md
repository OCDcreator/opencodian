# BackgroundConversationPostSyncRefreshExecutor

> **源码**: `src/features/chat/services/BackgroundConversationPostSyncRefreshExecutor.ts`
> **状态**: [REVIEW]

## 概述

`BackgroundConversationPostSyncRefreshExecutor` 从 `PostSyncQuestionTodoRefreshFacade` 中抽出 background-only 的 post-sync question / todo / background-task 执行链，专门负责：

- 接收 signal-sync 与 background-tab 两种 background conversation source 的 refresh 请求
- 通过 `PostSyncQuestionTodoRefreshPlanBuilder` 把 source-specific 输入映射为统一的 post-sync refresh plan
- 复用 `QuestionTodoStatusRefreshCoordinator` 的 pending-question → conditional todo/status refresh 顺序
- 在 pending-question refresh 之后、todo/status refresh gate 之前插入 background-task runtime rebuild，并在最后 flush completion notice / stream-like writeback

它不负责 visible conversation 的 refresh 入口，也不负责 authoritative mark、attention 或 visible sync 的 state-commit；这些职责仍分别留在 `PostSyncQuestionTodoRefreshFacade`、`BackgroundConversationPostSyncHandoffCoordinator` 与 `VisibleConversationPostSyncCoordinator`。

## 公开接口

```typescript
export interface BackgroundTaskPostSyncRefreshPort {
  syncBackgroundTaskStateFromConversation(...): void;
  flushBackgroundTaskPostSyncWriteback(...): Promise<void>;
}

export class BackgroundConversationPostSyncRefreshExecutor {
  refreshSignalSyncedBackgroundConversation(...): Promise<void>;
  refreshBackgroundTabConversation(...): Promise<void>;
}
```

## 关键行为

- `refreshSignalSyncedBackgroundConversation()` 沿用 signal-sync source 的 `tabHasBackgroundTask` force-refresh policy，但不自己持有 policy 判定
- `refreshBackgroundTabConversation()` 固定 background-tab sync 走 forced todo/status refresh plan，避免后台 tab 状态停留在旧快照
- 两个入口都会落到同一条 background execution seam：pending-question refresh → rebuild runtime state → conditional todo/status refresh → post-sync writeback
- rebuild hook 仍挂在 `QuestionTodoStatusRefreshCoordinator.refreshAfterPostSync()` 的 `afterPendingQuestionRefresh` 上，确保 background-task state 与 question refresh 保持旧顺序

## Backend-aware routing

- 当 `PostSyncQuestionTodoRefreshPlanBuilder` 返回 `null` plan（非 OpenCode conversation）时，`refreshBackgroundConversation()` 跳过 question/todo refresh coordinator 调用，但仍执行 `flushBackgroundTaskPostSyncWriteback()`
- 这确保 background-task writeback 不被后端类型阻断，而 question/todo 这类 OpenCode-only feature 完全跳过

## 与 `OpenCodianView` 的边界

- `OpenCodianView` 不直接接触本模块；它通过 `QuestionTodoBackgroundTaskRefreshHostAdapter` 间接提供 background-task rebuild / writeback host
- `QuestionTodoStatusRefreshCoordinator` 继续拥有 runtime gate，与本模块共享的只是一个窄 `refreshAfterPostSync()` port
- `BackgroundConversationPostSyncHandoffCoordinator` 现在直接调用 background refresh executor，visible refresh 继续经由 `VisibleConversationPostSyncCoordinator`，避免 signal/background-tab source routing 继续和 visible source 共享一个 facade entry surface

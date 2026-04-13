# SessionTodoStatusRefreshService

> **源码**: `src/features/chat/services/SessionTodoStatusRefreshService.ts`
> **状态**: [REVIEW]

## 概述

`SessionTodoStatusRefreshService` 把 `OpenCodianView` 里剩余的 **session todo/status 主动拉取刷新、request-id stale guard，以及刷新成功后的 background-task live-signal reconcile** 收束成一个 dedicated service，专门负责：

- 调用 OpenCode session todo/status API
- 维护每个 tab 的 todo/status refresh request-id，避免旧请求覆盖新状态
- 在刷新成功后统一写回 `SessionTodoStateService` 持有的 snapshot/status runtime
- 把刷新后的 foreground reconcile 直接交给 `BackgroundTaskLiveSignalCoordinator`

它不拥有 dock state、stale notice 规则或 question/background-task activation/post-sync 编排；这些仍分别留给 `SessionTodoStateService`、`QuestionDockCoordinator`、`QuestionTodoActivationRefreshBridge`、`QuestionTodoStatusRefreshCoordinator`、`VisibleConversationPostSyncCoordinator`、`BackgroundConversationPostSyncRefreshExecutor` 与相关 bridge/coordinator。它只承接“主动刷新一次 session todo/status”的稳定边界。

## 公开接口

```typescript
export interface SessionTodoStatusRefreshServiceHost {
  getTabRuntimeState(tabId: TabId | null): SessionTodoStatusRefreshRuntime | null;
  getTabSessionTodos(tabId: TabId | null, sessionId?: string | null): SessionTodo[];
  setTabSessionTodos(tabId: TabId | null, todos: SessionTodo[], sessionId: string | null): void;
  renderSessionTodoDock(tabId: TabId | null): void;
  getTabSessionStatus(tabId: TabId | null, sessionId?: string | null): SessionActivityStatus | null;
  setTabSessionStatus(tabId: TabId | null, status: SessionActivityStatus | null, sessionId: string | null): void;
  getSessionTodos(sessionId: string): Promise<SessionTodo[]>;
  getSessionStatuses(): Promise<Record<string, SessionActivityStatus>>;
  reconcileBackgroundTaskLiveSignals(tabId: TabId | null): void;
}

export class SessionTodoStatusRefreshService {
  refreshTabSessionTodos(...): Promise<SessionTodo[]>;
  refreshTabSessionStatus(...): Promise<SessionActivityStatus | null>;
}
```

## 关键行为

- `refreshTabSessionTodos()` 在 tab runtime 或 session 缺失时只刷新 dock 可见态；在正常路径里会先递增 `todoRequestId`，再用最新 request-id gate 保护写回
- `refreshTabSessionStatus()` 在 tab runtime 或 session 缺失时会清空该 tab 的 session status；在正常路径里同样用 `statusRequestId` 阻止过期响应覆盖新状态
- 两条刷新路径在成功写回后都会立即调用 `reconcileBackgroundTaskLiveSignals()`，保持 todo/status 主动刷新与 live-signal foreground settle 的既有顺序一致
- 如果网络请求失败，service 继续沿用原先的 debug log 和 `chat.todo.loadFailed` notice 行为；`suppressErrors` 只控制 notice，不改变 fallback 返回值

## 与 `OpenCodianView` 的边界

- `SessionTodoHostAdapter` 现在负责把 `OpenCodianView` 的单一 session todo host 装配成 refresh service 需要的 host 形状，并复用同一份 `SessionTodoStateService` / `SessionTodoDockCoordinator`
- `OpenCodianView` 现在只负责提供 tab runtime、session 选择、OpenCode API 与 background-task reconcile 这份 shared host
- `QuestionTodoActivationRefreshBridge` 与 `QuestionTodoStatusRefreshCoordinator` 会把本 service 与 `QuestionDockCoordinator` 组合起来，分别承接 activation/open 与 post-sync 场景的 status + pending-question + todo 刷新顺序
- `TabViewActivationBridge`、`VisibleConversationPostSyncCoordinator`、`BackgroundConversationPostSyncRefreshExecutor`、`BackgroundTaskStreamTriggerCoordinator`、`QuestionDockCoordinator`、`MessageFinalizationService` 与 view 自身的 open-conversation fast path，都会复用同一份 refresh service，而不是继续各自回调 view 内联实现
- `SessionTodoStateService` 继续负责 todo/status runtime 的纯状态机、stale suppression 与 persisted notice 协调；refresh service 不接管这些规则
- 这条边界推进的是 master plan 的 P2 `question / todo / background task` lane：把 `OpenCodianView` 里仍然耦合在一起的 todo/status refresh ownership 迁到可复用 service

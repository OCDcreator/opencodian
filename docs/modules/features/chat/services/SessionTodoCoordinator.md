# SessionTodoCoordinator

> **源码**: `src/features/chat/services/SessionTodoCoordinator.ts`
> **状态**: [REVIEW]

## 概述

`SessionTodoCoordinator` 把原先分散在 `SessionTodoRuntimeFacade`、`SessionTodoStatusRefreshService`、`SessionTodoDockCoordinator` 与 `SessionTodoStateService` 之间的 session todo 主入口收束成一个更厚的 owner。它专门负责：

- 复用 `SessionTodoStateService` 维护 todo/status snapshot、fingerprint、stale suppression 与 persisted notice 协调
- 复用 `SessionTodoDockCoordinator` 统一 todo dock 的 attach / render / updateForTab / destroy
- 提供 stream snapshot、live signal 写回、activation reset、主动 refresh 与 foreground busy 读取的统一 API
- 让 `OpenCodianView` 与相邻 P2 host adapter 只依赖一份 session todo coordinator port，而不再分别拿 state / refresh / runtime facade

它不接管 `SessionTodoDock` 的 DOM 细节，也不重新定义 stale notice 规则；底层状态机与 dock session 选择仍分别留在 `SessionTodoStateService` 与 `SessionTodoDockCoordinator`。

## 公开接口

```typescript
export interface SessionTodoCoordinatorHost {
  getActiveTabId(): TabId | null;
  getCurrentConversationSessionId(): string | null | undefined;
  getTabRuntimeState(tabId: TabId | null): SessionTodoCoordinatorRuntimeState | null;
  getSessionIdForTab(tabId: TabId | null): string | null;
  getConversationForTab(tabId: TabId | null): Conversation | null;
  hasMatchingPersistentAssistantNoticeMessage(...): boolean;
  appendPersistentAssistantNoticeMessage(...): Promise<void>;
  getSessionTodos(sessionId: string): Promise<SessionTodo[]>;
  getSessionStatuses(): Promise<Record<string, SessionActivityStatus>>;
  reconcileBackgroundTaskLiveSignals(tabId: TabId | null): void;
}

export class SessionTodoCoordinator {
  attach(parentEl: HTMLElement): void;
  render(tabId?: TabId | null): void;
  updateForTab(tabId: TabId): void;
  destroy(): void;
  getTabSessionTodos(...): SessionTodo[];
  getTabSessionStatus(...): SessionActivityStatus | null;
  hasIncompleteTodos(...): boolean;
  hasIncompleteTabSessionTodos(...): boolean;
  reconcileStaleSessionTodoState(...): void;
  refreshTabSessionTodos(...): Promise<SessionTodo[]>;
  refreshTabSessionStatus(...): Promise<SessionActivityStatus | null>;
  applySessionTodoUpdate(...): void;
  applySessionStatusUpdate(...): void;
  applyStreamingTodoSnapshotFromTool(...): void;
  resetTabSessionState(...): void;
  clearTabSessionState(...): void;
}
```

## 关键行为

- `refreshTabSessionTodos()` / `refreshTabSessionStatus()` 继续拥有 request-id stale guard，并在 refresh 成功后触发 foreground background-task reconcile。这两个方法现在有显式 backend gate：如果 `conversation.backend` 不是 `'opencode'`，`refreshTabSessionTodos()` 会跳过 OpenCode-only 的 `getSessionTodos()` 调用，`refreshTabSessionStatus()` 会跳过 OpenCode-only 的 `getSessionStatuses()` 调用，并提前返回空结果
- Claude Code session todo snapshot 纯粹来自 stream tool call：`BackgroundTaskStreamTriggerCoordinator` / view pipeline 把 TodoWrite 工具输入交给 `applyStreamingTodoSnapshotFromTool()`，再写入同一套 per-tab todo state；不会为 Claude Code 调用 OpenCode server session todo API
- 这个 backend gate 是有意的边界：Claude Code 已声明 `Todos` capability 以启用 dock/snapshot 路由，但 todo 数据来源是 stream-derived snapshot，而不是 OpenCode 专属的 `getSessionTodos()` refresh API
- `applySessionTodoUpdate()` / `applySessionStatusUpdate()`、`applyStreamingTodoSnapshotFromTool()` 与 tab reset 入口都统一回落到同一套 state write path，避免 live refresh / stream snapshot / activation reset 各走一套 helper
- `attach()` / `render()` / `updateForTab()` / `destroy()` 继续复用 `SessionTodoDockCoordinator` 的 active-vs-runtime session 选择，不把 dock DOM 细节重新塞回 view

## 与 `OpenCodianView` 的边界

- `OpenCodianView` 现在只提供一份 `SessionTodoViewHost`，并持有单一 `SessionTodoCoordinator`
- `QuestionTodoBackgroundTaskRefreshHostAdapter`、`QuestionTodoBackgroundTaskActivationHostAdapter`、`QuestionRuntimeHostAdapter` 的 post-resolution follow-up、`BackgroundTaskStreamTriggerCoordinator` 与 tab/session signal wiring 都改为消费 coordinator port
- 这次切片推进的是 master plan 的 P2 `question / todo / background task` lane：把 session todo 的 refresh/status/runtime ownership 收束回一个统一 owner，并减少 view 对多个相邻 session-todo seam 的直接感知

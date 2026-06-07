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
  rehydrateClaudeTasksFromMessages(tabId: TabId | null, messages: ChatMessage[]): void;
  resetTabSessionState(...): void;
  clearTabSessionState(...): void;
}
```

## 关键行为

- `refreshTabSessionTodos()` / `refreshTabSessionStatus()` 继续拥有 request-id stale guard，并在 refresh 成功后触发 foreground background-task reconcile。这两个方法现在有显式 backend gate：如果 `conversation.backend` 不是 `'opencode'`，`refreshTabSessionTodos()` 会跳过 OpenCode-only 的 `getSessionTodos()` 调用，`refreshTabSessionStatus()` 会跳过 OpenCode-only 的 `getSessionStatuses()` 调用，并提前返回空结果
- Claude Code session todo 仍纯粹来自 stream tool call：`BackgroundTaskStreamTriggerCoordinator` / view pipeline 把工具输入交给 `applyStreamingTodoSnapshotFromTool()`，再写入同一套 per-tab todo state；不会为 Claude Code 调用 OpenCode server session todo API。该入口现在分流两条路径：OpenCode `TodoWrite` 继续使用 snapshot model，Claude Code `TaskCreate` / `TaskUpdate` 等 Task* 工具使用 incremental CRUD model
- Claude Code 的 Task* path 由 `claudeTaskSessionStates` 维护**按 backend sessionId 隔离**的增量 task 状态（不是 coordinator 全局单一 Map）。每个 session 拥有独立的 `tasks: Map<string, SessionTodo>`。`TaskCreate` 只在 tool result `status === 'completed'` 时落地，优先从 `Task #N created successfully: subject` 解析 task id / subject，并创建 `{ id: taskId, content: subject, status: 'pending' }`；`TaskUpdate` 更新已存在 todo 的 `in_progress` / `completed` 状态，也可同步 subject。result-string parsing 较脆弱，解析失败时回落到从 tool call ID 派生的 synthetic ID（`tc_` 前缀），保证永不与真实数字 task ID 冲突
- 这个 backend gate 是有意的边界：OpenCode refresh 仍只调用 OpenCode-only 的 `getSessionTodos()` / `getSessionStatuses()`；Claude Code 已重新声明并 productize `Todos` capability，但 dock 数据只来自 Task* stream-derived CRUD 状态，不会触碰 OpenCode server session todo API
- `applySessionTodoUpdate()` / `applySessionStatusUpdate()`、`applyStreamingTodoSnapshotFromTool()` 与 tab reset 入口都统一回落到同一套 state write path，避免 live refresh / stream snapshot / activation reset 各走一套 helper；`resetTabSessionState()` 只删除对应 sessionId 的 `claudeTaskSessionStates` 条目，不会误清除其他 session 的 Task* 状态
- `rehydrateClaudeTasksFromMessages()` 从已存储的 `contentBlocks`（`type: 'tool_use'`）中扫描历史 `TaskCreate`/`TaskUpdate` 工具调用，重建 `claudeTaskSessionStates`。若无 `contentBlocks` 则回落到 `toolCalls` 数组。当前它由 Claude conversation 的 `resetTabSessionState()` 路径触发：当 tab session state 被清空、当前会话属于 Claude Code 且已持有持久化 messages 时，coordinator 会立即重建 Task* 状态。幂等：若 session 已有 task entries（live streaming 已填充），则跳过。这确保 reload / activation 后再来的 `TaskUpdate`-only turn 能找到已有 task entry 并正确更新 dock
- `attach()` / `render()` / `updateForTab()` / `destroy()` 继续复用 `SessionTodoDockCoordinator` 的 active-vs-runtime session 选择，不把 dock DOM 细节重新塞回 view

## 与 `OpenCodianView` 的边界

- `OpenCodianView` 现在只提供一份 `SessionTodoViewHost`，并持有单一 `SessionTodoCoordinator`
- `QuestionTodoBackgroundTaskRefreshHostAdapter`、`QuestionTodoBackgroundTaskActivationHostAdapter`、`QuestionRuntimeHostAdapter` 的 post-resolution follow-up、`BackgroundTaskStreamTriggerCoordinator` 与 tab/session signal wiring 都改为消费 coordinator port
- 这次切片推进的是 master plan 的 P2 `question / todo / background task` lane：把 session todo 的 refresh/status/runtime ownership 收束回一个统一 owner，并减少 view 对多个相邻 session-todo seam 的直接感知

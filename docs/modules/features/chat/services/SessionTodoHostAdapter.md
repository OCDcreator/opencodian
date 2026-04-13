# SessionTodoHostAdapter

> **源码**: `src/features/chat/services/SessionTodoHostAdapter.ts`
> **状态**: [REVIEW]

## 概述

`SessionTodoHostAdapter` 现在只负责把 `OpenCodianView` 暴露的一份 `SessionTodoViewHost` 收束成单一 `SessionTodoCoordinator` 的构造入口。它专门负责：

- 复用统一的 `SessionTodoViewHost` 作为 `SessionTodoCoordinator` 的稳定 host 形状
- 把 session todo coordinator 的装配从主视图构造函数迁走，而不再让 view 自己拼接 refresh/runtime/dock 三段 wiring
- 保持 view 侧只感知一个 session todo owner

它不重新定义 todo/status 规则，也不拥有新的运行时状态；真正的状态机与 dock/render 语义已分别留在 `SessionTodoCoordinator`、`SessionTodoStateService` 与 `SessionTodoDockCoordinator`。

## 公开接口

```typescript
export interface SessionTodoViewHost {
  getActiveTabId(): TabId | null;
  getCurrentConversationSessionId(): string | null | undefined;
  getTabRuntimeState(tabId: TabId | null): SessionTodoRuntimeState | null;
  getSessionIdForTab(tabId: TabId | null): string | null;
  getConversationForTab(tabId: TabId | null): Conversation | null;
  hasMatchingPersistentAssistantNoticeMessage(...): boolean;
  appendPersistentAssistantNoticeMessage(...): Promise<void>;
  getSessionTodos(sessionId: string): Promise<SessionTodo[]>;
  getSessionStatuses(): Promise<Record<string, SessionActivityStatus>>;
  reconcileBackgroundTaskLiveSignals(tabId: TabId | null): void;
}

export function createSessionTodoCoordinator(host: SessionTodoViewHost): SessionTodoCoordinator;
```

## 关键行为

- `createSessionTodoCoordinator()` 只接收一份 `SessionTodoViewHost`，并把这组 host 直接交给更厚的 `SessionTodoCoordinator`
- `reconcileBackgroundTaskLiveSignals()`、`getSessionIdForTab()` 与 `getConversationForTab()` 等 view-level seam 仍由上游 host 提供；adapter 不新增业务逻辑
- 这层的收益是让 session todo 相关模块的装配收束到一个入口，而不是让 `OpenCodianView` 自己维护多个相邻 service/facade

## 与 `OpenCodianView` 的边界

- `OpenCodianView` 现在只需要提供一份 `SessionTodoViewHost`，并持有 `createSessionTodoCoordinator()` 返回的单一 owner
- `SessionTodoStateService` 与 `SessionTodoDockCoordinator` 继续保持自己的底层职责，但 view 不再分别持有它们
- 这次切片推进的是 master plan 的 P2 `question / todo / background task` lane：把剩余的 session todo host-bridge wiring 与 runtime trigger 入口一起从 `OpenCodianView` 收束到单一 coordinator

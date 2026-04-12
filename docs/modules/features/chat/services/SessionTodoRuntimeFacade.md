# SessionTodoRuntimeFacade

> **源码**: `src/features/chat/services/SessionTodoRuntimeFacade.ts`
> **状态**: [REVIEW]

## 概述

`SessionTodoRuntimeFacade` 把 `OpenCodianView` 里仍然残留的 session todo/status **运行时触发入口** 收束成一个共享 facade，专门负责：

- 统一转发 tab 级 todo/status 的 get/set 到 `SessionTodoStateService`
- 为 streaming `todowrite` tool snapshot 提供单一入口
- 为 live-signal adapter 和 activation bridge 提供共享的 todo/status 写回与 session reset 入口

它不重新定义 snapshot 规范化、stale suppression 或 dock render 规则；这些能力仍留在 `SessionTodoStateService`、`SessionTodoDockCoordinator` 与 `SessionTodoStatusRefreshService`。这个 facade 只负责让 stream / live-signal / activation 三条入口复用同一份 session todo runtime bridge。

## 公开接口

```typescript
export interface SessionTodoRuntimeFacadeHost {
  getSessionIdForTab(tabId: TabId | null): string | null;
}

export class SessionTodoRuntimeFacade {
  getTabSessionTodos(...): SessionTodo[];
  setTabSessionTodos(...): void;
  getTabSessionStatus(...): SessionActivityStatus | null;
  setTabSessionStatus(...): void;
  applySessionTodoUpdate(...): void;
  applySessionStatusUpdate(...): void;
  applyStreamingTodoSnapshotFromTool(...): void;
  resetTabSessionState(...): void;
  clearTabSessionState(...): void;
}
```

## 关键行为

- `applyStreamingTodoSnapshotFromTool()` 只处理 `todowrite`，并复用 `SessionTodoStateService.extractSessionTodosFromToolInput()` 做 snapshot 规范化
- `applySessionTodoUpdate()` / `applySessionStatusUpdate()` 让 `ConversationSessionLiveSignalAdapter` 不再依赖 `OpenCodianView` 私有 helper
- `resetTabSessionState()` / `clearTabSessionState()` 把 `TabConversationStateBridge` 原先成对的 todo/status reset 写回收束成单一 host 入口

## 与 `OpenCodianView` 的边界

- `OpenCodianView` 现在只保留 `getSessionIdForTab()` 这类 session 选择与 host 装配
- `BackgroundTaskStreamTriggerCoordinator`、`ConversationSessionLiveSignalAdapter` 与 `TabConversationStateBridge` 通过各自 host 间接复用同一份 facade
- 这次切片推进的是 master plan 的 P2 `question / todo / background task` lane：继续把 session todo 触发 ownership 从 `OpenCodianView` 迁到 dedicated runtime boundary

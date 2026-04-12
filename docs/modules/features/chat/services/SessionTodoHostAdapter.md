# SessionTodoHostAdapter

> **源码**: `src/features/chat/services/SessionTodoHostAdapter.ts`
> **状态**: [REVIEW]

## 概述

`SessionTodoHostAdapter` 把 `OpenCodianView` 里原本分散的 session todo host factory 与 service wiring 收束到一个模块，专门负责：

- 从单一 `SessionTodoViewHost` 派生 `SessionTodoStateService`、`SessionTodoDockCoordinator`、`SessionTodoStatusRefreshService` 与 `SessionTodoRuntimeFacade` 需要的 host 回调
- 让 dock render、todo/status state 写回、主动 refresh，以及 stream/live-signal/session-reset 入口复用同一套 session todo bridge
- 把 session todo service bundle 的装配从主视图构造函数迁走，而不改变既有行为

它不重新定义 todo/status 规则，也不拥有任何新的运行时状态；真正的状态机、dock UI 选择和 refresh 语义仍分别留在现有 session todo 模块里。

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

export interface SessionTodoServices {
  dockCoordinator: SessionTodoDockCoordinator;
  stateService: SessionTodoStateService;
  statusRefreshService: SessionTodoStatusRefreshService;
  runtimeFacade: SessionTodoRuntimeFacade;
}

export function createSessionTodoServices(host: SessionTodoViewHost): SessionTodoServices;
```

## 关键行为

### shared host assembly

- `createSessionTodoServices()` 只接收一份 `SessionTodoViewHost`，再派生出 state / dock / refresh / runtime-facade 四条链路需要的 host 形状
- `SessionTodoDockCoordinator` 读取的 todo snapshot 与 `SessionTodoStatusRefreshService` 的 todo/status 写回，都会统一复用 `SessionTodoRuntimeFacade`
- `SessionTodoRuntimeFacade` 会继续回落到同一份 `SessionTodoStateService`，让 stream/live-signal/session-reset 入口不再各自重写默认 session 选择

### shared service bundle

- 返回值里的四个 session todo 协作对象仍保持各自原来的边界，但它们的 wiring 不再散落在 `OpenCodianView`
- `reconcileBackgroundTaskLiveSignals()` 仍保持 refresh 成功后的既有顺序，只是由 adapter 统一转发
- 这层不会吞掉 view 的 session 选择逻辑：`getSessionIdForTab()`、`getConversationForTab()` 仍由上游 host 提供

## 与 `OpenCodianView` 的边界

- `OpenCodianView` 现在只需要提供一份 `SessionTodoViewHost`，并持有 `createSessionTodoServices()` 返回的 bundle
- `SessionTodoStateService`、`SessionTodoDockCoordinator`、`SessionTodoStatusRefreshService` 与 `SessionTodoRuntimeFacade` 的业务职责保持分离
- 这次切片推进的是 master plan 的 P2 `question / todo / background task` lane：把剩余的 session todo host-bridge wiring 与 runtime trigger 入口一起从 `OpenCodianView` 迁到 dedicated adapter/facade

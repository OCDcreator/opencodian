# ConversationSessionSignalRuntimeHostProvider

> **源码**: `src/features/chat/services/ConversationSessionSignalRuntimeHostProvider.ts`
> **状态**: [REVIEW]

## 概述

`ConversationSessionSignalRuntimeHostProvider` 是夹在 `OpenCodianView` 与 `ConversationSessionSignalRuntimeViewHostFactory` 之间的一层薄 facade。它把 view 暴露的一份更扁平的 session-signal seam，重新分组为 factory 仍然需要的两组 ports：

- session signal subscriptions
- session signal writeback

这样 `OpenCodianView` 不再直接维护 grouped session-signal factory-host 结构，只保留 late-bound 的单职责 seam；既有 `ConversationSessionSignalRuntimeViewHostFactory`、`ConversationSyncEventLiveSignalHostAdapter` 与 `ConversationSessionSignalRuntime` 继续负责共享 host assembly、session→tab 路由与 adapter 生命周期。

## 公开接口

```typescript
export interface ConversationSessionSignalRuntimeHostProviderHost {
  subscribeToSessionSyncEvents(listener: SessionSyncEventListener): () => void;
  subscribeToSessionTodoUpdates(listener: SessionTodoUpdateListener): () => void;
  subscribeToSessionStatusUpdates(listener: SessionStatusUpdateListener): () => void;
  applySessionTodoUpdate(tabId: TabId | null, sessionId: string, todos: SessionTodo[]): void;
  applySessionStatusUpdate(
    tabId: TabId | null,
    sessionId: string,
    status: SessionActivityStatus,
  ): void;
  getAllTabs(): readonly TabData[];
  getConversations(): readonly Conversation[];
  getCurrentConversation(): Conversation | null;
  getActiveTabId(): TabId | null;
  scheduleConversationSyncFromSignal(tabId: TabId | null, reason: string): void;
}

export function createConversationSessionSignalRuntimeViewHostFactoryHost(
  host: ConversationSessionSignalRuntimeHostProviderHost,
): ConversationSessionSignalRuntimeViewHostFactoryHost;
```

## 边界

- `OpenCodianView` 只保留扁平 session-signal seam 的 late-bound 实现
- `ConversationSessionSignalRuntimeHostProvider` 只负责重新分组，不新增业务逻辑
- `ConversationSessionSignalRuntimeViewHostFactory` 继续负责把 grouped ports 组合成共享 session-signal runtime host
- `ConversationSyncEventLiveSignalHostAdapter` 与 `ConversationSessionSignalRuntime` 的行为边界保持不变

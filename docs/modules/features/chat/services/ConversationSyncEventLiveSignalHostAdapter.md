# ConversationSyncEventLiveSignalHostAdapter

> **源码**: `src/features/chat/services/ConversationSyncEventLiveSignalHostAdapter.ts`
> **状态**: [REVIEW]

## 概述

`ConversationSyncEventLiveSignalHostAdapter` 把 `OpenCodianView` 里原本并排存在的 session sync event host 与 session todo/status live-signal host 装配合并到一个共享 seam，专门负责：

- 统一暴露 session→tab 匹配所需的只读 lookup 能力（tabs、conversations、current conversation、active tab）
- 从同一份 view seam 派生 `ConversationSyncEventAdapterHost` 与 `ConversationSessionLiveSignalAdapterHost`
- 让共享 lookup seam 直接可被 `ConversationSessionTabResolver` 复用，而不是把匹配规则散落到两个 adapter 内
- 让 `OpenCodianView` 只保留一次 host assembly，而不是继续维护两段平行闭包

它不负责 session signal 的订阅生命周期，也不负责具体的 todo/status 写回或 sync 调度；这些行为仍分别由 `ConversationSyncEventAdapter` 与 `ConversationSessionLiveSignalAdapter` 持有。

## 公开接口

```typescript
export interface ConversationSyncEventLiveSignalHostAdapterHost {
  subscribeToSessionSyncEvents(...): () => void;
  subscribeToSessionTodoUpdates(...): () => void;
  subscribeToSessionStatusUpdates(...): () => void;
  getAllTabs(): readonly TabData[];
  getConversations(): readonly Conversation[];
  getCurrentConversation(): Conversation | null;
  getActiveTabId(): TabId | null;
  scheduleConversationSyncFromSignal(...): void;
  applySessionTodoUpdate(...): void;
  applySessionStatusUpdate(...): void;
}

export function createConversationSyncEventLiveSignalHosts(...): {
  conversationSyncEventAdapterHost: ConversationSyncEventAdapterHost;
  conversationSessionLiveSignalAdapterHost: ConversationSessionLiveSignalAdapterHost;
}
```

## 边界

- `OpenCodianView` 只提供一份 sync/live-signal seam，不再单独创建两个 host factory
- `ConversationSessionTabResolver` 通过这份共享 lookup seam 解析 session 当前命中的 tab 集合
- `ConversationSyncEventAdapter` 继续专注于 session sync event 的 subscription + tab routing
- `ConversationSessionLiveSignalAdapter` 继续专注于 todo/status live signal 的 subscription + runtime writeback

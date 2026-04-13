# ConversationSyncEventAdapter

> **源码**: `src/features/chat/services/ConversationSyncEventAdapter.ts`
> **状态**: [REVIEW]

## 概述

`ConversationSyncEventAdapter` 把 `OpenCodianView` 里 session sync event 的 **订阅生命周期、session→tab 匹配，以及 cleanup wiring** 收束到一个独立模块，专门负责：

- 订阅 `openCodeService.subscribeToSessionSyncEvents()`，并在重启或销毁时统一释放旧订阅
- 根据 `sessionId` 把 `message.updated` / `message.part.updated` / `session.diff` 路由到当前打开的匹配 tab
- 当 tab 元数据暂时还没命中时，回落到当前 active conversation + active tab 的同步入口
- 把真正的 debounce / visible-vs-hidden dispatch 继续交给 `ConversationSyncOrchestrationService`

它不负责具体的服务端同步，也不负责 post-sync question/todo/background-task 收尾；这些职责仍分别留在现有 sync 服务里。

## 公开接口

```typescript
export interface ConversationSyncEventAdapterHost {
  subscribeToSessionSyncEvents(...): () => void;
  getAllTabs(): readonly TabData[];
  getConversations(): readonly Conversation[];
  getCurrentConversation(): Conversation | null;
  getActiveTabId(): TabId | null;
  scheduleConversationSyncFromSignal(...): void;
}

export class ConversationSyncEventAdapter {
  start(): void;
  stop(): void;
}
```

## 关键行为

### subscription lifecycle

- `start()` 会先清理旧订阅，再重新绑定最新的 session sync listener
- `stop()` 只负责释放当前 listener，不触碰 sync runtime / debounce timer 本身
- 因此 view 不再需要自己维护 `disposeSessionSyncEventSubscription`

### session-to-tab routing

- adapter 会读取当前 tab 列表和 conversation 列表，按 `openCodeSessionId` 找到所有匹配的 tab
- 如果暂时没有 tab 命中，但当前 active conversation 的 session 匹配，adapter 会把 signal 回落到 active tab
- 每个命中的 tab 都只接收一次 `scheduleConversationSyncFromSignal(tabId, update.type)` 调度

## 与相邻模块的边界

- `OpenCodianView` 现在通过 `ConversationSyncEventLiveSignalHostAdapter` 提供共享 host seam，不再直接维护单独的 sync-event host factory
- `ConversationSyncEventLiveSignalHostAdapter` 负责把共享 lookup seam 装配成 `ConversationSyncEventAdapterHost`
- `ConversationSyncEventAdapter` 负责 “事件从 OpenCodeService 进来后该落到哪些 tab”
- `ConversationSyncOrchestrationService` 继续负责 “这些 tab signal 进来后如何 debounce、选 visible/hidden sync 路径、何时触发后台轮询”
- 这次切片继续推进 master plan 的 P1 `OpenCodianView` 核心 ownership 迁移：减少 view 对 sync signal lifecycle 的直接 ownership，而不是继续回到已暂停的 trailing-assistant helper 链

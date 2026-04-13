# ConversationSyncEventAdapter

> **源码**: `src/features/chat/services/ConversationSyncEventAdapter.ts`
> **状态**: [REVIEW]

## 概述

`ConversationSyncEventAdapter` 把 `OpenCodianView` 里 session sync event 的 **订阅生命周期、sync 调度入口，以及 cleanup wiring** 收束到一个独立模块，专门负责：

- 订阅 `openCodeService.subscribeToSessionSyncEvents()`，并在重启或销毁时统一释放旧订阅
- 通过 `ConversationSessionTabResolver` 根据 `sessionId` 把 `message.updated` / `message.part.updated` / `session.diff` 路由到当前打开的匹配 tab
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

### session signal routing

- adapter 通过 `ConversationSessionTabResolver` 复用共享的 session→tab 匹配与 active-tab fallback 规则
- 每个命中的 tab 都只接收一次 `scheduleConversationSyncFromSignal(tabId, update.type)` 调度

## 与相邻模块的边界

- `OpenCodianView` 现在只持有 `ConversationSessionSignalRuntime`，不再直接 start/stop 单独的 sync-event adapter
- `ConversationSessionSignalRuntime` 负责装配共享 resolver、host seam 与 adapter 生命周期
- `ConversationSessionTabResolver` 负责把共享 lookup seam 解释成当前 signal 应命中的 tab 集合
- `ConversationSyncEventLiveSignalHostAdapter` 负责把共享 lookup seam 装配成 `ConversationSyncEventAdapterHost`
- `ConversationSyncEventAdapter` 负责 “事件从 OpenCodeService 进来后该落到哪些 tab”
- `ConversationSyncOrchestrationService` 继续负责 “这些 tab signal 进来后如何 debounce、选 visible/hidden sync 路径、何时触发后台轮询”
- 这次切片继续推进 master plan 的 P1 `OpenCodianView` 核心 ownership 迁移：减少 view 对 sync signal lifecycle 的直接 ownership，而不是继续回到已暂停的 trailing-assistant helper 链

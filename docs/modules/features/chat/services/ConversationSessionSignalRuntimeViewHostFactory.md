# ConversationSessionSignalRuntimeViewHostFactory

> **源码**: `src/features/chat/services/ConversationSessionSignalRuntimeViewHostFactory.ts`
> **状态**: [REVIEW]

## 概述

`ConversationSessionSignalRuntimeViewHostFactory` 把 `OpenCodianView` 到 session-signal runtime 的 host 装配收束到一个更窄的 factory seam，专门负责：

- 从 view 暴露的只读 tab/conversation lookup 与 sync 调度入口生成 `ConversationSyncEventLiveSignalHostAdapterHost`
- 通过 late-bound subscription port 转发 OpenCode session sync / todo / status signal 订阅
- 通过 late-bound writeback port 转发 session todo/status runtime 写回
- 让 `OpenCodianView` 不再直接维护 sync-event 与 live-signal 的完整闭包装配

它不负责订阅生命周期、session→tab 路由、todo/status 状态更新语义，或 background-task reconcile；这些仍由 `ConversationSessionSignalRuntime`、`ConversationSyncEventAdapter` 与 `ConversationSessionLiveSignalAdapter` 持有。

## 公开接口

```typescript
export interface ConversationSessionSignalRuntimeViewHostFactoryHost {
  getSessionSignalSubscriptions(): ConversationSessionSignalSubscriptionPort;
  getSessionSignalWriteback(): ConversationSessionSignalWritebackPort;
  getAllTabs(): readonly TabData[];
  getConversations(): readonly Conversation[];
  getCurrentConversation(): Conversation | null;
  getActiveTabId(): TabId | null;
  scheduleConversationSyncFromSignal(...): void;
}

export function createConversationSessionSignalRuntimeViewHost(
  host: ConversationSessionSignalRuntimeViewHostFactoryHost,
): ConversationSyncEventLiveSignalHostAdapterHost;
```

## 边界

- `OpenCodianView` 只提供 factory host 的 lookup、subscription port、writeback port 与 sync 调度入口
- `ConversationSessionSignalRuntimeViewHostFactory` 负责把这些较窄端口组合成共享 session-signal host seam
- `ConversationSyncEventLiveSignalHostAdapter` 继续负责从共享 seam 派生 sync-event host 与 live-signal host
- `ConversationSessionSignalRuntime` 继续负责 adapter 装配、共享 resolver 注入和 start/stop 生命周期

# ConversationSessionLiveSignalAdapter

> **源码**: `src/features/chat/services/ConversationSessionLiveSignalAdapter.ts`
> **状态**: [REVIEW]

## 概述

`ConversationSessionLiveSignalAdapter` 把 `OpenCodianView` 里 session todo/status live signal 的 **订阅生命周期、runtime 写回，以及 background-task reconcile 触发** 收束到一个独立模块，专门负责：

- 同时持有 `subscribeToSessionTodoUpdates()` 与 `subscribeToSessionStatusUpdates()` 的 start/stop/restart cleanup
- 通过 `ConversationSessionTabResolver` 把 session todo/status live update 路由到所有共享同一 `openCodeSessionId` 的 tab
- 在命中 tab 写入 todo/status runtime state 后，直接触发 `BackgroundTaskLiveSignalCoordinator.reconcileStateFromLiveSignals()`

它不负责 todo/status runtime state 的 fingerprint、stale suppression，也不自己决定 background task stale/notice；这些能力仍分别由 `SessionTodoStateService` 与 `BackgroundTaskLiveSignalCoordinator` 负责。本 adapter 只负责把 live signal 更新后的 tab 直接交给共享的 session todo runtime facade + background-task coordinator，不再让 `OpenCodianView` 私有 helper 额外转发这一步。

## 公开接口

```typescript
export interface ConversationSessionLiveSignalAdapterHost {
  subscribeToSessionTodoUpdates(...): () => void;
  subscribeToSessionStatusUpdates(...): () => void;
  getAllTabs(): readonly TabData[];
  getConversations(): readonly Conversation[];
  getCurrentConversation(): Conversation | null;
  getActiveTabId(): TabId | null;
  applySessionTodoUpdate(...): void;
  applySessionStatusUpdate(...): void;
}

export class ConversationSessionLiveSignalAdapter {
  constructor(host, backgroundTaskLiveSignalCoordinator);
  start(): void;
  stop(): void;
}
```

## 关键行为

### 双订阅生命周期

- `start()` 每次都会先调用 `stop()`，避免 view reopen 或 host rebuild 后保留旧 listener
- `stop()` 会统一释放 todo/status 两条 listener，保证 cleanup wiring 不再散落在 `OpenCodianView`

### session→tab 路由

- live update 通过 `ConversationSessionTabResolver` 复用共享的 session→tab 匹配与 active-tab fallback
- 同一 session 被多个 tab 打开时，adapter 会把同一条 todo/status signal 分发给所有匹配 tab

## 与 `OpenCodianView` 的边界

- `OpenCodianView` 现在只持有 `ConversationSessionSignalRuntime`，不再直接 start/stop todo/status live-signal adapter
- `ConversationSessionSignalRuntime` 负责装配共享 resolver、live-signal host seam 与 adapter 生命周期
- `ConversationSessionTabResolver` 负责把共享 lookup seam 解释成 live signal 当前应命中的 tab 集合
- `ConversationSyncEventLiveSignalHostAdapter` 负责把共享 lookup seam 装配成 `ConversationSessionLiveSignalAdapterHost`
- `SessionTodoStateService` 继续负责 todo/status runtime state、stale suppression 与 persisted notice 协调
- `ConversationSessionLiveSignalAdapter` 会在 runtime state 写入后直接调用 `BackgroundTaskLiveSignalCoordinator`，决定 indicator/stopped notice 是否需要变化

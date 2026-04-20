# ConversationSessionSignalRuntime

> **源码**: `src/features/chat/services/ConversationSessionSignalRuntime.ts`
> **状态**: [REVIEW]

## 概述

`ConversationSessionSignalRuntime` 把 `OpenCodianView` 里 session sync event 与 todo/status live-signal 的 **订阅生命周期、session→tab 路由、sync 调度，以及 live writeback/reconcile** 收束到一个独立模块，专门负责：

- 统一订阅 `subscribeToSessionSyncEvents()`、`subscribeToSessionTodoUpdates()` 与 `subscribeToSessionStatusUpdates()`
- 共享一份 `ConversationSessionTabResolver`，把每个 session signal 解释成当前应命中的 tab 列表
- 把 `session.diff` 继续交给 `ConversationSyncOrchestrationService` 的 schedule 入口
- 把 message / part sync signal 直接交给 `ConversationSyncBridge` 的 canonical mutation 入口
- 把 todo/status live signal 写回 `SessionTodoCoordinator`，并在每次 live update 后继续触发 `BackgroundTaskLiveSignalCoordinator`

它不负责 session→conversation lookup 本身，也不负责 sync debounce / dispatch 或 todo 状态机；这些职责仍分别由 `ConversationSessionTabResolver`、`ConversationSyncOrchestrationService`、`SessionTodoCoordinator` 与 `BackgroundTaskLiveSignalCoordinator` 持有。

## 公开接口

```typescript
export interface ConversationSessionSignalRuntimeHost {
  subscribeToSessionSyncEvents(...): () => void;
  subscribeToSessionTodoUpdates(...): () => void;
  subscribeToSessionStatusUpdates(...): () => void;
  scheduleConversationSyncFromSignal(...): void;
  applySessionSyncEvent(...): void;
  applySessionTodoUpdate(...): void;
  applySessionStatusUpdate(...): void;
}

export class ConversationSessionSignalRuntime {
  constructor(host: ConversationSessionSignalRuntimeHost, backgroundTaskLiveSignalCoordinator);
  start(): void;
  stop(): void;
}
```

## 边界

- `OpenCodianView` 只保留 host assembly 与 runtime lifecycle，不再串联多层 session-signal provider / factory / adapter seam
- `ConversationSessionTabResolver` 负责被 runtime 共享的 session→tab 匹配规则与 active-tab fallback
- `ConversationSyncOrchestrationService` 继续负责 `session.diff` 这类 authoritative reload signal 的 debounce、tab/conversation 选择与 dispatch
- `ConversationSyncBridge` 负责 message / part sync 触发的 canonical local merge 与 gap fallback reload
- `SessionTodoCoordinator` 继续负责 todo/status runtime 写回语义与后续 refresh 入口
- `BackgroundTaskLiveSignalCoordinator` 继续负责 live update 之后的 indicator/stale reconcile 判定

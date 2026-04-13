# ConversationSessionSignalRuntime

> **源码**: `src/features/chat/services/ConversationSessionSignalRuntime.ts`
> **状态**: [REVIEW]

## 概述

`ConversationSessionSignalRuntime` 把 `OpenCodianView` 里 session sync event 与 todo/status live-signal 的 **adapter 装配、共享 resolver 注入，以及统一 start/stop 生命周期** 收束到一个独立模块，专门负责：

- 接收 `ConversationSessionSignalRuntimeViewHostFactory` 生成的共享 `ConversationSyncEventLiveSignalHostAdapterHost`
- 以同一份共享 session-signal host 派生 sync-event host 与 live-signal host
- 创建并共享一份 `ConversationSessionTabResolver`，避免两个 adapter 各自重新装配同类 lookup 依赖
- 把 `ConversationSyncEventAdapter` 与 `ConversationSessionLiveSignalAdapter` 收束到单一 runtime lifecycle，减少 view 级 start/stop wiring

它不负责 session signal 的具体订阅逻辑，也不负责 todo/status 写回或 sync 调度；这些职责仍由两个 adapter 与下游 runtime/service 持有。

## 公开接口

```typescript
export class ConversationSessionSignalRuntime {
  start(): void;
  stop(): void;
}

export function createConversationSessionSignalRuntime(
  host: ConversationSyncEventLiveSignalHostAdapterHost,
  backgroundTaskLiveSignalCoordinator,
): ConversationSessionSignalRuntime;
```

## 边界

- `OpenCodianView` 只负责提供更窄的 runtime host factory 输入，并持有 runtime 生命周期
- `ConversationSessionSignalRuntimeViewHostFactory` 负责从 view / service 端口创建共享 session-signal host seam
- `ConversationSyncEventLiveSignalHostAdapter` 负责把 view seam 派生为两个 adapter host
- `ConversationSessionTabResolver` 负责被 runtime 共享的 session→tab 匹配逻辑
- `ConversationSyncEventAdapter` 继续处理 session sync event 订阅与 sync 调度入口
- `ConversationSessionLiveSignalAdapter` 继续处理 todo/status live signal 写回与 background-task reconcile

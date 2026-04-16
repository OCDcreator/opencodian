# ConversationSyncLoadRuntimeViewHostFactory

> **源码**: `src/features/chat/services/ConversationSyncLoadRuntimeViewHostFactory.ts`
> **状态**: [REVIEW]

## 概述

`ConversationSyncLoadRuntimeViewHostFactory` 把 conversation sync/load 共享 seam 的 host 装配，收束到一个更窄的 factory 模块，专门负责：

- 直接从 `OpenCodianView` 暴露的扁平 conversation store、tab runtime 与 sync bridge seam 生成 `ConversationSyncLoadRuntimeHostAdapterHost`
- 在 factory 内固定 loaded-conversation server-sync 判定规则，避免这段 activation/sync policy 继续散落在 `OpenCodianView` 的 host 闭包里
- 让 `OpenCodianView` 只保留更扁平的 sync/load seam，而不再通过额外 host-provider facade 维护 grouped factory-host 结构

它不负责 sync runtime/orchestration、loaded-conversation hydration，或 server 消息合并本身；这些仍由 `ConversationSyncHostAdapter`、`ConversationLoadRuntimeBridge`、`ConversationSyncBridge` 与现有 hydration/transition bridge 持有。

## 公开接口

```typescript
export interface ConversationSyncLoadRuntimeViewHost extends
  ConversationSyncLoadConversationStorePort,
  ConversationSyncLoadTabRuntimePort,
  ConversationSyncLoadBridgePort {
  hasInterruptedLocalAssistantTail(messages: ChatMessage[]): boolean;
}

export function createConversationSyncLoadRuntimeViewHosts(
  host: ConversationSyncLoadRuntimeViewHost,
): ConversationSyncLoadRuntimeHosts;
```

## 边界

- `OpenCodianView` 只提供扁平 sync/load seam 的 late-bound 实现
- `ConversationSyncLoadRuntimeViewHostFactory` 直接负责把扁平 seam 组合成共享 sync/load host seam，并固化 load-side server-sync policy
- `ConversationSyncLoadRuntimeHostAdapter` 继续负责从共享 seam 派生 `ConversationSyncViewHost` 与 `ConversationLoadRuntimeBridgeHost`
- `ConversationSyncHostAdapter` 与 `ConversationLoadRuntimeBridge` 的行为边界保持不变

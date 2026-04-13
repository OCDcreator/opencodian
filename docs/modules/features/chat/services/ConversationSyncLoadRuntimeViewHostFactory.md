# ConversationSyncLoadRuntimeViewHostFactory

> **源码**: `src/features/chat/services/ConversationSyncLoadRuntimeViewHostFactory.ts`
> **状态**: [REVIEW]

## 概述

`ConversationSyncLoadRuntimeViewHostFactory` 把 `OpenCodianView` 里 conversation sync/load 共享 seam 的 host 装配，收束到一个更窄的 factory 模块，专门负责：

- 从 view 暴露的 conversation store、tab runtime 与 sync bridge 三组 late-bound port 生成 `ConversationSyncLoadRuntimeHostAdapterHost`
- 在 factory 内固定 loaded-conversation server-sync 判定规则，避免这段 activation/sync policy 继续散落在 `OpenCodianView` 的 host 闭包里
- 让 `OpenCodianView` 只保留更窄的 lookup / runtime / bridge 输入，而不是继续直接维护整份 sync/load adapter seam

它不负责 sync runtime/orchestration、loaded-conversation hydration，或 server 消息合并本身；这些仍由 `ConversationSyncHostAdapter`、`ConversationLoadRuntimeBridge`、`ConversationSyncBridge` 与现有 hydration/transition bridge 持有。

## 公开接口

```typescript
export interface ConversationSyncLoadRuntimeViewHostFactoryHost {
  getConversationStore(): ConversationSyncLoadConversationStorePort;
  getTabRuntime(): ConversationSyncLoadTabRuntimePort;
  getConversationSyncBridge(): ConversationSyncLoadBridgePort;
  hasInterruptedLocalAssistantTail(messages: ChatMessage[]): boolean;
}

export function createConversationSyncLoadRuntimeViewHosts(
  host: ConversationSyncLoadRuntimeViewHostFactoryHost,
): ConversationSyncLoadRuntimeHosts;
```

## 边界

- `OpenCodianView` 只提供 factory host 的 conversation lookup、tab/runtime 读取、sync bridge 写回与 interrupted-tail 判定
- `ConversationSyncLoadRuntimeViewHostFactory` 负责把这些较窄端口组合成共享 sync/load host seam，并固化 load-side server-sync policy
- `ConversationSyncLoadRuntimeHostAdapter` 继续负责从共享 seam 派生 `ConversationSyncViewHost` 与 `ConversationLoadRuntimeBridgeHost`
- `ConversationSyncHostAdapter` 与 `ConversationLoadRuntimeBridge` 的行为边界保持不变

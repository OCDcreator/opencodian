# ConversationSyncLoadRuntimeHostAdapter

> **源码**: `src/features/chat/runtime/ConversationSyncLoadRuntimeHostAdapter.ts`
> **状态**: [REVIEW]

## 概述

`ConversationSyncLoadRuntimeHostAdapter` 把共享的 conversation sync/load seam，拆分成 `ConversationSyncHostAdapter` 与 `ConversationLoadRuntimeBridge` 各自需要的 host 形状。现在这份共享 seam 通常先由 `ConversationSyncLoadRuntimeViewHostFactory` 从 `OpenCodianView` 的更窄 port 装配出来，再交给本模块统一派生。

它不负责 sync orchestration，或 loaded-conversation hydration 本身；load-side server-sync 判定规则现在固定在 `ConversationSyncLoadRuntimeViewHostFactory`，其余职责仍分别留给 `ConversationSyncHostAdapter`、`ConversationLoadRuntimeBridge` 与现有 service/bridge。

## 公开接口

```typescript
export interface ConversationSyncLoadRuntimeHostAdapterHost {
  getCurrentConversation: ConversationSyncViewHost['getCurrentConversation'];
  getActiveTabId: ConversationSyncViewHost['getActiveTabId'];
  getAllTabs: ConversationSyncViewHost['getAllTabs'];
  getTab: ConversationSyncViewHost['getTab'];
  getTabRuntimeState: ConversationSyncViewHost['getTabRuntimeState'];
  loadConversations: ConversationLoadRuntimeBridgeHost['loadConversations'];
  getConversationById: ConversationSyncViewHost['getConversationById'];
  shouldSyncConversationFromServer: ConversationLoadRuntimeBridgeHost['shouldSyncConversationFromServer'];
  getConversationSyncFingerprint: ConversationSyncViewHost['getConversationSyncFingerprint'];
  syncConversationMessagesFromServer: ConversationSyncViewHost['syncConversationMessagesFromServer'];
  syncConversationMessagesFromCanonicalState: ConversationSyncViewHost['syncConversationMessagesFromCanonicalState'];
  setCurrentConversationRevertState: ConversationLoadRuntimeBridgeHost['setCurrentConversationRevertState'];
  applySyncedConversationUpdate: ConversationSyncViewHost['applySyncedConversationUpdate'];
  renderBackgroundTaskIndicatorIfNeeded: ConversationSyncViewHost['renderBackgroundTaskIndicatorIfNeeded'];
}

export interface ConversationSyncLoadRuntimeHosts {
  conversationSyncViewHost: ConversationSyncViewHost;
  conversationLoadRuntimeBridgeHost: ConversationLoadRuntimeBridgeHost;
}

export function createConversationSyncLoadRuntimeHosts(
  host: ConversationSyncLoadRuntimeHostAdapterHost,
): ConversationSyncLoadRuntimeHosts;
```

## 关键行为

- `createConversationSyncLoadRuntimeHosts()` 从同一份 view seam 派生 `ConversationSyncViewHost`，让 sync runtime/orchestration/bridge 继续沿用既有 `ConversationSyncHostAdapter` 入口
- sync host 侧会把 canonical local-sync callback 一并透传给 `ConversationSyncBridge`，避免 message/part sync 又额外绕回主 view
- 同一个 adapter 额外派生 `ConversationLoadRuntimeBridgeHost`，把 load-conversation 的 reload、server-sync 判定与 revert-state 写回入口也收束到同一装配点
- load host 会继续复用 sync callback 的返回值，但只向 `ConversationLoadRuntimeBridge` 暴露它真正需要的 `messages` 与 `revertState`

## 与 `OpenCodianView` 的边界

- `OpenCodianView` 只保留更窄的 conversation store、tab/runtime、sync bridge 与 interrupted-tail 判定输入
- `ConversationSyncLoadRuntimeViewHostFactory` 先把这些较窄 port 收束成共享 sync/load seam；本模块再把共享 seam 映射成 sync/load 两侧需要的 host 形状
- 这条边界推进的是 master plan 的 P1 `activation / sync / runtime bridge ownership`：让 sync/load host assembly 不再分散滞留在主 view 内

# ConversationSyncLoadRuntimeHostAdapter

> **源码**: `src/features/chat/runtime/ConversationSyncLoadRuntimeHostAdapter.ts`
> **状态**: [REVIEW]

## 概述

`ConversationSyncLoadRuntimeHostAdapter` 把 `OpenCodianView` 里原本分开的 conversation sync view-host 与 load-runtime host 装配收束到一个单独模块。view 现在只需要提供一份共享的 sync/load seam；真正分发给 `ConversationSyncHostAdapter` 与 `ConversationLoadRuntimeBridge` 的 host shape，则由本模块统一派生。

它不负责 sync orchestration、server-sync 业务规则，或 loaded-conversation hydration 本身；这些仍分别留给 `ConversationSyncHostAdapter`、`ConversationLoadRuntimeBridge` 与现有 service/bridge。

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
- 同一个 adapter 额外派生 `ConversationLoadRuntimeBridgeHost`，把 load-conversation 的 reload、server-sync 判定与 revert-state 写回入口也收束到同一装配点
- load host 会继续复用 sync callback 的返回值，但只向 `ConversationLoadRuntimeBridge` 暴露它真正需要的 `messages` 与 `revertState`

## 与 `OpenCodianView` 的边界

- `OpenCodianView` 继续保留真实的 conversation 查询、sync 执行、fingerprint 计算、interrupted-tail 判定与 background-task indicator 写回
- 本模块只负责把这些 view-level seam 映射成 sync/load 两侧需要的 host 形状
- 这条边界推进的是 master plan 的 P1 `activation / sync / runtime bridge ownership`：让 sync/load host assembly 不再分散滞留在主 view 内

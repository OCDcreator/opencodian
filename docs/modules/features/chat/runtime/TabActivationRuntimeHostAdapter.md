# TabActivationRuntimeHostAdapter

> **源码**: `src/features/chat/runtime/TabActivationRuntimeHostAdapter.ts`
> **状态**: [REVIEW]

## 概述

`TabActivationRuntimeHostAdapter` 把 `OpenCodianView` 里原本分散的 tab activation / conversation-state / runtime-state bridge host 闭包装配，收束成一个单独的 host adapter。这样 view 只需要提供一份较宽但稳定的 tab-runtime writeback seam，真正分发给 `TabActivationBridgeHostFactory`、`TabConversationStateBridge` 与 `TabRuntimeStateBridge` 的 host shape 则由本模块统一派生。

它不负责实例化 bridge 本身，也不接管 activation / sync 流程编排；这些仍分别留在 `OpenCodianView` 与对应 bridge/service 中。本模块只负责 host assembly。

## 公开接口

```typescript
export interface TabActivationRuntimeHostAdapterHost extends TabActivationBridgeHostFactoryHost {
  getTabManager(): ...;
  getSessionIdForTab(tabId: TabId | null): string | null;
  setCurrentConversation(conversation: Conversation | null): void;
  setCurrentConversationRevertState(...): void;
  setOpenCodeSessionId(sessionId: string): void;
  clearPendingQuestionsForTab(tabId: TabId | null): void;
  resetTabSessionState(tabId: TabId | null, sessionId: string | null): void;
  clearTabSessionState(tabId: TabId | null): void;
  resetBackgroundTaskSuppressedFingerprint(tabId: TabId | null): void;
  getConversationSyncFingerprint(messages: ChatMessage[]): string;
  setLastConversationSyncFingerprint(fingerprint: string): void;
  startConversationSyncLoop(): void;
  stopConversationSyncLoop(): void;
  getTabRuntimeState(tabId: TabId | null): { isStreaming: boolean } | null;
  getTabMessagesContainer(tabId: TabId | null): ParentNode | null;
  hasBackgroundTaskIndicator(tabId: TabId | null): boolean;
}

export interface TabActivationRuntimeBridgeHosts {
  tabActivationBridgeHosts: TabActivationBridgeHosts;
  tabConversationStateBridgeHost: TabConversationStateBridgeHost;
  tabRuntimeStateBridgeHost: TabRuntimeStateBridgeHost;
}

export function createTabActivationRuntimeBridgeHosts(
  host: TabActivationRuntimeHostAdapterHost,
): TabActivationRuntimeBridgeHosts;
```

## 关键行为

- `createTabActivationRuntimeBridgeHosts()` 复用既有 `createTabActivationBridgeHosts()`，继续让 `TabViewActivationBridge` 与 `TabConversationActivationBridge` 共享同一个 activation seam
- 同一个 adapter 额外派生 `TabConversationStateBridgeHost` 与 `TabRuntimeStateBridgeHost`，把 conversation/session 写回与 tab stream-like 状态写回集中到单一 host-assembly 入口
- `OpenCodianView` 因此不再维护三段平行的 bridge host 闭包，P1 activation/runtime bridge host wiring 进一步下沉到 dedicated module

## 与 `OpenCodianView` 的边界

- `OpenCodianView` 继续保留真实的 `TabManager`、session todo runtime、DOM 与 send-button 写回实现
- 本模块只负责把这些 view-level seam 适配成三个 runtime bridge 需要的 host 形状
- 这条边界推进的是 master plan 的 P1 `activation / sync / runtime bridge ownership`，目标是让 view 更接近 bridge 装配入口，而不是继续持有细碎 host 闭包

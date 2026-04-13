# ConversationSyncLoadRuntimeHostProvider

> **源码**: `src/features/chat/services/ConversationSyncLoadRuntimeHostProvider.ts`
> **状态**: [REVIEW]

## 概述

`ConversationSyncLoadRuntimeHostProvider` 是夹在 `OpenCodianView` 与 `ConversationSyncLoadRuntimeViewHostFactory` 之间的一层薄 facade。它把 view 暴露的一份更扁平的 conversation sync/load seam，重新分组为 factory 仍然需要的三组 ports：

- conversation store
- tab runtime
- conversation sync bridge

这样 `OpenCodianView` 不再直接维护 grouped factory-host 结构，只保留更薄的 late-bound sync/load seam；既有 `ConversationSyncLoadRuntimeViewHostFactory` 与 `ConversationSyncLoadRuntimeHostAdapter` 继续负责 shared host assembly、server-sync policy 与 runtime bridge host 派生。

## 公开接口

```typescript
export interface ConversationSyncLoadRuntimeHostProviderHost {
  loadConversations(): Promise<void>;
  getConversationById(id: string): Promise<Conversation | null>;
  getCurrentConversation(): Conversation | null;
  getActiveTabId(): TabId | null;
  getAllTabs(): TabData[];
  getTab(tabId: TabId | null): TabData | null;
  getTabRuntimeState(tabId: TabId | null): TabRuntimeState;
  getConversationSyncFingerprint(messages: ChatMessage[]): string;
  syncConversationMessagesFromServer(
    conversation: Conversation,
    tabId: TabId | null,
    reason: ConversationSyncReason,
    options?: ConversationSyncOptions,
  ): Promise<ConversationSyncResult>;
  setCurrentConversationRevertState(revertState: ConversationRevertState): void;
  applySyncedConversationUpdate(
    previousMessages: ChatMessage[],
    nextMessages: ChatMessage[],
  ): Promise<void>;
  renderBackgroundTaskIndicatorIfNeeded(tabId: TabId | null): Promise<void>;
  hasInterruptedLocalAssistantTail(messages: ChatMessage[]): boolean;
}

export function createConversationSyncLoadRuntimeViewHostFactoryHost(
  host: ConversationSyncLoadRuntimeHostProviderHost,
): ConversationSyncLoadRuntimeViewHostFactoryHost;
```

## 边界

- `OpenCodianView` 只保留扁平 sync/load seam 的 late-bound 实现
- `ConversationSyncLoadRuntimeHostProvider` 只负责重新分组，不新增业务逻辑
- `ConversationSyncLoadRuntimeViewHostFactory` 继续负责共享 sync/load host assembly 与 load-side server-sync policy
- `ConversationSyncLoadRuntimeHostAdapter` 继续负责派生 `ConversationSyncViewHost` 与 `ConversationLoadRuntimeBridgeHost`

# TabActivationRuntimeHostProvider

> **源码**: `src/features/chat/services/TabActivationRuntimeHostProvider.ts`
> **状态**: [REVIEW]

## 概述

`TabActivationRuntimeHostProvider` 是夹在 `OpenCodianView` 与 `TabActivationRuntimeViewHostFactory` 之间的一层薄 facade。它把 view 暴露的一份更扁平的 activation/runtime seam，重新分组为 factory 仍然需要的六组 ports：

- tab runtime
- conversation state
- question/todo runtime
- background-task runtime
- conversation-sync runtime
- view writeback

其中 conversation-sync runtime port 现在由 `TabActivationRuntimeViewHostFactory` 自身内联收束 fingerprint read/write 与 loop-control seam，再由本模块与其他 activation ports 一起交给 factory。这样 `OpenCodianView` 不再直接维护 grouped factory-host 结构，只保留更薄的 late-bound runtime seam；既有 `TabActivationRuntimeViewHostFactory` 与 `TabActivationRuntimeHostAdapter` 继续负责 shared host assembly 与 bridge host 派生。

## 公开接口

```typescript
export interface TabActivationRuntimeHostProviderHost {
  getTabManager(): TabActivationRuntimeBridgeTabManager | null;
  getActiveTabId(): TabId | null;
  getSessionIdForTab(tabId: TabId | null): string | null;
  getTabRuntimeState(tabId: TabId | null): TabRuntimeState;
  getTabMessagesContainer(tabId: TabId | null): ParentNode | null;
  setCurrentConversation(conversation: Conversation | null): void;
  setCurrentConversationRevertState(revertState: ConversationRevertState): void;
  setOpenCodeSessionId(sessionId: string): void;
  applyConversationSessionSettings(conversation: Conversation | null): void;
  clearPendingQuestionsForTab(tabId: TabId | null): void;
  resetTabSessionState(tabId: TabId | null, sessionId: string | null): void;
  clearTabSessionState(tabId: TabId | null): void;
  resetBackgroundTaskSuppressedFingerprint(tabId: TabId | null): void;
  hasBackgroundTaskIndicator(tabId: TabId | null): boolean;
  getConversationSyncRuntime(): TabActivationConversationSyncRuntimePort;
  updateSendButtonState(): void;
  setActiveMessagesPane(tabId: TabId | null): void;
  scheduleComposerLayoutSync(): void;
  updateModelSelectorDisplay(): void;
  clearMessagesContainer(): void;
  resetTurnState(): void;
  scheduleSettledScrollToBottom(tabId: TabId | null): void;
}

export function createTabActivationRuntimeViewHostFactoryHost(
  host: TabActivationRuntimeHostProviderHost,
): TabActivationRuntimeViewHostFactoryHost;
```

## 边界

- `OpenCodianView` 只保留扁平 activation/runtime seam 的 late-bound 实现
- `TabActivationRuntimeViewHostFactory` 自身负责 conversation-sync fingerprint / loop-control regrouping
- `TabActivationRuntimeHostProvider` 只负责重新分组，不新增业务逻辑；conversation session settings runtime reapply 也只是作为 conversation-state port 的一部分继续透传
- **prompt suggestion session sync**：`setCurrentConversation` 在转发给 host 后，通过 `getActiveTabId()` + `getTabMessagesContainer()` 定位当前 tab 的 messages container，再使用 `findPromptSuggestionScope()` 从 DOM 发现对应 coordinator 的 channel，最后经 `emitPromptSuggestionSessionChange(sessionId, channelId)` 推送 session 变更。该机制把 prompt suggestion lifecycle 从 `OpenCodianView` 的 host seam 中移除，完全由 channel bus 承载
- `TabActivationRuntimeViewHostFactory` 继续负责 shared activation runtime host assembly
- `TabActivationRuntimeHostAdapter` 继续负责派生 activation / conversation-state / runtime-state bridge hosts

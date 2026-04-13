# ConversationHydrationRuntimeHostProvider

> **源码**: `src/features/chat/services/ConversationHydrationRuntimeHostProvider.ts`
> **状态**: [REVIEW]

## 概述

`ConversationHydrationRuntimeHostProvider` 是夹在 `OpenCodianView` 与 `ConversationHydrationRuntimeViewHostFactory` 之间的一层薄 facade。它把 view 暴露的一份更扁平的 hydration/transition seam，重新分组为 factory 仍然需要的四组 ports：

- hydration render runtime
- hydration outcome runtime
- conversation transition state
- conversation transition writeback

这样 `OpenCodianView` 不再直接维护 grouped hydration factory-host 结构，只保留 late-bound 的单职责 seam；既有 `ConversationHydrationRuntimeViewHostFactory` 与 hydration/transition bridges 继续负责共享 host assembly、scroll restore、loaded-conversation hydration tail 与 transition 协调。

## 公开接口

```typescript
export interface ConversationHydrationRuntimeHostProviderHost {
  getMessagesContainer(): HTMLElement | null;
  getActiveTabId(): TabId | null;
  getScrollRuntimeForTab(tabId: TabId | null): ScrollRuntimeState | null;
  scrollToBottom(options: { tabId: TabId | null }): void;
  syncPaneScrollMetrics(tabId: TabId | null, messagesEl: HTMLElement): void;
  requestAnimationFrame(callback: FrameRequestCallback): number;
  syncBackgroundTaskStateFromConversation(conversation: Conversation): void;
  renderMessages(messages: ChatMessage[]): Promise<void>;
  getCurrentConversation(): Conversation | null;
  cancelTitleGeneration(conversationId: string): void;
  clearPendingTitleGenerationStatus(conversationId: string): Promise<void> | void;
  resetBackgroundTaskIndicator(): void;
  clearScheduledScrollToBottom(): void;
  beginConversationHydration(tabId: TabId | null): void;
  clearMessagesContainer(): void;
  resetTurnState(): void;
  endConversationHydration(tabId: TabId | null): void;
}

export function createConversationHydrationRuntimeViewHostFactoryHost(
  host: ConversationHydrationRuntimeHostProviderHost,
): ConversationHydrationRuntimeViewHostFactoryHost;
```

## 边界

- `OpenCodianView` 只保留扁平 hydration/transition seam 的 late-bound 实现
- `ConversationHydrationRuntimeHostProvider` 只负责重新分组，不新增业务逻辑
- `ConversationHydrationRuntimeViewHostFactory` 继续负责把 grouped ports 组合成 hydration/transition bridge hosts
- `ConversationHydrationRenderBridge`、`ConversationHydrationOutcomeBridge` 与 `ConversationTransitionBridge` 的行为边界保持不变

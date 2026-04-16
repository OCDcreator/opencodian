# ConversationTransitionBridge

> **源码**: `src/features/chat/runtime/ConversationTransitionBridge.ts`
> **状态**: [REVIEW]

## 概述

`ConversationTransitionBridge` 把 loaded-conversation 切换里一段原本仍黏在 `ConversationViewStateService` / `OpenCodianView` 之间的 preflight shell 收束成单独边界：它统一负责旧会话切换前的标题生成取消与 background-task indicator cleanup，以及 hydration 前的消息区清空、turn state reset、scroll scheduling cleanup 和 hydration lifecycle shell。

它不决定何时切换 conversation、何时从服务端同步、何时重渲消息或何时执行 post-render/question/todo/context usage 刷新；这些仍分别留给 `ConversationViewStateService`、render host、`ConversationHydrationRenderBridge` 与 `TabViewActivationBridge`。bridge 只承接 loaded-conversation transition 里稳定的过渡壳层。

## 公开接口

```typescript
export interface LoadedConversationTransitionContext {
  activeTabId: TabId | null;
  hydrationRenderContext: ConversationHydrationRenderContext;
}

export interface ConversationTransitionBridgeHost {
  getCurrentConversation(): Pick<Conversation, 'id' | 'titleGenerationStatus'> | null;
  cancelTitleGeneration(conversationId: string): void;
  resetBackgroundTaskIndicator(): void;
  clearPendingTitleGenerationStatus(conversationId: string): Promise<void> | void;
  clearScheduledScrollToBottom(): void;
  beginConversationHydration(tabId: TabId | null): void;
  clearMessagesContainer(): void;
  resetTurnState(): void;
  endConversationHydration(tabId: TabId | null): void;
}

export interface ConversationTransitionPort {
  prepareLoadedConversationTransition(nextConversationId: string): Promise<void>;
  captureLoadedConversationTransition(preserveScrollPosition: boolean): LoadedConversationTransitionContext;
  beginLoadedConversationTransition(context: LoadedConversationTransitionContext): void;
  restoreLoadedConversationTransition(context: LoadedConversationTransitionContext): void;
  endLoadedConversationTransition(context: LoadedConversationTransitionContext): void;
}
```

## 关键行为

- `prepareLoadedConversationTransition()` 保持原有切换前语义：只在切到不同 conversation 时取消旧标题生成、重置 background-task indicator，并在 pending 标题生成时异步清空对应状态
- `captureLoadedConversationTransition()` 把 active-tab 与 hydration scroll/class shell context 统一打包，避免装载服务继续同时持有两段 bridge 状态
- `beginLoadedConversationTransition()` 保持原有 preflight 顺序：先清掉 scheduled scroll-to-bottom，再进入 hydration lifecycle、挂上 rehydrating shell、清空消息容器并重置 turn state
- `restoreLoadedConversationTransition()` 与 `endLoadedConversationTransition()` 只转发 hydration render restore 和 lifecycle 收尾，让 `ConversationViewStateService` 更接近“决定走哪条装载分支”的 orchestration 层

## 与 `OpenCodianView` 的边界

- `OpenCodianView` 继续保留真实的标题状态更新、background-task indicator、消息容器 DOM 与 hydration lifecycle 实现
- `ConversationHydrationRenderBridge` 继续只负责 scroll/class restore shell，不接管切换前 cleanup 或消息区清空
- `ConversationViewStateService` 现在通过本 bridge 触发 loaded-conversation 的 preflight cleanup 与 hydration shell，不再直接持有这些 host 回调
- 这条边界推进的是 master plan 的 P1 `OpenCodianView` 核心 ownership 迁移：把 loaded-conversation transition shell 从 view-state service 的 host surface 继续收束到 dedicated runtime bridge

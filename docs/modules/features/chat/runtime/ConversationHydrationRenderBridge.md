# ConversationHydrationRenderBridge

> **源码**: `src/features/chat/runtime/ConversationHydrationRenderBridge.ts`
> **状态**: [REVIEW]

## 概述

`ConversationHydrationRenderBridge` 把 loaded-conversation hydration 里仍然贴着 `ConversationViewStateService` 的消息容器 UI 壳层收束成独立 bridge：它统一负责捕获 active tab 的 scroll/runtime 快照、切换 `is-rehydrating` class，以及在消息重渲后复用 `ScrollManager` 恢复 bottom / anchor / distance 语义并回写 pane scroll metrics。

它不负责决定何时开始 hydration、何时从服务端同步、何时重渲消息或何时执行 post-render/question/todo/context usage 刷新；这些仍分别留给 `ConversationViewStateService`、render host 与 `TabViewActivationBridge`。bridge 只承接 loaded-conversation hydration 里那段稳定的消息容器 render shell。

## 公开接口

```typescript
export interface ConversationHydrationRenderContext {
  activeTabId: TabId | null;
  messagesEl: HTMLElement | null;
  runtime: ScrollRuntimeState | null;
  preserveScrollPosition: boolean;
  previousScrollTop: number;
  shouldStickToBottom: boolean;
}

export interface ConversationHydrationRenderBridgeHost {
  getMessagesContainer(): HTMLElement | null;
  getActiveTabId(): TabId | null;
  getScrollRuntimeForTab(tabId: TabId | null): ScrollRuntimeState | null;
  scrollToBottom(options: { tabId: TabId | null }): void;
  syncPaneScrollMetrics(tabId: TabId | null, messagesEl: HTMLElement): void;
  requestAnimationFrame(callback: FrameRequestCallback): number;
}

export interface ConversationHydrationRenderPort {
  captureHydrationContext(preserveScrollPosition: boolean): ConversationHydrationRenderContext;
  beginHydrationShell(context: ConversationHydrationRenderContext): void;
  restoreHydrationShell(context: ConversationHydrationRenderContext): void;
}
```

## 关键行为

- `captureHydrationContext()` 统一捕获 active tab、messages container、scroll runtime、前一帧 scrollTop，以及 preserve-scroll 模式下是否应 stick-to-bottom
- `beginHydrationShell()` 只负责给消息容器挂上 `is-rehydrating` class，不接管 hydrate lifecycle flag
- `restoreHydrationShell()` 在消息重渲后复用 `ScrollManager` 的 snapshot/restore helper：先更新 runtime 的 `autoScrollEnabled`，再按既有 bottom / preserve-anchor / preserve-distance 语义恢复位置，并在 restore 结束后同步 pane scroll metrics
- rehydrating class 的移除也收束在同一 shell 内，通过 `requestAnimationFrame()` 维持原有延后一帧的时序
- `ConversationViewStateService` 现在只从本 bridge 获取 hydration shell context，并在 begin/render/post-render 后调用对应入口，不再直接读写消息容器 scroll/class 细节

## 与 `OpenCodianView` 的边界

- `OpenCodianView` 继续保留真正的消息容器 DOM、tab runtime、`scrollToBottom()` 和 `syncPaneScrollMetrics()` 实现
- `ConversationViewStateService` 继续拥有 loaded-conversation hydration 的决策与生命周期，但不再直接依赖 `ScrollManager` 或消息容器 DOM class
- 这条边界推进的是 master plan 的 P1 `OpenCodianView` 核心 ownership 迁移：把 hydration render shell 从装载服务里迁到单一职责 bridge

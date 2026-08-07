# ConversationHydrationRenderBridge

> **源码**: `src/features/chat/runtime/ConversationHydrationRenderBridge.ts`
> **状态**: [REVIEW]

## 概述

`ConversationHydrationRenderBridge` 把 loaded-conversation hydration 里仍然贴着 `ConversationViewStateService` 的消息容器 UI 壳层收束成独立 bridge：它统一负责捕获 active tab 的 scroll/runtime 快照、切换 `is-rehydrating` class，以及在消息重渲后复用 `ScrollManager` 恢复 bottom / anchor / distance 语义并回写 pane scroll metrics。

它不负责决定何时开始 hydration、何时从服务端同步、何时清空消息区或何时执行 post-render/question/todo/context usage 刷新；这些仍分别留给 `ConversationViewStateService`、`ConversationTransitionBridge`、render host 与 `TabViewActivationBridge`。bridge 只承接 loaded-conversation hydration 里那段稳定的消息容器 render shell。

## 公开接口

```typescript
export interface ConversationHydrationRenderContext {
  activeTabId: TabId | null;
  messagesEl: HTMLElement | null;
  runtime: ScrollRuntimeState | null;
  preserveScrollPosition: boolean;
  previousScrollTop: number;
  shouldStickToBottom: boolean;
  /**
   * 在任何 clear 之前于 live DOM 上捕获的完整 anchor/distance 快照。
   * 若延迟到重建后才捕获，会选到新 DOM 的 anchor，恢复位置跳到顶部。
   */
  scrollSnapshot: ConversationScrollRestoreSnapshot | null;
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
  abortHydrationShell(context: ConversationHydrationRenderContext): void;
}
```

## 关键行为

- `captureHydrationContext()` 统一捕获 active tab、messages container、scroll runtime、前一帧 scrollTop，以及 preserve-scroll 模式下是否应 stick-to-bottom；同时在任何 clear 发生前于 live DOM 上捕获完整 scroll anchor 快照（真实 message-id anchor/offset、旧 scrollHeight、旧 scrollTop、distanceFromBottom），与 sync fallback 的捕获时机对齐
- `beginHydrationShell()` 只负责给消息容器挂上 `is-rehydrating` class，不接管 hydrate lifecycle flag
- `restoreHydrationShell()` 在消息重渲后复用 `ScrollManager` 的 snapshot/restore helper：优先采用 live `autoScrollEnabled`（hydration 期间的用户滚动意图优先于捕获时的 stick-to-bottom），经 `resolveEffectiveScrollRestoreSnapshot()` 决定最终快照，再按既有 bottom / preserve-anchor / preserve-distance 语义恢复位置（带 late-content reapply 窗口），并在 restore 结束后同步 pane scroll metrics
- `abortHydrationShell()` 供被 supersede 的 conversation load 使用：完全跳过 scroll restore，但仍释放 begin 阶段挂上的 `is-rehydrating` class
- rehydrating class 的移除也收束在同一 shell 内，通过 `requestAnimationFrame()` 维持原有延后一帧的时序
- `ConversationTransitionBridge` 现在会组合本 bridge 的 capture/begin/restore/abort shell；`ConversationViewStateService` 只持有 transition-level orchestration，不再直接读写消息容器 scroll/class 细节

## 与 `OpenCodianView` 的边界

- `OpenCodianView` 继续保留真正的消息容器 DOM、tab runtime、`scrollToBottom()` 和 `syncPaneScrollMetrics()` 实现
- `ConversationTransitionBridge` 继续拥有 loaded-conversation 切换前 cleanup 与 hydration shell 组装，但不接管 scroll restore 算法
- `ConversationViewStateService` 继续拥有 loaded-conversation hydration 的决策与生命周期，但不再直接依赖 `ScrollManager` 或消息容器 DOM class
- 这条边界推进的是 master plan 的 P1 `OpenCodianView` 核心 ownership 迁移：把 hydration render shell 从装载服务里迁到单一职责 bridge
- shell cleanup 的重试帧有上限；即使异常导致 nested owner 未归零，也不会永久递归 `requestAnimationFrame`。正常路径仍在 runtime depth 回到 0 时立即清理 class
- `ConversationTransitionBridge.endLoadedConversationTransition()` 会调用显式 `cleanupHydrationShell()` owner-end hook；因此 bounded retry 停止后，正常生命周期结束仍能恢复 class，不会永久禁用历史消息动画

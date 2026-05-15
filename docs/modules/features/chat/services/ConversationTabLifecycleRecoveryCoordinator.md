# ConversationTabLifecycleRecoveryCoordinator

> **源码**: `src/features/chat/services/ConversationTabLifecycleRecoveryCoordinator.ts`
> **状态**: [REVIEW]

## 概述

`ConversationTabLifecycleRecoveryCoordinator` 把 `OpenCodianView` 中 **tab close**、**conversation delete** 与 **delete-all 后 tab reset/bootstrap** 的 create-or-activate 决策收束到独立 coordinator。

它不负责消息 hydration，也不负责 current-tab new conversation 的消息区 shell；这些仍分别交给 `ConversationViewStateService`、`TabConversationActivationBridge` 和 `ConversationTabOpenCoordinator`。这个模块只承接：

- 关闭 tab 前的 foreground busy guard 与阻塞 notice
- tab close 成功后的 messages pane 清理
- close 后应激活现有 tab 还是静默创建 fallback tab
- conversation delete 后关联 tab 的关闭、pane 清理与 fallback create/activate 分支
- delete-all 后的 messages pane 清空、`TabManager` 重建与 fallback bootstrap；禁用可见标签时必须保留内部 fallback tab

## 公开接口

```typescript
export interface ConversationTabLifecycleRecoveryHost {
  getTabManager(): ConversationTabLifecycleRecoveryTabManager | null;
  isTabForegroundBusy(tabId: TabId): boolean;
  getCurrentConversationId(): string | null;
  createConversation(): Promise<Conversation>;
  deleteConversation(conversationId: string): Promise<void>;
  clearTabMessagesPanes(): void;
  resetTabManager(): void;
  removeTabMessagesPane(tabId: TabId): void;
  showNotice(message: string): void;
}

export interface ConversationTabLifecycleRecoveryPort {
  activateTab(tabId: TabId): Promise<void>;
  createConversationInNewTab(): Promise<void>;
}

export class ConversationTabLifecycleRecoveryCoordinator {
  closeTabAndRecover(tabId: TabId): Promise<void>;
  deleteConversationsAndRecover(conversationIds: readonly string[]): Promise<void>;
  deleteAllConversationsAndReset(conversationIds: readonly string[]): Promise<void>;
}
```

## 关键行为

- `closeTabAndRecover()` 仍会在目标 tab foreground busy 时走 `chat.tab.streamingBlocked` notice，并保持 tab 不变
- 普通 close 成功后，会清理对应 messages pane；若 `TabManager` 返回 `nextActiveTabId`，继续复用 `ConversationViewStateService.activateTab()`
- 关闭最后一个 tab 时，保留原来的静默 fallback：直接创建 conversation、创建 tab、激活新 tab，不额外显示“创建成功” notice
- 即使 `TabManager.areTabsEnabled()` 为 false，close-last-tab 也仍保留内部 fallback tab，以维持 active conversation / pane runtime 的恢复能力；禁用标签只影响外部入口与 tab bar 显示
- `deleteConversationsAndRecover()` 会先去重并按原顺序删除 conversation，再关闭所有指向被删 conversation 的 tab
- 删除导致 tab 清空时，如果标签 UI 仍启用，继续走 `ConversationTabOpenCoordinator.createConversationInNewTab()`，保留原来的 fallback 创建 notice 与错误处理语义；如果 `TabManager.areTabsEnabled()` 为 false，则直接静默创建内部 fallback tab 并激活，避免 current conversation 存在但 per-tab runtime 缺失
- `deleteAllConversationsAndReset()` 会先删除全部 conversation，再清空所有 tab messages pane、重建空 `TabManager`。启用标签时继续走 noticed bootstrap；禁用标签时改为静默创建内部 fallback tab，让 streaming、scroll、context usage 等 tab-scoped runtime 仍有 owner

## 与 `OpenCodianView` 的边界

- `OpenCodianView` 只保留 tab close / delete / delete-all confirmation 与 success notice wrapper，以及 host/port 装配
- `ConversationTabLifecycleRecoveryCoordinator` 统一承接 close/delete/delete-all 后“该激活现有 tab、静默补建 fallback，还是重置 tabs 后走 noticed bootstrap”的 recovery 决策
- 这次切口推进 master plan 的 P1 `tab / pane / conversation activation 与 sync orchestration` lane：把 tab lifecycle recovery ownership 从主 view 迁到 dedicated coordinator

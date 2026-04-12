# ConversationTabLifecycleRecoveryCoordinator

> **源码**: `src/features/chat/services/ConversationTabLifecycleRecoveryCoordinator.ts`
> **状态**: [REVIEW]

## 概述

`ConversationTabLifecycleRecoveryCoordinator` 把 `OpenCodianView` 中 **tab close** 与 **conversation delete 后 tab recovery** 的 create-or-activate 决策收束到独立 coordinator。

它不负责消息 hydration，也不负责 current-tab new conversation 的消息区 shell；这些仍分别交给 `ConversationViewStateService`、`TabConversationActivationBridge` 和 `ConversationTabOpenCoordinator`。这个模块只承接：

- 关闭 tab 前的 foreground busy guard 与阻塞 notice
- tab close 成功后的 messages pane 清理
- close 后应激活现有 tab 还是静默创建 fallback tab
- conversation delete 后关联 tab 的关闭、pane 清理与 fallback create/activate 分支

## 公开接口

```typescript
export interface ConversationTabLifecycleRecoveryHost {
  getTabManager(): ConversationTabLifecycleRecoveryTabManager | null;
  isTabForegroundBusy(tabId: TabId): boolean;
  getCurrentConversationId(): string | null;
  createConversation(): Promise<Conversation>;
  deleteConversation(conversationId: string): Promise<void>;
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
}
```

## 关键行为

- `closeTabAndRecover()` 仍会在目标 tab foreground busy 时走 `chat.tab.streamingBlocked` notice，并保持 tab 不变
- 普通 close 成功后，会清理对应 messages pane；若 `TabManager` 返回 `nextActiveTabId`，继续复用 `ConversationViewStateService.activateTab()`
- 关闭最后一个 tab 时，保留原来的静默 fallback：直接创建 conversation、创建 tab、激活新 tab，不额外显示“创建成功” notice
- `deleteConversationsAndRecover()` 会先去重并按原顺序删除 conversation，再关闭所有指向被删 conversation 的 tab
- 删除导致 tab 清空时，继续走 `ConversationTabOpenCoordinator.createConversationInNewTab()`，保留原来的 fallback 创建 notice 与错误处理语义

## 与 `OpenCodianView` 的边界

- `OpenCodianView` 只保留 tab close / delete confirmation 的入口 wrapper，以及 host/port 装配
- `ConversationTabLifecycleRecoveryCoordinator` 统一承接 close/delete 后“该激活现有 tab 还是创建 fallback conversation”的 recovery 决策
- 这次切口推进 master plan 的 P1 `tab / pane / conversation activation 与 sync orchestration` lane：把 tab lifecycle recovery ownership 从主 view 迁到 dedicated coordinator

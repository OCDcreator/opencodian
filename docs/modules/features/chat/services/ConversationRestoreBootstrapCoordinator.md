# ConversationRestoreBootstrapCoordinator

> **源码**: `src/features/chat/services/ConversationRestoreBootstrapCoordinator.ts`
> **状态**: [REVIEW]

## 概述

`ConversationRestoreBootstrapCoordinator` 把 `OpenCodianView` 首次打开时那段 **load conversations → restore persisted tabs → fallback to first/create conversation → activate tab** 的恢复与回退决策，从 `ConversationViewStateService` 里拆成一个独立 coordinator。

它不负责 tab 激活分支本身，也不负责 loaded-conversation hydration；这些仍分别留给 `ConversationViewStateService`、`TabConversationActivationBridge`、`ConversationTransitionBridge` 和其它 hydration bridge。这个模块只承接 first-open / persisted-restore 场景里的 bootstrap 决策，以及 restore 失败后的持久化 state reset/flush。

## 公开接口

```typescript
export interface ConversationRestoreBootstrapHost {
  getTabManager(): ConversationRestoreBootstrapTabManager | null;
  getPersistedTabState(): PersistedTabState;
  resetPersistedTabState(): void;
  persistTabState(options?: { flush?: boolean }): void;
  loadConversations(): Promise<void>;
  getConversations(): Conversation[];
  createConversation(): Promise<Conversation>;
}

export interface ConversationRestoreBootstrapActivationPort {
  activateTab(tabId: TabId): Promise<void>;
}

export class ConversationRestoreBootstrapCoordinator {
  initializeFirstTab(): Promise<void>;
  restorePersistedTabs(): TabId | null;
}
```

## 关键行为

- `initializeFirstTab()` 先等待 `loadConversations()`，保持 preload-sensitive 的 conversation restore 顺序不变
- 有 persisted tabs 时，先调用 `restorePersistedTabs()`，再把激活动作委托给 `activationPort.activateTab()`
- 没有 persisted tabs 时，优先复用第一条已有 conversation；只有完全没有会话时才调用 `createConversation()`
- `restorePersistedTabs()` 在 restore 失败时仍会 reset persisted tab state，并立即 `persistTabState({ flush: true })`
- restore 时继续直接把 saved tab items 交给 `TabManager.restoreTabs()`，因此 per-tab `modelOverride` 等持久化字段的恢复语义不变

## 与 `OpenCodianView` / `ConversationViewStateService` 的边界

- `OpenCodianView` 只提供 host：tab manager、plugin tab state、conversation list 与 create/load conversation 落点
- `ConversationViewStateService` 现在只负责 tab 激活和 conversation hydration 装载，不再同时持有 first-open bootstrap / persisted restore 回退决策
- `ConversationRestoreBootstrapCoordinator` 自己不决定 streaming / empty-tab / loaded-conversation 的 activation 分支；它只在决定“要激活哪个 tab”之后，通过 activation port 复用 `ConversationViewStateService.activateTab()`
- 这条边界推进的是 master plan 的 P1 `tab / pane / conversation activation 与 sync orchestration` lane：把 tab bootstrap / persisted-restore ownership 从单个 view-state service 继续下沉到 dedicated coordinator

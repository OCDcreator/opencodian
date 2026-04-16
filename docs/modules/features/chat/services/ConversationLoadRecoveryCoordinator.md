# ConversationLoadRecoveryCoordinator

> **源码**: `src/features/chat/services/ConversationLoadRecoveryCoordinator.ts`
> **状态**: [REVIEW]

## 概述

`ConversationLoadRecoveryCoordinator` 把 `OpenCodianView` 里残留的 conversation load / recovery 入口收成单一 coordinator surface。

它现在直接拥有首开 bootstrap / persisted-restore 决策，同时继续组合已有 owner：

- `ConversationViewStateService`：tab 激活与 loaded-conversation hydration
- `ConversationTabOpenCoordinator`：new-tab / current-tab 创建入口
- `ConversationTabLifecycleRecoveryCoordinator`：delete/delete-all recovery

在这些现有 owner 之上，它再直接承接 rewind / restore-rewind / fork 分支，以及 create/load/delete/bootstrap 的统一入口编排。

## 公开接口

```typescript
export interface ConversationLoadRecoveryHost {
  isActiveTabStreaming(): boolean;
  getCurrentConversation(): Conversation | null;
  getTabManager(): ConversationLoadRecoveryTabManager | null;
  getMaxTabs(): number;
  getPersistedTabState(): PersistedTabState;
  resetPersistedTabState(): void;
  persistTabState(options?: { flush?: boolean }): void;
  loadConversations(): Promise<void>;
  getConversations(): Conversation[];
  createConversation(): Promise<Conversation>;
  chooseForkTarget(): Promise<ForkTarget | null>;
  confirmRewind(): boolean;
  revertSession(sessionId: string, messageId: string): Promise<boolean>;
  unrevertSession(sessionId: string): Promise<boolean>;
  forkSession(sessionId: string, messageId: string): Promise<{ id: string }>;
  createConversationFromSession(...): Promise<Conversation>;
  deleteConversation(conversationId: string): Promise<void>;
  syncActiveTabConversation(conversation: Conversation): void;
  updateModelSelectorDisplay(): void;
  showNotice(message: string): void;
}

export interface ConversationLoadRecoveryPort {
  activateTab(tabId: TabId): Promise<void>;
  createConversationInNewTab(): Promise<void>;
  createConversationInCurrentTab(): Promise<void>;
  loadConversation(id: string, options?: LoadConversationOptions): Promise<void>;
  deleteConversationsAndRecover(conversationIds: readonly string[]): Promise<void>;
  deleteAllConversationsAndReset(conversationIds: readonly string[]): Promise<void>;
}

export class ConversationLoadRecoveryCoordinator {
  // 省略若干方法
}
```

## 关键行为

### lifecycle 入口收束

- `createConversationInNewTab()` / `createConversationInCurrentTab()` / `loadConversation()` / `initializeFirstTab()` / `restorePersistedTabs()` / delete recovery 入口现在都先经过这个 coordinator
- 首开 bootstrap 会先 `loadConversations()`，再处理 persisted tab restore；restore 失败时仍会 reset tab state 并立即 `persistTabState({ flush: true })`
- 没有 persisted tabs 时，仍优先复用第一条已有 conversation；只有完全没有会话时才调用 `createConversation()`
- 这样 `OpenCodianView` 不再分别直连 create/load/bootstrap/delete 的多组 owner，只保留一条 conversation-lifecycle seam

### rewind / restore-rewind

- streaming 中仍保持阻塞，并继续复用原有 notice 文案
- 缺失 session 或 source message id 时仍直接走 unavailable / failed 分支
- rewind / unrevert 成功后，继续统一走 `loadConversation(..., { forceServerSync: true })`
- 既有 debug/error log 与 notice 语义保持不变

### fork

- fork target 选择、fork-session 创建、fork 前消息克隆，以及 fork conversation 持久化现在统一在 coordinator 内编排
- `new-tab` 分支仍保留 max-tabs guard、必要时删除新建 fork conversation、激活新 tab 后复制 active model override
- `current-tab` 分支仍先写回 active-tab conversation，再走 `loadConversation(..., { forceServerSync: false })`

## 与 `OpenCodianView` 的边界

- `OpenCodianView` 现在只提供当前 conversation、tab manager、notice、modal/confirm、OpenCode session API 与 tab-state writeback 这些 host seam
- `ConversationLoadRecoveryCoordinator` 负责把 create/load/bootstrap/delete-recovery/fork/rewind 入口拼成一条可读的 lifecycle surface，并直接承接 first-open / persisted-restore 决策
- `ConversationViewStateService`、`ConversationTabOpenCoordinator` 与 `ConversationTabLifecycleRecoveryCoordinator` 继续各自保有更细的 activation / open / delete 语义
- 因此后续若继续推进相邻 residual，只需要沿这个 coordinator surface 往下收，而不必重新回到 `OpenCodianView` 里寻找分散入口

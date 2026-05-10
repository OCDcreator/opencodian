# MessageFinalizationService

> **源码**: `src/features/chat/services/MessageFinalizationService.ts`
> **状态**: [REVIEW]

## 概述

`MessageFinalizationService` 负责接管 `sendMessage()` 在 stream loop 结束之后的 finalization orchestration：

- 判定是否需要最终 canonical convergence
- 优先复用 canonical session graph 做最终 sync，缺失时才回退服务端 sync
- 在 sync 后按需执行 tail patch 或 full rerender
- 继续推进 background-task indicator、turn diff、session todos 和最终保存

它也拥有 **server-start 助手错误终结流** 和 **server-start 错误分类**：

- `finalizeAssistantMessageWithError()` — 渲染流式错误、持久化错误消息到对话、更新同步 fingerprint
- `getFriendlyServerStartErrorMessage()` — 纯函数，将 server-start 异常分类为用户友好消息

它不消费流式 chunk，也不直接控制 streaming shell。真实的 chunk 消费、pending/timeout/interruption、本地 assistant/notice 组装与第一次本地保存现在保留在 `runtime/SendPipelineRuntime.ts`。

## 公开接口

```typescript
export interface MessageFinalizationHostDependencies {
  getCurrentConversation(): Conversation | null;
  getActiveTabId(): TabId | null;
  syncConversationMessagesFromCanonicalState(...): Promise<MessageFinalizationSyncResult | null>;
  syncConversationMessagesFromServer(...): Promise<MessageFinalizationSyncResult>;
  conversationIdentityRuntime: { getConversationSyncFingerprint(messages: ChatMessage[]): string };
  conversationRenderService: { applySyncedConversationUpdate(...): Promise<void> };
  backgroundTaskHost: { renderBackgroundTaskIndicatorIfNeeded(tabId?: TabId | null): Promise<void> };
  conversationNoticeCoordinator: { appendTurnDiffNoticeIfNeeded(...): Promise<void> };
  sessionTodoCoordinator: { refreshTabSessionTodos(...): Promise<SessionTodo[]> };
  saveConversation(conversation: Conversation): Promise<void>;
  conversationTabRuntimeCoordinator: {
    updateConversationSyncRuntime(tabId, update: { inFlight?: boolean; fingerprint?: string | null }): void;
    clearPendingEditedFiles(tabId: TabId | null): void;
  };
  setTabNeedsAttention(tabId: TabId | null, needsAttention: boolean): void;
  tabConversationStateBridge: { syncActiveTabConversation(conversation: Conversation): void };
  activeTabContextUsageCoordinator: { syncIdentity(): void; refreshFromServer(): Promise<void> };
  assistantShellViewHostAdapter: { renderStreamError(options: AssistantErrorRenderOptions): void };
  formatCurrentSessionModelId(): string | undefined;
  scrollToBottom(options: { enableAutoScroll: boolean }): void;
}

export function createMessageFinalizationHost(
  deps: MessageFinalizationHostDependencies,
): MessageFinalizationHost;

export function shouldSyncAfterStream(
  options: ShouldSyncAfterStreamOptions,
): boolean;

export function getFriendlyServerStartErrorMessage(error: unknown): string;

export function getUnavailableServerMessage(
  availability: 'checking' | 'starting' | 'offline',
): string;

export interface FinalizeMessageOptions {
  conversation: Conversation;
  tabId: TabId | null;
  shouldSyncFromServer: boolean;
  editedFiles: string[];
  logStage(stage: string, payload?: Record<string, unknown>): void;
}

export class MessageFinalizationService {
  finalizeAfterStream(options: FinalizeMessageOptions): Promise<void>;
  finalizeAssistantMessageWithError(
    messageEl: HTMLElement,
    contentEl: HTMLElement,
    errorMessage: string,
  ): Promise<void>;
  finalizeAssistantMessageWithServerError(
    messageEl: HTMLElement,
    contentEl: HTMLElement,
    error: unknown,
  ): Promise<void>;
  finalizeAssistantMessageWithServerUnavailableError(
    messageEl: HTMLElement,
    contentEl: HTMLElement,
    availability: 'checking' | 'starting' | 'offline',
  ): Promise<void>;
}
```

## 关键行为

### should-sync 判定

- 只有 `streamCompleted === true`
- 且没有 timeout
- 且没有 interruption
- 且没有真实错误消息

同时满足时，才进入最终 canonical convergence。

### post-sync 编排

- final sync 前先快照 `previousMessagesBeforeSync` 和 canonical conversation fingerprint
- finalization 会先尝试 `syncConversationMessagesFromCanonicalState()`，直接把 canonical `session/message/part` 图投影回 `Conversation.messages`
- 只有 canonical state 当前不可用时，才回退 `syncConversationMessagesFromServer()`
- runtime baseline fingerprint 继续以 canonical-derived message snapshot 为准，因此隐藏的 `parts` / synthetic metadata 漂移也会在 final sync 后持久化下来
- sync 完成后，如果当前仍是同一个 foreground conversation/tab，且 authoritative sync 返回的 `changed` 标志为真，就统一走 `ConversationRenderService.applySyncedConversationUpdate()`，让 render 层自己决定是 append、tail patch 还是 full rerender
- finalization 不再用 stale visual `Conversation.messages` fingerprint 自行判定漂移；本地 cache fingerprint 只保留为诊断日志，实际 render drift 以 canonical/server projection 的 sync result 为准
- 不再把本地 `Conversation.messages` assistant body repair 当作 truth；本地流式消息只作为 live/cache 输出，最终收敛由 canonical projection 决定
- 不重新实现 append / patch / full rerender 细节，而是复用已有 `ConversationRenderService` 边界

### 收尾时序

- 只有 should-sync 分支才执行最终 canonical/server sync、background indicator 刷新与 turn diff notice
- 不论是否 should-sync，都会继续刷新 session todos、写最终 save、清空 pending edited files
- 如果用户在 finalization 期间切走 tab，则不做 foreground patch/rerender 与 active-tab context usage 刷新，而是改为给原 tab 打 attention
- sync lock 会在 service 自己的 `finally` 中释放，避免 send finalization 途中遗漏解锁

## 与 `OpenCodianView` 的边界

- `SendPipelineRuntime` 仍保留 stream loop、本地 shell finalization、本地 assistant/notice message 构建；正常 completed assistant 的 cache writeback 可延后到本服务的 canonical convergence，client-only notice / interrupted / questionResolution 边界才需要第一次本地 `saveConversation()`
- `MessageFinalizationService` 只负责"stream 结束后是否做 canonical convergence、必要时如何回退服务端 sync、sync 后如何 patch/rerender、最后如何做 todo/save/attention 收尾"
- `ConversationRenderService` 继续负责消息区 full rerender、append-only sync 和 tail patch，本服务只决定何时调用它

## 助手错误终结流

### getFriendlyServerStartErrorMessage

纯函数，不依赖 host。将 server-start 异常分类为用户友好的 i18n 消息：

- 错误消息含 `"opencode not found"` → `chat.error.serverBinaryMissing`
- 错误消息含 `"already in use"` → `chat.error.serverPortInUse`
- 其他 → `chat.error.serverStartFailed` + 原始错误消息

### getUnavailableServerMessage

纯函数，不依赖 host。将 server 不可用状态分类为用户友好的 i18n 消息：

- `starting` → `chat.error.serverStarting`
- 其他（`offline`、`checking`）→ `chat.error.serverOffline`

### finalizeAssistantMessageWithError

底层错误终结方法，由上面两个 wrapper 调用。

当 server-start prompt card 失败时（settings/skip 后仍不可用，或 start 抛异常），`OpenCodianView` 通过 wrapper 方法完成助手错误终结：

1. 通过 host 的 `renderStreamError()` 渲染错误块（委托 `AssistantShellViewHostAdapter`）
2. 将错误消息作为 assistant message push 到 conversation 并 save
3. 通过 host 的 `updateConversationSyncRuntime()` 更新 sync fingerprint
4. 通过 host 的 `scrollToBottom()` 滚动到底部

`OpenCodianView` 不再拥有 `createMessageFinalizationHost`、`finalizeAssistantMessageWithError`、`getFriendlyServerStartErrorMessage` 或 `getUnavailableServerMessage`；全部委托到此服务。`OpenCodianView` 通过 `createMessageFinalizationHost(deps)` 传入原始 owner 子对象来构建 host，然后通过 `finalizeAssistantMessageWithServerError` 和 `finalizeAssistantMessageWithServerUnavailableError` 两个 wrapper 方法调用服务。

### Host 组装工厂

`createMessageFinalizationHost(deps)` 从 `MessageFinalizationHostDependencies` 的原始 owner 子对象组装完整的 `MessageFinalizationHost`。关键映射：

- `setConversationSyncInFlight(tabId, value)` → `deps.conversationTabRuntimeCoordinator.updateConversationSyncRuntime(tabId, { inFlight: value })`
- `setLastConversationSyncFingerprint(tabId, fingerprint)` → `deps.conversationTabRuntimeCoordinator.updateConversationSyncRuntime(tabId, { fingerprint })`
- `clearPendingEditedFiles(tabId)` → `deps.conversationTabRuntimeCoordinator.clearPendingEditedFiles(tabId)`
- `setActiveTabConversation(conversation)` → `deps.tabConversationStateBridge.syncActiveTabConversation(conversation)`
- `syncActiveTabContextUsageIdentity()` → `deps.activeTabContextUsageCoordinator.syncIdentity()`
- `refreshActiveTabContextUsageFromServer()` → `deps.activeTabContextUsageCoordinator.refreshFromServer()`
- `getConversationSyncFingerprint(messages)` → `deps.conversationIdentityRuntime.getConversationSyncFingerprint(messages)`
- `applySyncedConversationUpdate(prev, next)` → `deps.conversationRenderService.applySyncedConversationUpdate(prev, next)`
- `renderBackgroundTaskIndicatorIfNeeded(tabId)` → `deps.backgroundTaskHost.renderBackgroundTaskIndicatorIfNeeded(tabId)`
- `appendTurnDiffNoticeIfNeeded(...)` → `deps.conversationNoticeCoordinator.appendTurnDiffNoticeIfNeeded(...)`
- `refreshTabSessionTodos(...)` → `deps.sessionTodoCoordinator.refreshTabSessionTodos(...)`
- `renderStreamError(options)` → `deps.assistantShellViewHostAdapter.renderStreamError(options)`
- `summarizeChatMessageForDebug` → 直接使用从 `SendPipelineDebugSummaries` 导入的纯函数（不来自 deps）

`OpenCodianView` 不再拥有 `createMessageFinalizationHost` 私有方法；组装逻辑完全在此服务文件中。deps 接口使用原始 owner 子对象（`conversationIdentityRuntime`、`conversationRenderService`、`backgroundTaskHost`、`conversationNoticeCoordinator`、`sessionTodoCoordinator`、`conversationTabRuntimeCoordinator`、`tabConversationStateBridge`、`activeTabContextUsageCoordinator`、`assistantShellViewHostAdapter`），不再逐字段包装 lambda。

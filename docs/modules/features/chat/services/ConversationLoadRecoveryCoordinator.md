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
  getActiveBackend(): AgentBackendKind | undefined;
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
  backfillClaudeUserMessageIdentities?(conversation: Conversation): Promise<boolean>;
  hasMatchingPersistentNotice?(
    title: string,
    content: string,
    tone: ChatMessage['noticeTone'],
    conversation?: Conversation | null,
  ): boolean;
  appendPersistentNotice?(options: PersistentAssistantNoticeMessageOptions): Promise<void>;
}

export interface ConversationLoadRecoveryHostDependencies {
  isActiveTabStreaming(): boolean;
  getCurrentConversation(): Conversation | null;
  getTabManager(): ConversationLoadRecoveryTabManager | null;
  getMaxTabs(): number;
  getPersistedTabState(): PersistedTabState;
  setPersistedTabState(state: PersistedTabState): void;
  persistTabState(options?: { flush?: boolean }): void;
  loadConversations(): Promise<void>;
  getConversations(): Conversation[];
  getActiveBackend(): AgentBackendKind | undefined;
  createConversation(): Promise<Conversation>;
  app: App;  // factory absorbs chooseForkTarget(app)
  revertSession(sessionId: string, messageId: string): Promise<boolean>;
  unrevertSession(sessionId: string): Promise<boolean>;
  forkSession(sessionId: string, messageId: string): Promise<{ id: string }>;
  createConversationFromSession(...): Promise<Conversation>;
  deleteConversation(conversationId: string): Promise<void>;
  syncActiveTabConversation(conversation: Conversation): void;
  updateModelSelectorDisplay(): void;
  backfillClaudeUserMessageIdentities?(conversation: Conversation): Promise<boolean>;
  hasMatchingPersistentNotice?(
    title: string,
    content: string,
    tone: ChatMessage['noticeTone'],
    conversation?: Conversation | null,
  ): boolean;
  appendPersistentNotice?(options: PersistentAssistantNoticeMessageOptions): Promise<void>;
  // factory absorbs: showNotice → new Notice(), confirmRewind → window.confirm(t(...)),
  //                  chooseForkTarget → chooseForkTarget(app), resetPersistedTabState → getDefaultPersistedTabState()
}

export function createConversationLoadRecoveryHost(
  deps: ConversationLoadRecoveryHostDependencies,
): ConversationLoadRecoveryHost;

export interface ConversationLoadRecoveryAssemblyDependencies {
  viewStateHost: ConversationViewStateHost;
  tabConversationStateBridge: Pick<TabConversationStateBridge, 'syncActiveTabConversation'>;
  tabConversationActivationBridge: TabConversationActivationBridge;
  tabViewActivationBridge: TabViewActivationPort;
  conversationHydrationOutcomeBridge: ConversationHydrationOutcomePort;
  conversationTransitionBridge: ConversationTransitionPort;
  conversationLoadRuntimeBridge: ConversationLoadRuntimePort;
  tabOpenHost: ConversationTabOpenHost;
  lifecycleRecoveryHost: ConversationTabLifecycleRecoveryHost;
  loadRecoveryHostDeps: ConversationLoadRecoveryHostDependencies;
}

export interface ConversationLoadRecoveryAssemblyResult {
  conversationViewStateService: ConversationViewStateService;
  conversationTabOpenCoordinator: ConversationTabOpenCoordinator;
  conversationTabLifecycleRecoveryCoordinator: ConversationTabLifecycleRecoveryCoordinator;
  conversationLoadRecoveryCoordinator: ConversationLoadRecoveryCoordinator;
}

export function assembleConversationLoadRecovery(
  deps: ConversationLoadRecoveryAssemblyDependencies,
): ConversationLoadRecoveryAssemblyResult;

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
- `loadConversation()` 在底层 port 完成 hydration 后，如果当前会话属于 `claude-code` 并且 host 提供了 `backfillClaudeUserMessageIdentities()`，会做一次 best-effort user `sourceMessageId` backfill。这样旧会话、reload 后会话，或其他未在 send-finalization 前景路径中拿到 footer 刷新的 Claude 对话，也能在 load/reopen 时补齐 fork 所需身份。
- Codex provisional warning：当 `loadConversation()` / `activateTab()` 恢复到一个 `backend === 'codex'` 且 `backendSessionId` 仍为 `codex-local-*` provisional id 的会话时，若 host 提供 `hasMatchingPersistentNotice()` 与 `appendPersistentNotice()`，会追加一条持久化的 assistant notice，提示用户当前会话尚未建立真实后端线程；该 warning 在后续 stream 将 `backendSessionId` 升级为真实 thread id 后由 `LocalStreamMessagePersistence` 自动移除
- 首开 bootstrap 会先 `loadConversations()`，再处理 persisted tab restore；restore 只允许恢复当前 active backend 拥有的 conversation tab。persisted state 中如果只剩其他 backend 的 tab，会 reset tab state 并立即 `persistTabState({ flush: true })`
- 没有可恢复的 persisted tabs 时，仍优先复用当前 active backend 的第一条已有 conversation；只有该 backend 完全没有会话时才调用 `createConversation()`
- 如果首开时 `createConversation()` 因 backend 被禁用或 bootstrap 不可用而失败，coordinator 会记录 warning 并回退为创建一个 empty tab，而不是把整个 view open 流程打断
- 这样 `OpenCodianView` 不再分别直连 create/load/bootstrap/delete 的多组 owner，只保留一条 conversation-lifecycle seam
- 首开 bootstrap 现在还会输出 `[view-open] initializeFirstTab ...` 性能汇总，把 `loadConversations`、restore、create/activate 等关键步骤拆开记时，方便确认首屏慢在“会话列表恢复”还是“激活已选 tab”

### rewind / restore-rewind

- streaming 中仍保持阻塞，并继续复用原有 notice 文案
- 缺失 session 或 source message id 时仍直接走 unavailable / failed 分支
- **Backend-aware session identity**: 使用 `getConversationBackendSessionId()` 解析会话标识，不再直接读取 `conversation.openCodeSessionId`。
- **OpenCode-only revert gate**: `handleRewindRequest()` 与 `handleRestoreRewindRequest()` 在 `backend !== 'opencode'` 时直接走 unavailable / failed 分支。revert / unrevert 目前仍是 OpenCode-only 能力，Claude 等 backend 即使底层 SDK 存在类似语义，也暂不提供稳定支持。
- rewind / unrevert 成功后，继续统一走 `loadConversation(..., { forceServerSync: true })`
- rewind / restore-rewind 所有错误路径（streaming blocked、无会话、非 OpenCode backend、无 sourceMessageId、用户取消、revert 返回 false、revert 抛出异常）均有完整单元测试覆盖
- 既有 debug/error log 与 notice 语义保持不变

### fork

- fork target 选择、fork-session 创建、fork 前消息克隆，以及 fork conversation 持久化现在统一在 coordinator 内编排
- **Backend-aware session identity**: `handleForkRequest()` 使用 `getConversationBackendSessionId()` 解析会话标识，不再直接读取 `conversation.openCodeSessionId`。fork 的实际调用通过 `host.forkSession()` 路由到对应 backend；`OpenCodianView` 负责把 fork 请求路由到拥有 `AgentCapability.Branching` 的 backend adapter（当前 OpenCode 已支持，Claude 在 adapter 层已 wiring 但未作为稳定能力暴露）。
- **Backend identity preservation**: `createForkConversation()` 将源 conversation 的 `backend` 传入 `createConversationFromSession()`，确保 fork 后的 conversation 保留与源会话相同的 backend identity，而非使用 settings 中的 `activeBackend`。
- `new-tab` 分支仍保留 max-tabs guard、必要时删除新建 fork conversation、激活新 tab 后复制 active model override
- `current-tab` 分支仍先写回 active-tab conversation，再走 `loadConversation(..., { forceServerSync: false })`
- 当 `TabManager.areTabsEnabled()` 为 false，即使 fork target 选择了 `new-tab`，也会降级为 current-tab 打开 fork conversation；这样禁用标签只影响打开入口，不会阻断 fork 会话、历史记录或标题保存

## 与 `OpenCodianView` 的边界

- `OpenCodianView` 不再拥有 `createConversationLoadRecoveryHost` 私有方法；host 组装已通过 `createConversationLoadRecoveryHost(deps)` 工厂函数集中到此 coordinator 文件
- 工厂函数吸收了四项组装逻辑：`showNotice`（直接 `new Notice`）、`confirmRewind`（直接 `window.confirm(t(...))`）、`chooseForkTarget`（调用 `chooseForkTarget(app, { allowNewTab })`，其中 `allowNewTab` 来自当前 `TabManager.areTabsEnabled()`）、`resetPersistedTabState`（使用 `getDefaultPersistedTabState()` + setter）
- `OpenCodianView` 传入更低层级的扁平依赖对象（含 `app`、`setPersistedTabState` 等），不再传入 `chooseForkTarget` / `confirmRewind` / `showNotice` / `resetPersistedTabState` 回调
- `ConversationLoadRecoveryCoordinator` 负责把 create/load/bootstrap/delete-recovery/fork/rewind 入口拼成一条可读的 lifecycle surface，并直接承接 first-open / persisted-restore 决策
- `ConversationViewStateService`、`ConversationTabOpenCoordinator` 与 `ConversationTabLifecycleRecoveryCoordinator` 继续各自保有更细的 activation / open / delete 语义
- `assembleConversationLoadRecovery(deps)` 顶层工厂进一步把 `ConversationViewStateService`、`ConversationTabOpenCoordinator`、`ConversationTabLifecycleRecoveryCoordinator` 与 `ConversationLoadRecoveryCoordinator` 的组装收束到此文件；`OpenCodianView` 的 `createConversationRuntimeWiring` 不再直接 `new` 这四个服务，而是改为调用此工厂
- 该 assembly 现在直接在相邻 owner 内部创建默认的 `ClaudeUserMessageIdentityBackfillService()`，并把它挂到 host 的 `backfillClaudeUserMessageIdentities()` 上。这样 Claude load-time identity backfill 不再需要新的 `OpenCodianView` wiring，而是复用 module-level registry/persistence seam 完成 best-effort recover。
- `ConversationTabOpenCoordinator` 的 port 在装配时注入 `activateTab`、`openConversationInCurrentTab`、`syncActiveTabConversation` 与 `loadConversation`，使其能够独立完成 `openTaskToolSession()` 的全链路（new-tab activate 或无 tabManager 时的 sync+load），无需回调到 `OpenCodianView`
- `syncActiveTabConversation` 直接委托给 `TabConversationStateBridge.syncActiveTabConversation()`，仅同步 tab 状态而不触发完整的 conversation open/reset/hydration 行为；`openConversationInCurrentTab` 则委托给 `TabConversationActivationBridge.openConversation()` 以执行完整的激活流程
- 因此后续若继续推进相邻 residual，只需要沿这个 coordinator surface 往下收，而不必重新回到 `OpenCodianView` 里寻找分散入口

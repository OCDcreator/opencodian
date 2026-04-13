# QuestionTodoBackgroundTaskRefreshHostAdapter

> **源码**: `src/features/chat/services/QuestionTodoBackgroundTaskRefreshHostAdapter.ts`
> **状态**: [REVIEW]

## 概述

`QuestionTodoBackgroundTaskRefreshHostAdapter` 把 `OpenCodianView` 里剩余的 question / todo / background-task post-sync host factory 与 service bundle 装配集中到一个模块，专门负责：

- 从更窄的 `QuestionTodoBackgroundTaskRefreshViewHostAdapterHost` 加上 late-bound coordinator / service / bridge ports 组合出完整 `QuestionTodoBackgroundTaskRefreshViewHost`
- 从单一 `QuestionTodoBackgroundTaskRefreshViewHost` 派生 `QuestionTodoActivationRefreshBridge`、`QuestionTodoStatusRefreshCoordinator`、`PostSyncQuestionTodoRefreshPlanBuilder`、`PostSyncQuestionTodoRefreshFacade`、`BackgroundConversationPostSyncRefreshExecutor`、`VisibleConversationPostSyncStateCoordinator`、`VisibleConversationPostSyncCoordinator`、`BackgroundConversationSignalSyncStateCoordinator`、`BackgroundConversationAttentionCoordinator`、`BackgroundConversationPostSyncHandoffCoordinator` 十段链路需要的 host 回调，以及 dedicated background-task post-sync refresh port
- 让 activation-side supplemental refresh 与 post-sync question/todo refresh、background-task rebuild/completion follow-up、visible sync state-commit、background signal state 与 background attention 判定复用同一份 view bridge
- 在不改变既有 post-sync 语义的前提下，把这组三段 P2 wiring 从 `OpenCodianView` 构造函数与分散 host factory 中迁走

它不新增业务规则，也不接管已有 coordinator/facade 的职责；真正的 refresh 顺序、runtime gate、visible state-commit、background signal state、background handoff 与 background attention 语义仍分别留在 dedicated 模块里。

## 公开接口

```typescript
export interface QuestionTodoBackgroundTaskRefreshViewHostAdapterHost {
  getCurrentConversation(): Conversation | null;
  getTabRuntimeState(tabId: TabId | null): QuestionTodoStatusRefreshRuntime | null;
  syncBackgroundTaskStateFromConversation(...): void;
  setCurrentConversationRevertState(...): void;
  setTabConversationSyncFingerprint(...): void;
}

export function createQuestionTodoBackgroundTaskRefreshViewHostAdapter(...): QuestionTodoBackgroundTaskRefreshViewHost;

export interface QuestionTodoBackgroundTaskRefreshViewHost {
  getCurrentConversation(): Conversation | null;
  getTabRuntimeState(tabId: TabId | null): QuestionTodoStatusRefreshRuntime | null;
  hasIncompleteTodos(todos: readonly SessionTodo[]): boolean;
  refreshPendingQuestionsForTab(...): Promise<QuestionRequest[]>;
  refreshTabSessionStatus(...): Promise<SessionActivityStatus | null>;
  refreshTabSessionTodos(...): Promise<SessionTodo[]>;
  syncBackgroundTaskStateFromConversation(...): void;
  flushBackgroundTaskPostSyncWriteback(...): Promise<void>;
  setCurrentConversationRevertState(...): void;
  setTabConversationSyncFingerprint(...): void;
  markBackgroundTaskAuthoritativeSync(...): void;
  setTabNeedsAttention(...): void;
}

export function createQuestionTodoBackgroundTaskRefreshHosts(...): QuestionTodoBackgroundTaskRefreshHosts;
export function createQuestionTodoBackgroundTaskRefreshServices(...): QuestionTodoBackgroundTaskRefreshServices;
```

## 关键行为

### shared host assembly

- `createQuestionTodoBackgroundTaskRefreshViewHostAdapter()` 把 view-local state/read-write 落点与 question dock、session todo state/status refresh、background-task indicator/live-signal、tab runtime bridge 这些 late-bound ports 组合成完整 view host
- 这一层现在通常会先接收 `QuestionTodoBackgroundTaskViewHostFactory` 派生出的 `refreshViewHostAdapterHost`，把 `OpenCodianView` 里 activation/post-sync 共用的 conversation/background-task writeback seam 再进一步与 refresh-side late-bound ports 组合起来
- late-bound getter 让 adapter 可以在 `OpenCodianView` 构造期提前创建 post-sync service bundle，同时仍安全引用稍后才初始化的 background-task / tab runtime collaborators
- `createQuestionTodoBackgroundTaskRefreshHosts()` 从同一份 view host 派生 activation refresh host、五组 post-sync host 外加一条 dedicated post-sync refresh port，避免 `OpenCodianView` 继续维护多段闭包工厂和额外 background-task effect wiring
- `PostSyncQuestionTodoRefreshPlanBuilder` 所需的当前 conversation session 与 `VisibleConversationPostSyncStateCoordinator` 所需的当前 conversation id，都从同一份 `getCurrentConversation()` 推导
- visible/background sync 之后的 background-task rebuild 与 completion notice + stream-like writeback 现在会一起归入 dedicated post-sync refresh port；revert-state/fingerprint 写回交给 visible state coordinator host，attention 写回交给 background attention coordinator host，而 signal authoritative mark 写回交给 background signal sync state coordinator host

### shared service bundle

- `createQuestionTodoBackgroundTaskRefreshServices()` 顺序实例化 `QuestionTodoActivationRefreshBridge` → `QuestionTodoStatusRefreshCoordinator` → `PostSyncQuestionTodoRefreshPlanBuilder` → `PostSyncQuestionTodoRefreshFacade` → `BackgroundConversationPostSyncRefreshExecutor` → `VisibleConversationPostSyncStateCoordinator` → `VisibleConversationPostSyncCoordinator` → `BackgroundConversationAttentionCoordinator` → `BackgroundConversationSignalSyncStateCoordinator` → `BackgroundConversationPostSyncHandoffCoordinator`
- dedicated background-task post-sync refresh port 现在交给 `BackgroundConversationPostSyncRefreshExecutor`，让 visible facade 与 background execution seam 分离
- `PostSyncQuestionTodoRefreshPlanBuilder` 持有 visible/background session-id 与 signal/background-tab force-refresh policy 选择，避免 facade/coordinator 继续共享低层 policy 组装
- visible sync 的 current-conversation state commit 现在由 `VisibleConversationPostSyncStateCoordinator` 独立拥有，visible refresh + state-commit 调用顺序则由 `VisibleConversationPostSyncCoordinator` 统一拥有；signal sync 的 authoritative-sync state 由 `BackgroundConversationSignalSyncStateCoordinator` 独立拥有，signal/background-tab 的 source-specific handoff 由 `BackgroundConversationPostSyncHandoffCoordinator` 独立拥有，attention outcome 则由 `BackgroundConversationAttentionCoordinator` 独立拥有；返回值会把 `VisibleConversationPostSyncCoordinator` 与 `BackgroundConversationPostSyncHandoffCoordinator` 分开暴露，供 conversation sync 的 visible/background router 分别消费
- activation bridge 与 post-sync 对象仍保持原有职责边界，但它们的 host wiring 不再散落在 view 构造函数
- 返回值保留 activation bridge、post-sync refresh coordinator、facade、`VisibleConversationPostSyncCoordinator` 与 `BackgroundConversationPostSyncHandoffCoordinator`，方便 `OpenCodianView` 分别把 activation refresh handoff 交给 activation-side wiring，并把 visible/background post-sync seam 分别传给 conversation sync wiring

## 与 `OpenCodianView` 的边界

- `OpenCodianView` 现在只提供更窄的 `QuestionTodoBackgroundTaskRefreshViewHostAdapterHost` 与 collaborator getters，不再直接组装完整 `QuestionTodoBackgroundTaskRefreshViewHost`
- activation/post-sync 共用的 conversation/runtime writeback host 现在先由 `QuestionTodoBackgroundTaskViewHostFactory` 收束，再交给本模块继续扩成 refresh-side host
- `QuestionTodoActivationRefreshBridge`、`QuestionTodoStatusRefreshCoordinator`、`PostSyncQuestionTodoRefreshPlanBuilder`、`PostSyncQuestionTodoRefreshFacade`、`BackgroundConversationPostSyncRefreshExecutor`、`VisibleConversationPostSyncStateCoordinator`、`VisibleConversationPostSyncCoordinator`、`BackgroundConversationSignalSyncStateCoordinator`、`BackgroundConversationPostSyncHandoffCoordinator` 与 `BackgroundConversationAttentionCoordinator` 的业务边界保持分离
- 这次切片推进的是 master plan 的 P2 `question / todo / background task` lane：继续削弱 `OpenCodianView` 对 question/todo/background-task post-sync wiring、visible sync state-commit bridge，以及 signal/background-tab source routing 的直接 ownership

# QuestionTodoBackgroundTaskRefreshHostAdapter

> **源码**: `src/features/chat/services/QuestionTodoBackgroundTaskRefreshHostAdapter.ts`
> **状态**: [REVIEW]

## 概述

`QuestionTodoBackgroundTaskRefreshHostAdapter` 把 `OpenCodianView` 里剩余的 question / todo / background-task post-sync host factory 与 service bundle 装配集中到一个模块，专门负责：

- 从单一 `QuestionTodoBackgroundTaskRefreshViewHost` 派生 `QuestionTodoStatusRefreshCoordinator`、`PostSyncQuestionTodoRefreshFacade`、`BackgroundTaskPostSyncCoordinator` 三段链路需要的 host 回调
- 让 activation/post-sync 共享的 question/todo refresh、background-task rebuild/completion follow-up，以及 visible sync state-commit/attention 判定复用同一份 view bridge
- 在不改变既有 post-sync 语义的前提下，把这组三段 P2 wiring 从 `OpenCodianView` 构造函数与分散 host factory 中迁走

它不新增业务规则，也不接管已有 coordinator/facade 的职责；真正的 refresh 顺序、runtime gate、state-commit 与 attention 语义仍分别留在原有三个模块里。

## 公开接口

```typescript
export interface QuestionTodoBackgroundTaskRefreshViewHost {
  getCurrentConversation(): Conversation | null;
  getTabRuntimeState(tabId: TabId | null): QuestionTodoStatusRefreshRuntime | null;
  hasIncompleteTodos(todos: readonly SessionTodo[]): boolean;
  refreshPendingQuestionsForTab(...): Promise<QuestionRequest[]>;
  refreshTabSessionStatus(...): Promise<SessionActivityStatus | null>;
  refreshTabSessionTodos(...): Promise<SessionTodo[]>;
  syncBackgroundTaskStateFromConversation(...): void;
  refreshBackgroundTaskCompletionNotices(...): Promise<void>;
  syncTabStreamLikeState(tabId: TabId | null): void;
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

- `createQuestionTodoBackgroundTaskRefreshHosts()` 从同一份 view host 派生三组 host，避免 `OpenCodianView` 继续维护三段闭包工厂
- `PostSyncQuestionTodoRefreshFacade` 所需的当前 conversation session 与 `BackgroundTaskPostSyncCoordinator` 所需的当前 conversation id，都从同一份 `getCurrentConversation()` 推导
- visible/background sync 之后的 rebuild、completion notice、stream-like writeback 与 revert-state/fingerprint/attention 写回，都继续通过单一 adapter 回落到 view

### shared service bundle

- `createQuestionTodoBackgroundTaskRefreshServices()` 顺序实例化 `QuestionTodoStatusRefreshCoordinator` → `PostSyncQuestionTodoRefreshFacade` → `BackgroundTaskPostSyncCoordinator`
- 三个对象仍保持原有职责边界，但它们的 host wiring 不再散落在 view 构造函数
- 返回值保留三段协作对象，方便 `OpenCodianView` 继续把 `QuestionTodoStatusRefreshCoordinator` 传给 activation/open runtime bridge，同时把 `BackgroundTaskPostSyncCoordinator` 传给 sync bridge

## 与 `OpenCodianView` 的边界

- `OpenCodianView` 现在只提供一份 `QuestionTodoBackgroundTaskRefreshViewHost`，不再直接持有三段 host factory 与两次 service instantiation
- `QuestionTodoStatusRefreshCoordinator`、`PostSyncQuestionTodoRefreshFacade` 与 `BackgroundTaskPostSyncCoordinator` 的业务边界保持不变
- 这次切片推进的是 master plan 的 P2 `question / todo / background task` lane：继续削弱 `OpenCodianView` 对 question/todo/background-task post-sync wiring 的直接 ownership

# QuestionTodoBackgroundTaskRefreshHostAdapter

> **源码**: `src/features/chat/services/QuestionTodoBackgroundTaskRefreshHostAdapter.ts`
> **状态**: [REVIEW]

## 概述

`QuestionTodoBackgroundTaskRefreshHostAdapter` 把 question / todo refresh 与 visible post-sync host factory 集中到一个模块，专门负责：

- 从更窄的 `QuestionTodoBackgroundTaskRefreshViewHostAdapterHost` 加上 late-bound question dock / `SessionTodoCoordinator` ports 组合出完整 `QuestionTodoBackgroundTaskRefreshViewHost`
- 复用 `PostSyncQuestionTodoRefreshHostAdapter` 提供 visible/background question-todo refresh services，并把同一份 `QuestionTodoStatusRefreshCoordinator` 交给 activation-side wiring 复用
- 让 activation-side supplemental refresh 与 visible conversation post-sync refresh 继续复用同一份 current-conversation/runtime bridge，同时把 background handoff host 装配下沉到 `BackgroundConversationPostSyncHandoffHostAdapter`，把 visible state writeback host 装配下沉到 `VisibleConversationPostSyncStateHostAdapter`
- 在不改变既有 post-sync 语义的前提下，把这组三段 P2 wiring 从 `OpenCodianView` 构造函数与分散 host factory 中迁走

它不新增业务规则，也不接管已有 coordinator/facade 的职责；真正的 refresh 顺序、runtime gate、visible state-commit、background signal state、background handoff 与 background attention 语义仍分别留在 dedicated 模块里。

## 公开接口

```typescript
export interface QuestionTodoBackgroundTaskRefreshViewHostAdapterHost {
  getCurrentConversation(): Conversation | null;
  getTabRuntimeState(tabId: TabId | null): QuestionTodoStatusRefreshRuntime | null;
}

export function createQuestionTodoBackgroundTaskRefreshViewHostAdapter(...): QuestionTodoBackgroundTaskRefreshViewHost;
export function createQuestionTodoBackgroundTaskRefreshServices(...): QuestionTodoBackgroundTaskRefreshServices;
```

## 关键行为

### shared host assembly

- `createQuestionTodoBackgroundTaskRefreshViewHostAdapter()` 现在只把 view-local current conversation/runtime seam 与 question dock、`SessionTodoCoordinator` 暴露的 incomplete/status/todo refresh 端口组合成窄 refresh view host
- 这一层通常接收 `QuestionTodoBackgroundTaskRuntimeServiceBundle` 组装的 shared question/todo/background-task view host，但不再继续夹带 background-task completion / signal / attention writeback seam；这些 pass-through 已迁到 `BackgroundConversationPostSyncHandoffHostAdapter`
- late-bound getter 让 adapter 仍可在构造期提前创建 post-sync service bundle，同时把 refresh-side依赖限制在 question/todo 相关 collaborator

### shared service bundle

- `createQuestionTodoBackgroundTaskRefreshServices()` 先复用 `PostSyncQuestionTodoRefreshHostAdapter` 提供的 `QuestionTodoStatusRefreshCoordinator` / `PostSyncQuestionTodoRefreshPlanBuilder` / `PostSyncQuestionTodoRefreshFacade`，再实例化 `VisibleConversationPostSyncCoordinator`
- background handoff service bundle 现在通过 `BackgroundConversationPostSyncHandoffHostAdapter` 继续复用同一份 `QuestionTodoStatusRefreshCoordinator` 与 `PostSyncQuestionTodoRefreshPlanBuilder`，让 visible facade 与 background execution seam 分离
- `PostSyncQuestionTodoRefreshPlanBuilder` 持有 visible/background session-id 与 signal/background-tab force-refresh policy 选择，但它的 host 装配已经迁到 `PostSyncQuestionTodoRefreshHostAdapter`
- visible sync 的 current-conversation state commit 现在由 `VisibleConversationPostSyncStateHostAdapter` 注入的 `VisibleConversationPostSyncStateCoordinator` 独立拥有，visible refresh + state-commit 调用顺序则由 `VisibleConversationPostSyncCoordinator` 统一拥有；signal/background-tab 的 source-specific handoff host assembly 则交给 `BackgroundConversationPostSyncHandoffHostAdapter`
- activation/open 与 post-sync 对象仍保持原有职责边界，但它们共用的 supplemental refresh 现在直接回落到同一个 `QuestionTodoStatusRefreshCoordinator`
- 返回值保留 post-sync refresh coordinator、facade、`VisibleConversationPostSyncCoordinator` 与 `BackgroundConversationPostSyncHandoffCoordinator`，方便 `OpenCodianView` 分别把 activation refresh handoff 交给 activation-side wiring，并把 visible/background post-sync seam 分别传给 conversation sync wiring

## 与 `OpenCodianView` 的边界

- `OpenCodianView` 现在只提供 `QuestionTodoBackgroundTaskRuntimeServiceBundleHost` 的扁平 runtime seam，不再直接组装完整 `QuestionTodoBackgroundTaskRefreshViewHost`
- activation/post-sync 共用的 conversation/runtime writeback host 现在先由 `QuestionTodoBackgroundTaskRuntimeServiceBundle` 组装，再分别交给本模块与 `BackgroundConversationPostSyncHandoffHostAdapter` 继续扩成 refresh-side host
- `QuestionTodoStatusRefreshCoordinator`、`PostSyncQuestionTodoRefreshHostAdapter`、`VisibleConversationPostSyncStateHostAdapter`、`BackgroundConversationPostSyncHandoffHostAdapter` 与 `VisibleConversationPostSyncCoordinator` 的业务边界保持分离
- 这次切片推进的是 master plan 的 P2 `question / todo / background task` lane：继续削弱 `OpenCodianView` 对 question/todo/background-task post-sync wiring 与 signal/background-tab source routing 的直接 ownership

# QuestionTodoBackgroundTaskActivationHostAdapter

> **源码**: `src/features/chat/services/QuestionTodoBackgroundTaskActivationHostAdapter.ts`
> **状态**: [REVIEW]

## 概述

`QuestionTodoBackgroundTaskActivationHostAdapter` 把 question / todo / background-task activation host factory 与 activation bundle 装配集中到一个模块，专门负责：

- 从更窄的 `QuestionTodoBackgroundTaskActivationViewHostAdapterHost` 加上 late-bound 的 question dock port 与 `SessionTodoCoordinator.updateForTab()` 组合出完整 activation view host
- 从单一 activation view host 派生 `QuestionTodoActivationRefreshCoordinator` 需要的 host 回调，并直接提供 background-task activation indicator port
- 让 question/todo dock refresh 与 background-task indicator reset/sync/render 共用同一份 activation-side view bridge，而不是继续散落在 `OpenCodianView` 的两个独立 host factory 中

它不新增 activation 规则，也不改变刷新顺序；question/todo preflight / activation refresh 仍留在 `QuestionTodoActivationRefreshCoordinator`，而 indicator reset/render 的纯委托逻辑由本 adapter 内联提供。

## 公开接口

```typescript
export interface QuestionTodoBackgroundTaskActivationViewHostAdapterHost {
  getCurrentConversation(): Conversation | null;
  renderSessionTodoDock(tabId: TabId | null): void;
  resetBackgroundTaskIndicator(): void;
  syncBackgroundTaskStateFromConversation(...): void;
  renderBackgroundTaskIndicatorIfNeeded(tabId: TabId | null): Promise<void>;
}

export interface BackgroundTaskActivationIndicatorPort {
  prepareOpenConversation(conversation: Conversation): void;
  syncOpenConversationState(conversation: Conversation, tabId: TabId | null): void;
  renderOpenConversationIndicator(tabId: TabId | null): void;
  renderLoadedConversationIndicator(tabId: TabId | null): Promise<void>;
}

export function createQuestionTodoBackgroundTaskActivationViewHostAdapter(...): QuestionTodoBackgroundTaskActivationViewHost;
export function createQuestionTodoBackgroundTaskActivationHosts(...): QuestionTodoBackgroundTaskActivationHosts;
export function createQuestionTodoBackgroundTaskActivationServices(...): QuestionTodoBackgroundTaskActivationServices;
```

## 关键行为

- `createQuestionTodoBackgroundTaskActivationViewHostAdapter()` 把 view-local activation writeback 与 question dock / session todo dock 的 late-bound ports 收敛成单一 activation view host
- activation-side 现在通常消费 `QuestionTodoBackgroundTaskRuntimeServiceBundle` 在模块内组装的 shared question/todo/background-task view host，这样 current-conversation/background-task rebuild seam 仍能与 post-sync side 共用同一份 view-level host 装配，但不再让 `OpenCodianView` 内联 shared host + adapter 依赖 wiring
- `createQuestionTodoBackgroundTaskActivationHosts()` 从同一份 view host 派生 question/todo activation host 与 background-task indicator activation port，避免 `OpenCodianView` 继续维护两段闭包工厂
- `BackgroundTaskActivationIndicatorPort.prepareOpenConversation()` 保持 same-conversation reopen 语义：只有 current conversation id 不同时才 reset indicator
- `BackgroundTaskActivationIndicatorPort.syncOpenConversationState()` 直接委托 `syncBackgroundTaskStateFromConversation(conversation, tabId)`
- `BackgroundTaskActivationIndicatorPort.renderOpenConversationIndicator()` fire-and-forget 调用 `renderBackgroundTaskIndicatorIfNeeded(tabId)`，`renderLoadedConversationIndicator()` 则 await 同一 render 入口
- `createQuestionTodoBackgroundTaskActivationServices()` 顺序实例化 `QuestionTodoActivationRefreshCoordinator`，并把 adapter-owned background-task activation indicator port 放入共享 activation bundle；同时接收 `QuestionTodoStatusRefreshCoordinator.refreshAfterActivation()` 作为 activation refresh port

## 与 `OpenCodianView` 的边界

- `OpenCodianView` 现在只提供 `QuestionTodoBackgroundTaskRuntimeServiceBundleHost` 的扁平 runtime seam；shared activation view host 先由 `QuestionTodoBackgroundTaskRuntimeServiceBundle` 组装，再交给本模块补齐 activation 专属 dock ports
- activation 与 post-sync 共享的 state writeback seam 不再由 `OpenCodianView` 直接拼接
- `QuestionTodoActivationRefreshCoordinator` 继续负责 question/todo refresh；background-task activation indicator 的 reset / sync / render delegation 已内联在本 adapter，避免继续保留纯 pass-through service
- 这次切片推进的是 master plan 的 P2 `question / todo / background task` lane：继续削弱 `OpenCodianView` 对 activation-side wiring 的直接 ownership

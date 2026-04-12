# QuestionTodoBackgroundTaskActivationHostAdapter

> **源码**: `src/features/chat/services/QuestionTodoBackgroundTaskActivationHostAdapter.ts`
> **状态**: [REVIEW]

## 概述

`QuestionTodoBackgroundTaskActivationHostAdapter` 把 `OpenCodianView` 里 question / todo / background-task activation host factory 与 coordinator bundle 装配集中到一个模块，专门负责：

- 从更窄的 `QuestionTodoBackgroundTaskActivationViewHostAdapterHost` 加上 late-bound 的 dock coordinator ports 组合出完整 activation view host
- 从单一 activation view host 派生 `QuestionTodoActivationRefreshCoordinator` 与 `BackgroundTaskActivationIndicatorCoordinator` 需要的两组 host 回调
- 让 question/todo dock refresh 与 background-task indicator reset/sync/render 共用同一份 activation-side view bridge，而不是继续散落在 `OpenCodianView` 的两个独立 host factory 中

它不新增 activation 规则，也不改变两个 coordinator 的刷新顺序；真正的 preflight / activation refresh 与 indicator reset/render 语义仍留在原有 coordinator 内。

## 公开接口

```typescript
export interface QuestionTodoBackgroundTaskActivationViewHostAdapterHost {
  getCurrentConversation(): Conversation | null;
  renderSessionTodoDock(tabId: TabId | null): void;
  resetBackgroundTaskIndicator(): void;
  syncBackgroundTaskStateFromConversation(...): void;
  renderBackgroundTaskIndicatorIfNeeded(tabId: TabId | null): Promise<void>;
}

export function createQuestionTodoBackgroundTaskActivationViewHostAdapter(...): QuestionTodoBackgroundTaskActivationViewHost;
export function createQuestionTodoBackgroundTaskActivationHosts(...): QuestionTodoBackgroundTaskActivationHosts;
export function createQuestionTodoBackgroundTaskActivationServices(...): QuestionTodoBackgroundTaskActivationServices;
```

## 关键行为

- `createQuestionTodoBackgroundTaskActivationViewHostAdapter()` 把 view-local activation writeback 与 question dock / session todo dock 的 late-bound ports 收敛成单一 activation view host
- activation-side 的基础 host 现在通常先由 `QuestionTodoBackgroundTaskViewHostFactory` 派生，这样 current-conversation/background-task rebuild seam 能与 post-sync side 共用同一份 view-level host 装配
- `createQuestionTodoBackgroundTaskActivationHosts()` 从同一份 view host 派生 question/todo activation host 与 background-task indicator activation host，避免 `OpenCodianView` 继续维护两段闭包工厂
- `createQuestionTodoBackgroundTaskActivationServices()` 顺序实例化 `QuestionTodoActivationRefreshCoordinator` 与 `BackgroundTaskActivationIndicatorCoordinator`，同时保留 `QuestionTodoStatusRefreshCoordinator` 作为独立 activation refresh port

## 与 `OpenCodianView` 的边界

- `OpenCodianView` 现在只提供更窄的 activation view host 与 dock collaborator getters，不再直接组装这两个 activation coordinator 的 host
- activation 与 post-sync 共享的 state writeback seam 现在先由 `QuestionTodoBackgroundTaskViewHostFactory` 收束，再交给本模块补齐 activation 专属 dock ports
- `QuestionTodoActivationRefreshCoordinator` 与 `BackgroundTaskActivationIndicatorCoordinator` 的业务边界保持不变
- 这次切片推进的是 master plan 的 P2 `question / todo / background task` lane：继续削弱 `OpenCodianView` 对 activation-side wiring 的直接 ownership

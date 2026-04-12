# QuestionDockQueueRuntimeFacade

> **源码**: `src/features/chat/services/QuestionDockQueueRuntimeFacade.ts`
> **状态**: [REVIEW]

## 概述

`QuestionDockQueueRuntimeFacade` 把上方 question dock 等待队列相关的 **waiter 生命周期、pending request 入队/出队，以及草稿/active-group runtime 初始化** 从 `QuestionDockCoordinator` 中收束成一个更窄的 runtime facade，专门负责：

- 为每个 request 创建并复用 dock waiter，避免 coordinator 继续直接读写 `questionRequestWaiters`
- 在 dock 接管 request 时维护 `pendingQuestionRequests`、draft answers，以及首次入队时的 active group/index 初始值
- 在 request 被回答或拒绝后清理 queue、draft/group/index，并统一 resolve 对应 waiter

它不负责 pending question 的服务端拉取、按 session 过滤、dock attention/render 决策，或 resolve 后的 status/sync follow-up；这些仍分别留给 `QuestionDockCoordinator`、`QuestionPendingRefreshRuntimeFacade` 与 `QuestionPostResolutionRuntimeFacade`。

## 公开接口

```typescript
export interface QuestionDockQueueRuntimeFacadeHost {
  getTabRuntimeState(tabId: TabId | null): QuestionDockQueueRuntimeState | null;
  ensureTabRuntimeState(tabId: TabId | null): QuestionDockQueueRuntimeState | null;
}

export class QuestionDockQueueRuntimeFacade {
  getOrCreateQuestionWaiter(
    requestId: string,
    tabId: TabId | null,
  ): QuestionDockQueueDeferredRequest | null;
  enqueuePendingQuestionRequest(
    request: QuestionRequest,
    tabId: TabId | null,
    displayMode: QuestionDisplayMode,
  ): void;
  removePendingQuestionRequest(
    requestId: string,
    tabId: TabId | null,
  ): QuestionRequest[];
}
```

## 关键行为

- `getOrCreateQuestionWaiter()` 只在当前 tab runtime 中按 request id 建立一次 waiter；重复 request 会复用同一个 promise
- `enqueuePendingQuestionRequest()` 只在 queue 中追加缺失 request，并同步标准化 draft answers；首次入队时才计算默认 active group/index
- `removePendingQuestionRequest()` 会同时删除 queue、draft/group/index runtime state，并 resolve + 清理 waiter，供 dock submit/reject 与其它收尾路径复用

## 与 `OpenCodianView` 的边界

- `QuestionRuntimeHostAdapter` 负责从共享 `QuestionRuntimeViewHost` 派生本 facade 所需的 runtime host；`OpenCodianView` 不再需要单独暴露 dock queue helper
- `QuestionDockCoordinator` 继续负责 dock render callbacks、pending refresh fetch/session filter 与 attention/render 决策，但 waiter/enqueue/remove 的 runtime map 读写现在委托给本 facade
- `QuestionPendingRefreshRuntimeFacade` 仍负责 resolved-request suppression 与 refresh 期间的 stale state pruning，只把 waiter map 当作“哪些 request 仍在等待”的 runtime 信号

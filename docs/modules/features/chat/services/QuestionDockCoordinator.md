# QuestionDockCoordinator

> **源码**: `src/features/chat/services/QuestionDockCoordinator.ts`
> **状态**: [REVIEW]

## 概述

`QuestionDockCoordinator` 是上方 question dock 的 lifecycle owner。它把 pending request hydration、dock waiter 队列、draft answer / active group / active index runtime state，以及 active/background writeback 收束到同一个 service，专门负责：

- 维护 pending question request、resolved-request suppression、waiter、draft answer、active group 与 active index 这些 dock lifecycle runtime map
- 统一处理 `clearPendingQuestionsForTab()` 与 `refreshPendingQuestionsForTab()` 的 API fetch、session filter、waiter-owned request 保活、stale runtime state pruning 与 tab attention/render writeback
- 继续通过 `QuestionDockRenderStateFacade` 与 `QuestionDockRenderAdapter` 组装 dock render payload，保留 `QuestionDock.ts` 的 DOM markup ownership
- 在 submit/reject 或 inline fallback resolution 成功后，把可选 pending-request cleanup 上下文交给共享 `QuestionResolutionExecutionFacade`

它不负责 inline question card 的 DOM 渲染、answered/rejected 回顾卡片、dock render-state gating、dock submit/reject action assembly、真实 OpenCode reply/reject API error notice、dock callback payload composition 或 `QuestionDock` DOM markup；这些仍分别由 `QuestionInlineCardRenderer`、`QuestionResolutionCoordinator`、`QuestionDockRenderStateFacade`、`QuestionDockResolutionActionFacade`、`QuestionResolutionExecutionFacade`、`QuestionDockRenderAdapter` 与 `QuestionDock` 负责。它的 host 装配由 `QuestionRuntimeHostAdapter` 统一提供。

## 公开接口

```typescript
export interface QuestionDockRuntimeState {
  pendingQuestionRequests: QuestionRequest[];
  resolvedQuestionRequestIds: Set<string>;
  questionDraftAnswers: Map<string, string[][]>;
  questionActiveGroupKeys: Map<string, string>;
  questionActiveIndexes: Map<string, number>;
  questionRequestWaiters: Map<string, QuestionDockQueueDeferredRequest>;
}

export class QuestionDockCoordinator {
  render(): void;
  clearPendingQuestionsForTab(tabId?: TabId | null): void;
  refreshPendingQuestionsForTab(tabId: TabId | null, sessionId?: string | null): Promise<QuestionRequest[]>;
  waitForDockResolutionIfEnabled(request: QuestionRequest, tabId?: TabId | null): Promise<boolean>;
  applyResolutionAction(action: QuestionResolutionExecutionAction, tabId: TabId | null, options?: QuestionDockResolutionApplyOptions): Promise<boolean>;
}
```

## 关键行为

- `refreshPendingQuestionsForTab()` 现在通过同一条 pending runtime seam 完成服务端 pending question 拉取、session 过滤、resolved-id suppression、waiter-owned request 保活、draft answer / active selection 同步，以及 stale dock state pruning，再统一分流到 active/background tab writeback
- `clearPendingQuestionsForTab()` 在丢弃 pending request / draft answer / active selection runtime state 前，会先 resolve 当前 tab 的所有 dock waiters，确保正在 `waitForDockResolutionIfEnabled()` 中等待上方 dock 的调用方不会因为清理路径永久挂起；该清理路径只释放本地等待，不会主动调用 OpenCode `reply` / `reject` API。
- `waitForDockResolutionIfEnabled()` 负责创建 waiter、入队 pending request，并复用同一个 pending presentation sync + writeback 路径初始化 draft answer 与 active selection runtime
- `applyResolutionAction()` 是 dock 与 inline fallback 共用的 resolve 入口；它只补充可选 pending-request removal 上下文，真正的 resolved-id 标记、resolved state apply 与 status/sync follow-up 已下沉到共享 execution facade
- `render()` 仍只消费 `QuestionDockRenderStateFacade` 的 `active` / `empty` / `skip` 结果，并把 callback payload 委托给 `QuestionDockRenderAdapter`

## 与 `OpenCodianView` 的边界

- `OpenCodianView` 只通过 question runtime bundle 调用 `QuestionDockCoordinator`，不再直接管理 question runtime map 的主要读写
- `QuestionResolutionFlowCoordinator` 在 inline fallback 拿到 execution action 后直接复用同一份 execution facade，本模块只保留 dock queue/runtime 相关的补充上下文
- `QuestionDockSlotCoordinator` 继续只拥有 slot attach/render/destroy；本模块不接管 dock DOM markup

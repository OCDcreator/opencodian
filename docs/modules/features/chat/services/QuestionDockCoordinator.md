# QuestionDockCoordinator

> **源码**: `src/features/chat/services/QuestionDockCoordinator.ts`
> **状态**: [REVIEW]

## 概述

`QuestionDockCoordinator` 是上方 question dock 的 lifecycle owner。它把 pending request hydration、dock waiter 队列、draft answer / active group / active index runtime state、active/background writeback，以及 dock/inline 共用的 execute-then-writeback 后处理收束到同一个 service，专门负责：

- 维护 pending question request、resolved-request suppression、waiter、draft answer、active group 与 active index 这些 dock lifecycle runtime map
- 统一处理 `clearPendingQuestionsForTab()` 与 `refreshPendingQuestionsForTab()` 的 API fetch、session filter、waiter-owned request 保活、stale runtime state pruning 与 tab attention/render writeback
- 继续通过 `QuestionDockRenderStateFacade` 与 `QuestionDockRenderAdapter` 组装 dock render payload，保留 `QuestionDock.ts` 的 DOM markup ownership
- 在 submit/reject 或 inline fallback resolution 成功后，统一调用 `QuestionResolutionExecutionFacade`、写回 `QuestionResolutionCoordinator`，再复用 `QuestionPostResolutionRuntimeFacade` 做 status/sync follow-up

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

- `refreshPendingQuestionsForTab()` 现在直接在 coordinator 内完成服务端 pending question 拉取、session 过滤、resolved-id suppression、waiter-owned request 保活、draft/group/index pruning，并根据 active/background tab 分流为重绘 dock 或标记 attention
- `waitForDockResolutionIfEnabled()` 负责创建 waiter、入队 pending request、初始化 draft answer 与 active selection runtime，再触发同一条 writeback path
- `applyResolutionAction()` 是 dock 与 inline fallback 共用的 resolve 后处理入口；执行成功后先标记 resolved id，再写入 answered/rejected runtime state，然后运行可选的 pending-request removal，最后触发 status/sync follow-up
- `render()` 仍只消费 `QuestionDockRenderStateFacade` 的 `active` / `empty` / `skip` 结果，并把 callback payload 委托给 `QuestionDockRenderAdapter`

## 与 `OpenCodianView` 的边界

- `OpenCodianView` 只通过 question runtime bundle 调用 `QuestionDockCoordinator`，不再直接管理 question runtime map 的主要读写
- `QuestionResolutionFlowCoordinator` 在 inline fallback 拿到 execution action 后也回到 `QuestionDockCoordinator.applyResolutionAction()`，让 dock 与 inline resolution 共用同一条 resolved-id suppression / resolved-card writeback / post-resolution follow-up
- `QuestionDockSlotCoordinator` 继续只拥有 slot attach/render/destroy；本模块不接管 dock DOM markup

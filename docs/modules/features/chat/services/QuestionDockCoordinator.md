# QuestionDockCoordinator

> **源码**: `src/features/chat/services/QuestionDockCoordinator.ts`
> **状态**: [REVIEW]

## 概述

`QuestionDockCoordinator` 把 `OpenCodianView` 中与上方 question dock 相关的 **dock 渲染入口，以及 dock resolve 执行顺序** 收束到一个 dedicated service，专门负责：

- 把 dock waiter、enqueue/remove queue runtime state 维护委托给 `QuestionDockQueueRuntimeFacade`，把 pending-question fetch/session-filter/runtime-writeback 协调委托给 `QuestionDockRefreshFacade`，并把 queue enqueue/remove 后的 attention/render writeback 委托给 `QuestionDockWritebackFacade`
- 把上方 dock 的 enabled/active-tab/active-request/session-match render-state 选择委托给 `QuestionDockRenderStateFacade`，再把 `QuestionDock` 的 render state / callbacks 组装委托给 `QuestionDockRenderAdapter`
- 把上方 dock submit/reject action assembly、draft answer sanitize、required-answer gating 与 answered/rejected `QuestionResolution` shape 组装委托给 `QuestionDockResolutionActionFacade`
- 在上方 dock 提交或拒绝问题后，把 facade 产出的 `reply` / `reject` action 转交给共享的 `QuestionResolutionApplyFacade`，由它统一串联 `QuestionResolutionExecutionFacade` 与 `QuestionResolutionWritebackFacade`

它不负责 inline question card 的 DOM 渲染、answered/rejected 回顾卡片、dock queue runtime map 维护、pending-question refresh orchestration、pending refresh runtime map 维护、dock attention/render writeback、dock render-state 选择、dock submit/reject action assembly、真实 question API/error notice、共享 execute-then-writeback 骨架、dock interaction map 写回、dock render payload composition，或 resolve 后的 status/sync follow-up；这些仍分别由 `QuestionInlineCardRenderer`、`QuestionResolutionCoordinator`、`QuestionDockQueueRuntimeFacade`、`QuestionDockRefreshFacade`、`QuestionPendingRefreshRuntimeFacade`、`QuestionDockWritebackFacade`、`QuestionDockRenderStateFacade`、`QuestionDockResolutionActionFacade`、`QuestionResolutionExecutionFacade`、`QuestionResolutionApplyFacade`、`QuestionDockInteractionState`、`QuestionDockRenderAdapter`、`QuestionResolutionWritebackFacade` 与 `QuestionPostResolutionRuntimeFacade` 负责。它的 host 装配现在通常由 `QuestionRuntimeHostAdapter` 统一提供。

## 公开接口

```typescript
export interface QuestionDockCoordinatorHost {
  getActiveTabId(): TabId | null;
  getQuestionDock(): Pick<QuestionDock, 'render'> | null;
  getQuestionDisplayMode(): QuestionDisplayMode;
  shouldUseAboveInputQuestionDock(): boolean;
}

export class QuestionDockCoordinator {
  render(): void;
  clearPendingQuestionsForTab(tabId?: TabId | null): void;
  refreshPendingQuestionsForTab(tabId: TabId | null, sessionId?: string | null): Promise<QuestionRequest[]>;
  waitForDockResolutionIfEnabled(request: QuestionRequest, tabId?: TabId | null): Promise<boolean>;
}
```

## 关键行为

### pending-question refresh

- `clearPendingQuestionsForTab()` 与 `refreshPendingQuestionsForTab()` 仍作为 dock/public host 的稳定入口保留在 coordinator 上，但具体实现现在直接委托给 `QuestionDockRefreshFacade`
- `QuestionDockRefreshFacade` 统一负责服务端 pending question 拉取、session 过滤、resolved-id suppression、waiter-owned request 保活，以及 refresh/clear 完成后的 active/background writeback
- coordinator 不再直接铺开 refresh 分支里的 API/filter/runtime/writeback 逻辑，因此更接近纯 dock callbacks + resolution assembly

### 上方 dock render / resolution

- `render()` 先经由 `QuestionDockRenderStateFacade` 解析 `questionCardPosition === 'above_input'`、active tab、active request 与当前 conversation session 是否一致；不满足时使用同一 display mode 回退到空 dock
- dock callback 组合与空 dock payload 继续由 `QuestionDockRenderAdapter` 统一产出；active group 与 active question index 写回继续由 `QuestionDockInteractionState` 承接，submit/reject 时的 draft answer 规范化/sanitize 与 required-answer gating 则由 `QuestionDockResolutionActionFacade` 承接
- waiter 创建、request 入队/出队与对应 runtime map 清理由 `QuestionDockQueueRuntimeFacade` 承接，对应 active/background attention/render 写回由 `QuestionDockWritebackFacade` 承接，真实 DOM 渲染仍由 `QuestionDock` 完成
- submit/reject callback 先经由 `QuestionDockResolutionActionFacade` 产出 `skip` / `answer-required` / `reply` / `reject` action；只有 `reply` / `reject` 会继续交给共享的 `QuestionResolutionApplyFacade`
- `QuestionResolutionApplyFacade` 会先调用 `QuestionResolutionExecutionFacade`，仅在执行成功后再调用 `QuestionResolutionWritebackFacade`
- dock 传入的 `afterStateApplied` callback 仍会在 resolved state 写回后、follow-up 前移除 pending request，并把 removal 后的 attention/render writeback 继续交给共享的 `QuestionDockWritebackFacade`

## 与 `OpenCodianView` 的边界

- `OpenCodianView` 不再直接持有 `QuestionDock` slot lifecycle；这部分 UI ownership 现在由 `QuestionDockSlotCoordinator` 负责，而 question dock/pending question 的主要 orchestration 继续留在本 coordinator
- `VisibleConversationPostSyncCoordinator`、`BackgroundConversationPostSyncRefreshExecutor` 与 `TabConversationStateBridge` 仍需要 pending-question refresh / clear，但现在会经由同一份 question runtime bundle 调用本 service，再转交 `QuestionDockRefreshFacade`，而不是继续走 view 内单独 forwarding 方法
- `QuestionInlineCardRenderer` 继续负责 inline 提问 UI；dock 未接管时的 inline resolve orchestration 由 `QuestionResolutionFlowCoordinator` 处理，并与 dock 一样经由 `QuestionResolutionWritebackFacade` 标记 resolved-request suppression 与 resolved state
- dock queue 的 waiter / enqueue / remove runtime map 维护现在由 `QuestionDockQueueRuntimeFacade` 承接，dock render-state 选择由 `QuestionDockRenderStateFacade` 承接，dock submit/reject action assembly 由 `QuestionDockResolutionActionFacade` 承接，共享 execute-then-writeback 骨架由 `QuestionResolutionApplyFacade` 承接，真实 question API/error notice 则由 `QuestionResolutionExecutionFacade` 承接，dock interaction map 写回由 `QuestionDockInteractionState` 承接，dock render payload 组合由 `QuestionDockRenderAdapter` 承接，pending-question refresh 的 fetch/session-filter/runtime-writeback 协调由 `QuestionDockRefreshFacade` 承接，resolved-state / stale-state 维护继续由 `QuestionPendingRefreshRuntimeFacade` 承接，queue enqueue/remove 后的 attention/render writeback 统一由 `QuestionDockWritebackFacade` 承接，本模块只保留 dock callbacks 与 resolution apply 触发顺序
- dock resolve 后的 resolved-state 写回现在与 inline fallback 共用 `QuestionResolutionWritebackFacade`，最终 runtime 收尾仍由 `QuestionPostResolutionRuntimeFacade` 处理，本模块不再单独持有 suppression/status/sync follow-up 细节

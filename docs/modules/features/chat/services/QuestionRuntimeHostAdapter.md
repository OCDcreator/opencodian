# QuestionRuntimeHostAdapter

> **源码**: `src/features/chat/services/QuestionRuntimeHostAdapter.ts`
> **状态**: [REVIEW]

## 概述

`QuestionRuntimeHostAdapter` 把 `OpenCodianView` 里原本分散的 question runtime host factory 与 service instantiation 收束到一个模块，专门负责：

- 从单一 `QuestionRuntimeViewHost` 派生 `QuestionInlineCardRenderer`、`QuestionResolutionCoordinator`、`QuestionDockCoordinator` 与 `QuestionPostResolutionRuntimeFacade` 所需的 host 回调
- 从同一份 host 继续派生 `QuestionInlineResolutionActionFacade`、`QuestionDockRenderStateFacade`、`QuestionDockResolutionActionFacade`、`QuestionResolutionExecutionFacade`、`QuestionDockRefreshFacade`、`QuestionDockQueueRuntimeFacade` 与 `QuestionPendingRefreshRuntimeFacade` 所需的 action-source / render-state / dock-action / execution / refresh / dock-queue / pending-refresh port，并把 dock attention/render writeback 接到 `QuestionDockWritebackFacade`
- 顺序装配 inline question card、inline resolution-action facade、resolved-question runtime、dock render-state facade、dock resolution-action facade、question resolution execution facade、dock-queue runtime facade、pending-refresh runtime facade、post-resolution runtime facade、dock writeback facade、dock refresh facade、resolution writeback facade、question resolution apply facade、上方 question dock，以及 `QuestionResolutionFlowCoordinator` 十五个协作模块，避免 view 继续维护多段 `create*Host()` 和散落的 resolve flow instantiation
- 让 `QuestionDockCoordinator` 的 resolved-state callback 直接回连到共享的 `QuestionResolutionCoordinator`，保持 dock resolve 与 inline fallback 共用同一份 question-resolution state bridge
- 让 dock 与 inline resolve 的真实 question API/error notice 统一经由 `QuestionResolutionExecutionFacade`，resolved-id suppression、resolved-state bridge 与 status/sync follow-up 统一经由 `QuestionResolutionWritebackFacade` 串联，再用共享的 `QuestionResolutionApplyFacade` 收束 execute-then-writeback 骨架，而不是继续把这两段运行时骨架散落在多个 coordinator 里

当前这份 `QuestionRuntimeViewHost` 通常先由 `QuestionRuntimeViewHostFactory` + `QuestionRuntimeViewHostAdapter` 两层准备：factory 先从 view 收口 late-bound 的 question 相邻端口，adapter 再把 dock/settings/API/status bridge 组合成稳定 host；其中 tab attention 与 question resolve 后的 sync follow-up 也优先复用已有 `TabRuntimeStateBridge` / `ConversationSyncBridge` 稳定 port。

它不负责 question request 的服务端数据获取、resolved card DOM 内容拼装，或 question dock 的真正 DOM 渲染；这些仍分别留给 `OpenCodeService`、`QuestionResolutionCardRenderer` 与 `QuestionDock`。

## 公开接口

```typescript
export interface QuestionRuntimeState
  extends QuestionDockCoordinatorRuntimeState,
    QuestionDockQueueRuntimeState,
    QuestionPendingRefreshRuntimeState,
    QuestionInlineCardRuntimeState,
    QuestionResolutionCoordinatorRuntimeState {}

export interface QuestionRuntimeViewHost {
  getActiveTabId(): TabId | null;
  getTabRuntimeState(tabId: TabId | null): QuestionRuntimeState | null;
  ensureTabRuntimeState(tabId: TabId | null): QuestionRuntimeState | null;
  getCurrentConversationSessionId(): string | null | undefined;
  getSessionIdForTab(tabId: TabId | null): string | null | undefined;
  getQuestionDock(): Pick<QuestionDock, 'render'> | null;
  getQuestionDisplayMode(): QuestionDisplayMode;
  shouldUseAboveInputQuestionDock(): boolean;
  shouldRenderQuestionResolutionCards(): boolean;
  keepQuestionCardPinnedToBottom(tabId: TabId | null): void;
  setTabNeedsAttention(tabId: TabId | null, needsAttention: boolean): void;
  getPendingQuestions(): Promise<QuestionRequest[]>;
  replyToQuestion(requestId: string, answers: string[][]): Promise<void>;
  rejectQuestion(requestId: string): Promise<void>;
  refreshTabSessionStatus(...): Promise<unknown>;
  startConversationSyncLoop(): void;
  syncVisibleConversationInBackground(): Promise<void>;
}

export function createQuestionRuntimeHosts(...): QuestionRuntimeHosts;
export function createQuestionRuntimeServices(...): QuestionRuntimeServices;
```

## 关键行为

- `createQuestionRuntimeHosts()` 从同一份 view host 派生 inline-card、inline-resolution-action、resolution、dock、dock-render-state、dock-resolution-action、resolution-execution、dock-refresh、dock-queue runtime、pending-refresh runtime 与 post-resolution runtime 十一组 host，避免 `OpenCodianView` 继续为 question 子链维护多段闭包工厂
- `createQuestionRuntimeServices()` 顺序实例化 `QuestionInlineCardRenderer` → `QuestionInlineResolutionActionFacade` → `QuestionResolutionCoordinator` → `QuestionDockRenderStateFacade` → `QuestionDockResolutionActionFacade` → `QuestionResolutionExecutionFacade` → `QuestionDockQueueRuntimeFacade` → `QuestionPendingRefreshRuntimeFacade` → `QuestionPostResolutionRuntimeFacade` → `QuestionDockWritebackFacade` → `QuestionDockRefreshFacade` → `QuestionResolutionWritebackFacade` → `QuestionResolutionApplyFacade` → `QuestionDockCoordinator` → `QuestionResolutionFlowCoordinator`，保留原来的协作依赖关系，并把 inline question action 来源接到单独 seam，把 dock / inline resolve flow 的真实执行骨架接到同一条 apply seam、resolved-request suppression 接到同一条 writeback seam
- dock resolve 时的 `applyResolvedQuestionState()` 不再由 view 单独转发，而是通过 adapter 直接映射到共享 `QuestionResolutionCoordinator`
- dock render 时的 above-input / active-tab / active-request / session-match gating 不再留在 `QuestionDockCoordinator`，而是通过 adapter-wired `QuestionDockRenderStateFacade` 统一解析
- dock submit/reject 时的 draft-answer collection、required-answer gating 与 answered/rejected action assembly 不再留在 `QuestionDockCoordinator`，而是通过 adapter-wired `QuestionDockResolutionActionFacade` 统一解析
- inline fallback 的 `questionDisplayMode` 选择、inline `reply` / `reject` action 采集与 execution-action 组装不再留在 `QuestionResolutionFlowCoordinator`，而是通过 adapter-wired `QuestionInlineResolutionActionFacade` 统一解析
- dock 与 inline resolve 时的 `replyToQuestion()` / `rejectQuestion()` 执行与错误 notice 不再分别内嵌在 coordinator 中，而是通过 adapter-wired `QuestionResolutionExecutionFacade` 统一解析；执行成功后的共享 writeback 顺序再由 adapter-wired `QuestionResolutionApplyFacade` 串联
- dock waiter / enqueue / remove queue runtime state 不再留在 `QuestionDockCoordinator` 里直接读写，而是通过 adapter-wired `QuestionDockQueueRuntimeFacade` 承接
- pending-question refresh 的 API fetch/session filter/writeback 不再留在 `QuestionDockCoordinator` 的 refresh 分支里铺开，而是交给 adapter-wired `QuestionDockRefreshFacade`；resolved-request suppression 与 runtime map pruning 继续由 adapter-wired `QuestionPendingRefreshRuntimeFacade` 承接；queue enqueue/remove 与 refresh/clear 完成后的 attention/render writeback 继续由 adapter-wired `QuestionDockWritebackFacade` 承接；dock submit/reject action assembly 交给 adapter-wired `QuestionDockResolutionActionFacade`，dock 与 inline resolve 都通过 adapter-wired `QuestionResolutionWritebackFacade` 标记 suppression
- dock 与 inline resolve 成功后的 runtime follow-up 也不再分别内嵌在 coordinator 中，而是由 `QuestionResolutionApplyFacade` 统一串到 `QuestionResolutionWritebackFacade`，再由后者复用 `QuestionPostResolutionRuntimeFacade.followUpAfterResolution()`
- send pipeline 触发 question request 时，`OpenCodianView` 也不再持有 `showQuestionDialog()`；现在直接经由 bundle 中的 `QuestionResolutionFlowCoordinator`
- `getQuestionDock()` / `shouldUseAboveInputQuestionDock()` 这组 dock host 能力现在通常由 `QuestionDockSlotCoordinator` 代持，因此 adapter 只消费 dock port，不再要求 view 本身继续管理 slot lifecycle
- `shouldRenderQuestionResolutionCards()`、`setTabNeedsAttention()` 与 dock resolve 后的 sync follow-up 现在也通常由 adapter 从 settings / `TabRuntimeStateBridge` / `ConversationSyncBridge` 组合进来，因此 view host 进一步缩窄到 runtime-state / session / scroll pin 读取
- `OpenCodianView` 的 background-task post-sync refresh host 与 tab conversation state bridge 现在也直接经由同一份 question runtime bundle 调用 pending-question refresh / clear，不再额外经过 view forwarding 方法

## 与 `OpenCodianView` 的边界

- `OpenCodianView` 现在只提供一份更窄的 `QuestionRuntimeViewHostFactoryHost`；late-bound 的 dock/API/attention/sync/status wiring 先交给 `QuestionRuntimeViewHostFactory`，再由 `QuestionRuntimeViewHostAdapter` 组合成 `QuestionRuntimeViewHost`
- `QuestionDockCoordinator` 继续负责 dock callbacks 与 dock resolve writeback 顺序；dock render-state 选择由 `QuestionDockRenderStateFacade` 接管，dock submit/reject action assembly 由 `QuestionDockResolutionActionFacade` 接管，共享 question apply seam 由 `QuestionResolutionApplyFacade` 接管，真实 question API/error notice 由 `QuestionResolutionExecutionFacade` 接管，pending-question API refresh/session filter/writeback 协调由 `QuestionDockRefreshFacade` 接管，dock queue runtime map 维护由 `QuestionDockQueueRuntimeFacade` 接管，pending refresh runtime map 维护由 `QuestionPendingRefreshRuntimeFacade` 接管，queue enqueue/remove 与 refresh/clear 完成后的 attention/render writeback 由 `QuestionDockWritebackFacade` 接管，dock/inline resolved-request marking 与 resolved-state follow-up 由 `QuestionResolutionWritebackFacade` 接管
- `QuestionInlineCardRenderer`、`QuestionInlineResolutionActionFacade`、`QuestionResolutionCoordinator` 与 `QuestionResolutionFlowCoordinator` 继续分别负责 inline question card、inline resolution-action source、resolved question runtime 与 dock-or-inline resolve orchestration；adapter 只负责共享装配

# QuestionRuntimeHostAdapter

> **源码**: `src/features/chat/services/QuestionRuntimeHostAdapter.ts`
> **状态**: [REVIEW]

## 概述

`QuestionRuntimeHostAdapter` 把 `OpenCodianView` 里原本分散的 question runtime host factory 与 service instantiation 收束到一个模块，专门负责：

- 从单一 `QuestionRuntimeViewHost` 派生 `QuestionInlineCardRenderer`、`QuestionInlineResolutionActionFacade`、`QuestionResolutionCoordinator`、`QuestionDockRenderStateFacade`、`QuestionDockResolutionActionFacade`、`QuestionResolutionExecutionFacade` 与 `QuestionDockCoordinator` 所需的 host 回调与 lifecycle 端口
- 继续把 question resolve 之后的 status refresh / conversation sync follow-up 作为单独的 `QuestionPostResolutionRuntimeFacadeHost` 注入，再和 resolved-id 标记 / resolved-card apply 一起并入共享 `QuestionResolutionExecutionFacade` lifecycle seam，避免通用 view host 背负这组后处理端口
- 顺序装配 inline card、inline action source、resolved-question runtime、dock render-state/action facades、post-resolution runtime、execution facade、加厚后的 `QuestionDockCoordinator` 与 `QuestionResolutionFlowCoordinator`

当前这份 `QuestionRuntimeViewHost` 通常先由 `QuestionRuntimeViewHostFactory` + `QuestionRuntimeViewHostAdapter` 两层准备：factory 从 view 收口 late-bound 的 question 相邻端口，adapter 再把 dock/settings/API/tab-attention 组合成稳定 host；question resolve 后的 status refresh / sync follow-up 继续由独立的 `QuestionPostResolutionRuntimeHostAdapter` 复用已有 `SessionTodoCoordinator` 与 `ConversationSyncBridge` 稳定 port。

它不负责 question request 的服务端数据获取、resolved card DOM 内容拼装、question dock 的真正 DOM 渲染，或 pending-question lifecycle 规则本身；这些仍分别留给 `OpenCodeService`、`QuestionResolutionCardRenderer`、`QuestionDock` 与 `QuestionDockCoordinator`。

## 公开接口

```typescript
export interface QuestionRuntimeState
  extends QuestionDockRuntimeState,
    QuestionInlineCardRuntimeState,
    QuestionResolutionCoordinatorRuntimeState,
    QuestionPostResolutionRuntimeState {}

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
}
```

## 关键行为

- `createQuestionRuntimeHosts()` 从同一份 view host 派生 inline-card、inline-resolution-action、resolved-card runtime、dock lifecycle、dock-render-state、dock-resolution-action 与 resolution-execution 七组 host，并原样接入外部注入的 post-resolution runtime host
- `createQuestionRuntimeServices()` 现在让 `QuestionResolutionExecutionFacade` 持有 resolved-id suppression、resolved-card apply 与 post-resolution follow-up 的共享 lifecycle，而 `QuestionDockCoordinator` 继续专注 pending-question refresh、queue waiter、draft/active selection 与 attention/render writeback
- dock render-state gating 与 dock submit/reject action assembly 仍分别由 `QuestionDockRenderStateFacade` 与 `QuestionDockResolutionActionFacade` 解析；adapter 只负责装配
- send pipeline 触发 question request 时，`QuestionResolutionFlowCoordinator` 只选择 dock 或 inline action source；dock 与 inline 最终都复用同一个 `QuestionResolutionExecutionFacade` execution/apply seam

## 与 `OpenCodianView` 的边界

- `OpenCodianView` 只提供 `QuestionRuntimeViewHostFactoryHost` 需要的 runtime/session/settings/API/tab-attention 端口，不再创建 question 子链里的多段 facade
- `QuestionDockCoordinator` 是 question dock lifecycle 的主要 owner；`QuestionResolutionFlowCoordinator`、`QuestionInlineCardRenderer`、`QuestionInlineResolutionActionFacade` 与 `QuestionResolutionCoordinator` 继续分别负责 orchestration、inline DOM、inline action source 与 resolved-card runtime

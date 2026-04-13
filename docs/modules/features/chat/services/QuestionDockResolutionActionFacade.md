# QuestionDockResolutionActionFacade

> **源码**: `src/features/chat/services/QuestionDockResolutionActionFacade.ts`
> **状态**: [REVIEW]

## 概述

`QuestionDockResolutionActionFacade` 把上方 question dock 的 **submit/reject action assembly** 从 `QuestionDockCoordinator` 中收束出来，专门负责：

- 通过 `QuestionDockRenderStateFacade.getActivePendingQuestionRequest()` 读取目标 tab 当前 active pending request
- 在 submit 时从 dock interaction runtime 读取 draft answers，并复用 `QuestionDockInteractionState` 做 normalize / sanitize
- 复用 `questionDockState.isQuestionAnswerComplete()` 判断 required answer 是否仍缺失，并返回稳定的 `answer-required` action
- 在 submit / reject 两种 intent 之间产出共享的 `reply` / `reject` execution action，让 coordinator 不再直接分支铺开答案收集与 execution-action / resolution shape 组装

它不负责 `QuestionDock` DOM 渲染、dock render-state gating、queue waiter/runtime map 维护、pending-question refresh、真正调用 `replyToQuestion()` / `rejectQuestion()`，或 resolved-state / status/sync follow-up；这些仍分别由 `QuestionDock`、`QuestionDockRenderStateFacade`、`QuestionDockQueueRuntimeFacade`、`QuestionDockRefreshFacade`、`QuestionResolutionExecutionFacade` 与 `QuestionResolutionWritebackFacade` / `QuestionPostResolutionRuntimeFacade` 负责。

## 公开接口

```typescript
export interface QuestionDockResolutionActionFacadeHost {
  getActiveTabId(): TabId | null;
  getTabRuntimeState(tabId: TabId | null): QuestionDockResolutionActionRuntimeState | null;
}

export type QuestionDockResolutionIntent = 'submit' | 'reject';

export class QuestionDockResolutionActionFacade {
  resolveAction(
    intent: QuestionDockResolutionIntent,
    tabId?: TabId | null,
  ): QuestionDockResolutionAction;
}
```

## 关键行为

- `resolveAction()` 没有 active pending request 时返回 `skip`，保持 dock callback 在竞态下的原有 no-op 语义
- `submit` 会读取并 sanitize 当前 draft answers；任一 question 仍未完成时返回 `answer-required`，由 coordinator 继续触发现有本地化 notice
- `submit` 成功时返回带 `answers` 与 answered `QuestionResolution` 的共享 `reply` execution action
- `reject` 不读取 draft answers，直接返回 rejected execution action，避免拒绝路径被答案 runtime 状态影响

## 与 question bundle 的边界

- `QuestionRuntimeHostAdapter` 负责从共享 `QuestionRuntimeViewHost` 派生本 facade 所需的 active tab 与 runtime-state host，并把同一份 `QuestionDockRenderStateFacade` 作为 active-request port 注入
- `QuestionDockCoordinator` 只消费本 facade 的 `skip` / `answer-required` / `reply` / `reject` action；真实 API 调用与错误 notice 现在交给共享的 `QuestionResolutionExecutionFacade`
- `OpenCodianView` 不需要新增 dock resolution helper；view 仍只提供 question runtime 的 view host，dock action assembly 留在服务层

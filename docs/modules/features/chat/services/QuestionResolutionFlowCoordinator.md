# QuestionResolutionFlowCoordinator

> **源码**: `src/features/chat/services/QuestionResolutionFlowCoordinator.ts`
> **状态**: [REVIEW]

## 概述

`QuestionResolutionFlowCoordinator` 把 `OpenCodianView` 中 `showQuestionDialog()` 持有的 **dock-or-inline fallback 编排** 收束到一个 dedicated service，专门负责：

- 先把 question request 交给 `QuestionDockCoordinator.waitForDockResolutionIfEnabled()`，在启用上方 dock 时复用 dock lifecycle queue
- 当 dock 未接管时，向 `QuestionInlineResolutionActionFacade` 请求 inline fallback 的统一 execution action
- 在 inline fallback 收到 action 后，直接把它交给 `QuestionResolutionExecutionFacade`，复用同一条 execution/apply seam、resolved-id suppression 与 post-resolution follow-up

它不负责 grouped/sequential question card 的 DOM 构造、inline action-shape 组装、pending-question runtime map、真实 question API/error notice 或回答后的 status refresh；这些仍分别由 `QuestionInlineCardRenderer`、`QuestionInlineResolutionActionFacade`、`QuestionDockCoordinator`、`QuestionResolutionExecutionFacade` 与 `QuestionPostResolutionRuntimeFacade` 负责。

## 公开接口

```typescript
export interface QuestionResolutionFlowCoordinatorPorts {
  dockCoordinator: Pick<QuestionDockCoordinator, 'waitForDockResolutionIfEnabled'>;
  inlineResolutionAction: Pick<QuestionInlineResolutionActionFacade, 'collectResolutionAction'>;
  resolutionExecution: Pick<QuestionResolutionExecutionFacade, 'executeAndApply'>;
}

export class QuestionResolutionFlowCoordinator {
  showQuestionDialog(request: QuestionRequest, tabId?: TabId | null): Promise<QuestionResolutionFlowResult>;
}
```

## 关键行为

- `showQuestionDialog()` 先调用 dock handoff；如果当前 request 已被上方 dock 接管，就返回 `answered` 结果并且不重复触发 inline fallback
- 只有 dock 未接管时才会调用 inline action source；grouped/sequential 选择与 reply/reject action-shape 组装仍留在 `QuestionInlineResolutionActionFacade`
- inline fallback 成功后直接调用 `QuestionResolutionExecutionFacade.executeAndApply()`，不再让 flow coordinator 为了 post-resolution lifecycle 回跳 dock owner
- 返回值区分 `answered` / `rejected` / `cancelled`，供 Claude Code `AskUserQuestion` 和 MCP `onElicitation` 这类非 OpenCode SDK callback 把统一 question UX 的结果转换回各自 SDK 的 answer shape；send pipeline 只消费 Promise completion，不读取该结果

## 与 `OpenCodianView` 的边界

- `OpenCodianView` 不直接实现 `showQuestionDialog()`；send pipeline 继续复用本 coordinator，并在 Claude Code bridge host 中复用同一个 coordinator，避免绕过 dock / above-input / resolved-id 状态
- 本模块只负责 dock-vs-inline orchestration，并把 inline fallback 接到共享 execution/apply seam；它不重新拥有 dock render、inline DOM、inline action assembly、resolved card DOM 或 session status refresh / sync-loop 逻辑

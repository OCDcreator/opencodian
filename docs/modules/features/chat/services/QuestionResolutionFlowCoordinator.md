# QuestionResolutionFlowCoordinator

> **源码**: `src/features/chat/services/QuestionResolutionFlowCoordinator.ts`
> **状态**: [REVIEW]

## 概述

`QuestionResolutionFlowCoordinator` 把 `OpenCodianView` 中 `showQuestionDialog()` 持有的 **dock-or-inline fallback、OpenCode reply/reject 调用、resolved-state follow-up 与错误 notice** 收束到一个 dedicated service，专门负责：

- 先把 question request 交给 `QuestionDockCoordinator`，在启用上方 dock 时复用现有 waiter / pending queue 流程
- 当当前设置仍使用 inline question card 时，调用 `QuestionInlineCardRenderer.collectAction()` 收集 `reply` / `reject`
- 在 inline fallback 成功后统一执行 `replyToQuestion()` / `rejectQuestion()`、resolved-request suppress，以及 `QuestionResolutionCoordinator` 的 resolved state bridge

它不负责 grouped/sequential question card 的 DOM 构造，也不负责上方 dock 的 pending-question state、render callbacks 或回答后的 status refresh；这些仍分别由 `QuestionInlineCardRenderer` 与 `QuestionDockCoordinator` 负责。

## 公开接口

```typescript
export interface QuestionResolutionFlowCoordinatorHost {
  getActiveTabId(): TabId | null;
  getQuestionDisplayMode(): QuestionDisplayMode;
  replyToQuestion(requestId: string, answers: string[][]): Promise<void>;
  rejectQuestion(requestId: string): Promise<void>;
}

export interface QuestionResolutionFlowCoordinatorPorts {
  dockCoordinator: Pick<QuestionDockCoordinator, 'waitForDockResolutionIfEnabled' | 'markQuestionRequestResolved'>;
  inlineCardRenderer: Pick<QuestionInlineCardRenderer, 'collectAction'>;
  resolutionCoordinator: Pick<QuestionResolutionCoordinator, 'applyResolvedQuestionState'>;
}

export class QuestionResolutionFlowCoordinator {
  showQuestionDialog(request: QuestionRequest, tabId?: TabId | null): Promise<void>;
}
```

## 关键行为

- `showQuestionDialog()` 先调用 `QuestionDockCoordinator.waitForDockResolutionIfEnabled()`；如果当前 request 已被上方 dock 接管，就直接退出，不重复触发 inline fallback
- 只有在 dock 未接管时，才会按 `questionDisplayMode` 调用 `QuestionInlineCardRenderer.collectAction()`，保持 grouped/sequential 行为不变
- inline fallback 成功后，会先通过 `QuestionDockCoordinator.markQuestionRequestResolved()` 压制下一次 pending refresh 的回流，再把 answered/rejected 状态写给 `QuestionResolutionCoordinator`
- OpenCode `replyToQuestion()` / `rejectQuestion()` 失败时，会保留现有的 error logger 与 `chat.question.notice.error` 提示

## 与 `OpenCodianView` 的边界

- `OpenCodianView` 现在不再直接实现 `showQuestionDialog()`；send pipeline 会直接复用这份 coordinator
- `QuestionRuntimeHostAdapter` 负责装配本 coordinator，并把它与 `QuestionDockCoordinator`、`QuestionInlineCardRenderer`、`QuestionResolutionCoordinator` 接到同一份 question runtime bundle
- 本模块只负责 resolve flow orchestration，不重新拥有 dock render、inline DOM、resolved card DOM 或 session status refresh 逻辑

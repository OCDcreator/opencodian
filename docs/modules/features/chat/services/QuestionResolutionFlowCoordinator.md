# QuestionResolutionFlowCoordinator

> **源码**: `src/features/chat/services/QuestionResolutionFlowCoordinator.ts`
> **状态**: [REVIEW]

## 概述

`QuestionResolutionFlowCoordinator` 把 `OpenCodianView` 中 `showQuestionDialog()` 持有的 **dock-or-inline fallback 与 resolved-state follow-up 编排** 收束到一个 dedicated service，专门负责：

- 先把 question request 交给 `QuestionDockCoordinator`，在启用上方 dock 时复用现有 waiter / pending queue 流程
- 当当前设置仍使用 inline question card 时，调用 `QuestionInlineCardRenderer.collectAction()` 收集 `reply` / `reject`
- 在 inline fallback 收到 action 后，把统一的 `reply` / `reject` execution action 委托给共享的 `QuestionResolutionApplyFacade`，由它统一串联 `QuestionResolutionExecutionFacade` 与 `QuestionResolutionWritebackFacade`

它不负责 grouped/sequential question card 的 DOM 构造，也不负责上方 dock 的 pending-question state、render callbacks、真实 question API/error notice、共享 execute-then-writeback 骨架，或回答后的 status refresh；这些仍分别由 `QuestionInlineCardRenderer`、`QuestionDockCoordinator`、`QuestionResolutionApplyFacade` 与 `QuestionResolutionExecutionFacade` 负责。

## 公开接口

```typescript
export interface QuestionResolutionFlowCoordinatorHost {
  getActiveTabId(): TabId | null;
  getQuestionDisplayMode(): QuestionDisplayMode;
}

export interface QuestionResolutionFlowCoordinatorPorts {
  dockCoordinator: Pick<QuestionDockCoordinator, 'waitForDockResolutionIfEnabled'>;
  inlineCardRenderer: Pick<QuestionInlineCardRenderer, 'collectAction'>;
  resolutionApply: Pick<QuestionResolutionApplyFacade, 'applyAction'>;
}

export class QuestionResolutionFlowCoordinator {
  showQuestionDialog(request: QuestionRequest, tabId?: TabId | null): Promise<void>;
}
```

## 关键行为

- `showQuestionDialog()` 先调用 `QuestionDockCoordinator.waitForDockResolutionIfEnabled()`；如果当前 request 已被上方 dock 接管，就直接退出，不重复触发 inline fallback
- 只有在 dock 未接管时，才会按 `questionDisplayMode` 调用 `QuestionInlineCardRenderer.collectAction()`，保持 grouped/sequential 行为不变
- inline fallback 成功后，会把 `reply` / `reject` action 直接交给 `QuestionResolutionApplyFacade.applyAction()`
- `QuestionResolutionApplyFacade` 会先复用 `QuestionResolutionExecutionFacade.execute()`；只有执行成功时，才会继续调用 `QuestionResolutionWritebackFacade.applyResolution()`
- 执行成功后的 writeback seam 会先压制下一次 pending refresh 的回流，再把 answered/rejected 状态写给 `QuestionResolutionCoordinator`，最后复用 `QuestionPostResolutionRuntimeFacade` 执行与 dock 相同的 runtime 收尾
- OpenCode `replyToQuestion()` / `rejectQuestion()` 的错误日志与 `chat.question.notice.error` 提示继续由共享的 `QuestionResolutionExecutionFacade` 处理

## 与 `OpenCodianView` 的边界

- `OpenCodianView` 现在不再直接实现 `showQuestionDialog()`；send pipeline 会直接复用这份 coordinator
- `QuestionRuntimeHostAdapter` 负责装配本 coordinator，并把它与 `QuestionDockCoordinator`、`QuestionInlineCardRenderer`、`QuestionResolutionApplyFacade`、`QuestionResolutionExecutionFacade`、`QuestionResolutionCoordinator`、`QuestionResolutionWritebackFacade`、`QuestionPendingRefreshRuntimeFacade`、`QuestionPostResolutionRuntimeFacade` 接到同一份 question runtime bundle
- 本模块只负责 resolve flow orchestration，不重新拥有 dock render、inline DOM、resolved card DOM 或 session status refresh / sync-loop 逻辑

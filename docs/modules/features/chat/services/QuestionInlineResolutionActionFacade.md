# QuestionInlineResolutionActionFacade

> **源码**: `src/features/chat/services/QuestionInlineResolutionActionFacade.ts`
> **状态**: [REVIEW]

## 概述

`QuestionInlineResolutionActionFacade` 把 inline question fallback 里的 **action 来源与 action-shape 组装** 从 `QuestionResolutionFlowCoordinator` 中收束出来，专门负责：

- 按当前 `questionDisplayMode` 调用 `QuestionInlineCardRenderer.collectAction()` 收集 grouped / sequential inline reply 或 reject
- 把 inline card 返回的 `reply` / `reject` 统一映射成 `QuestionResolutionExecutionFacade` 可复用的 execution action
- 在 inline question card 无法挂载时，集中记录同一条错误日志

它不负责 dock handoff 判定、共享 execute-then-writeback 骨架，或 resolved-state follow-up；这些仍分别由 `QuestionResolutionFlowCoordinator`、`QuestionResolutionApplyFacade` 与 `QuestionResolutionWritebackFacade` 负责。

## 公开接口

```typescript
export interface QuestionInlineResolutionActionFacadeHost {
  getActiveTabId(): TabId | null;
  getQuestionDisplayMode(): QuestionDisplayMode;
}

export class QuestionInlineResolutionActionFacade {
  collectResolutionAction(
    request: QuestionRequest,
    tabId?: TabId | null,
  ): Promise<QuestionResolutionExecutionAction | null>;
}
```

## 关键行为

- `collectResolutionAction()` 始终通过 host 读取当前的 `questionDisplayMode`，因此 grouped / sequential inline 流程的选择不再留在 flow coordinator 中
- inline card 返回 `reply` 时，会创建 answered resolution；返回 `reject` 时，会创建 rejected resolution
- inline card 无法提供 action 时返回 `null`，由上层 orchestration 决定直接退出

## 与 question bundle 的边界

- `QuestionRuntimeHostAdapter` 负责把本 facade 与 `QuestionInlineCardRenderer` 装进同一份 question runtime bundle
- `QuestionResolutionFlowCoordinator` 现在只关心 dock 是否接管，以及 inline 分支是否拿到统一 execution action
- `OpenCodianView` 仍只提供 `questionDisplayMode` 与 runtime host；inline action 收集细节继续留在 question 服务层

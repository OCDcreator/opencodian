# QuestionResolutionApplyFacade

> **源码**: `src/features/chat/services/QuestionResolutionApplyFacade.ts`
> **状态**: [REVIEW]

## 概述

`QuestionResolutionApplyFacade` 把 question resolve 流程里共享的 **execute-then-writeback 骨架** 从 `QuestionDockCoordinator` 与 `QuestionResolutionFlowCoordinator` 中收束出来，专门负责：

- 接收 dock 或 inline fallback 产出的统一 `reply` / `reject` execution action
- 先复用 `QuestionResolutionExecutionFacade` 执行真实 OpenCode reply/reject 调用与错误 notice
- 仅在执行成功后，继续复用 `QuestionResolutionWritebackFacade` 处理 resolved-id suppression、resolved state 写回与 post-resolution follow-up
- 允许调用方透传 dock 专属的 `afterStateApplied` callback，让 dock 继续在 follow-up 前移除 pending request

它不负责 dock draft answer 收集、inline action 采集、真实 question API、resolved state 写回细节，或 post-resolution runtime follow-up；这些仍分别由 `QuestionDockResolutionActionFacade`、`QuestionInlineCardRenderer`、`QuestionResolutionExecutionFacade` 与 `QuestionResolutionWritebackFacade` 负责。

## 公开接口

```typescript
export class QuestionResolutionApplyFacade {
  applyAction(
    action: QuestionResolutionExecutionAction,
    tabId: TabId | null,
    options?: {
      afterStateApplied?: (() => void | Promise<void>) | null;
    },
  ): Promise<boolean>;
}
```

## 关键行为

- `applyAction()` 固定按 `execute -> optional skip on failure -> writeback` 的顺序运行
- dock resolve 可传入 `afterStateApplied`，因此 pending queue 移除仍发生在 resolved state 写回后、follow-up 前
- inline fallback 不传额外选项，因此只复用共享的 execute 与 writeback 顺序

## 与 question bundle 的边界

- `QuestionRuntimeHostAdapter` 负责装配本 facade，并把同一份 apply seam 注入 dock 与 inline 两条 resolve 流程
- `QuestionDockCoordinator` 与 `QuestionResolutionFlowCoordinator` 现在只保留 action 来源差异，不再各自维护 execute-then-writeback 骨架
- `OpenCodianView` 仍只提供 question runtime host；共享 apply 顺序继续留在服务层

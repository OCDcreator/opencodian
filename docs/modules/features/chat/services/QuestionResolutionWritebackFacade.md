# QuestionResolutionWritebackFacade

> **源码**: `src/features/chat/services/QuestionResolutionWritebackFacade.ts`
> **状态**: [REVIEW]

## 概述

`QuestionResolutionWritebackFacade` 把 question 回答/拒绝成功后的 **resolved-id suppression、resolved card runtime 写回，以及后续 status/sync follow-up** 收束到一个小型 writeback facade，专门负责：

- 让上方 question dock 与 inline fallback 共用同一条 post-resolution writeback 顺序
- 先把 request id 写入 `QuestionPendingRefreshRuntimeFacade` 的 suppression set，再把 `QuestionResolutionCoordinator` 的 answered/rejected runtime state 写回
- 支持 dock 在 resolved state 写回后、follow-up 前插入自己的 pending queue 移除与 dock rerender callback
- 最后统一触发 `QuestionPostResolutionRuntimeFacade.followUpAfterResolution()`，避免两个 coordinator 分别持有 status/sync 收尾细节

它不负责调用 OpenCode 的 `replyToQuestion()` / `rejectQuestion()`、共享 execute-then-writeback 骨架、pending-question API refresh、dock DOM render 或 inline card DOM；这些仍分别留给 `QuestionResolutionExecutionFacade`、`QuestionResolutionApplyFacade`、`QuestionResolutionFlowCoordinator`、`QuestionDockCoordinator`、`QuestionDock` 与 `QuestionInlineCardRenderer`。

## 公开接口

```typescript
export interface QuestionResolutionWritebackFacadeHost {
  markQuestionRequestResolved(requestId: string, tabId: TabId | null): void;
  applyResolvedQuestionState(resolution: QuestionResolution, tabId: TabId | null): void;
  followUpAfterResolution(tabId: TabId | null): Promise<void>;
}

export class QuestionResolutionWritebackFacade {
  applyResolution(
    resolution: QuestionResolution,
    tabId: TabId | null,
    options?: {
      afterStateApplied?: (() => void | Promise<void>) | null;
    },
  ): Promise<void>;
}
```

## 关键行为

- `applyResolution()` 固定按 `mark resolved -> apply resolved state -> optional afterStateApplied -> follow-up` 的顺序执行
- inline fallback 不传 `afterStateApplied`，因此只写回 resolved state 并执行通用 follow-up
- 上方 dock resolve 会传入 `afterStateApplied`，用于在 follow-up 前移除 pending request、刷新 dock 与 attention state，保持原有 dock resolve 顺序

## 与 question bundle 的边界

- `QuestionRuntimeHostAdapter` 负责装配本 facade，把 `QuestionPendingRefreshRuntimeFacade`、`QuestionResolutionCoordinator` 与 `QuestionPostResolutionRuntimeFacade` 串成一条共享 writeback seam
- `QuestionResolutionApplyFacade` 现在直接依赖本 facade 的窄口，把 execute 成功后的共享 writeback 顺序收束到一个更稳定的 apply seam
- `QuestionDockCoordinator` 与 `QuestionResolutionFlowCoordinator` 不再分别持有 resolved-id suppression、resolved-state bridge 与 post-resolution follow-up 三个独立 port
- `OpenCodianView` 不需要新增 question writeback helper；view 仍只提供 question runtime 的 view host，具体 post-resolution 写回顺序留在服务层

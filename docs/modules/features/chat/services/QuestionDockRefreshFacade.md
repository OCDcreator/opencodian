# QuestionDockRefreshFacade

> **源码**: `src/features/chat/services/QuestionDockRefreshFacade.ts`
> **状态**: [REVIEW]

## 概述

`QuestionDockRefreshFacade` 把上方 question dock 的 **pending-question API fetch、session 过滤，以及 refresh/clear 后的 runtime + writeback 协调** 从 `QuestionDockCoordinator` 中收束出来，专门负责：

- 拉取 `OpenCodeService.getPendingQuestions()` 的结果，并按目标 tab 的 session 过滤出当前会话的 pending requests
- 把 filtered request 合并、resolved-request suppression、waiter-owned request 保活，以及 stale draft/group/index 清理委托给 `QuestionPendingRefreshRuntimeFacade`
- 把 refresh/clear 完成后的 active/background attention 与 dock render 写回委托给 `QuestionDockWritebackFacade`
- 在 session 缺失时统一清空对应 tab 的 pending-question runtime state，并沿用同一条 writeback seam

它不负责上方 dock 的 render payload、waiter 创建、queue enqueue/remove、提交/拒绝回答，或 resolve 后的 status/sync follow-up；这些仍分别留给 `QuestionDockCoordinator`、`QuestionDockQueueRuntimeFacade`、`QuestionDockInteractionState`、`QuestionResolutionWritebackFacade` 与 `QuestionPostResolutionRuntimeFacade`。

## 公开接口

```typescript
export interface QuestionDockRefreshFacadeHost {
  getTabRuntimeState(tabId: TabId | null): QuestionPendingRefreshRuntimeState | null;
  getSessionIdForTab(tabId: TabId | null): string | null | undefined;
  getPendingQuestions(): Promise<QuestionRequest[]>;
}

export class QuestionDockRefreshFacade {
  clearPendingQuestionsForTab(tabId: TabId | null): void;
  refreshPendingQuestionsForTab(
    tabId: TabId | null,
    sessionId?: string | null,
  ): Promise<QuestionRequest[]>;
}
```

## 关键行为

- `refreshPendingQuestionsForTab()` 默认会回退到 host 的 `getSessionIdForTab()`，让 tab/session 解析与服务端拉取都留在同一条 refresh seam
- refresh 成功时先做 session 过滤，再交给 `QuestionPendingRefreshRuntimeFacade.applyRefreshedPendingQuestionRequests()` 统一完成 resolved/waiter/draft state 维护
- refresh/clear 后不直接操作 UI，而是统一调用 `QuestionDockWritebackFacade`：active tab 清 attention 并重绘 dock，后台 tab 只根据剩余 request 写入 `needsAttention`
- refresh 失败时保留当前 runtime 里的 pending requests，避免短暂 API 异常把本地 dock 状态清空

## 与 `OpenCodianView` 的边界

- `QuestionRuntimeHostAdapter` 负责从共享 `QuestionRuntimeViewHost` 派生本 facade 所需的 `getPendingQuestions()` / `getSessionIdForTab()` / runtime state host，`OpenCodianView` 不再直接拼这段 refresh orchestration
- `QuestionDockCoordinator` 继续暴露 `clearPendingQuestionsForTab()` / `refreshPendingQuestionsForTab()` 的公共入口，但具体的 fetch/session-filter/runtime-writeback 协调已转交给本 facade
- `QuestionPendingRefreshRuntimeFacade` 继续只维护 pending-question runtime state；`QuestionDockWritebackFacade` 继续只处理 attention/render writeback；本 facade 负责把两者串成一条稳定的 refresh/clear 通路

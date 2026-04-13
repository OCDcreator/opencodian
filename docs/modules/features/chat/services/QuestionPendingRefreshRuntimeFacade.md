# QuestionPendingRefreshRuntimeFacade

> **源码**: `src/features/chat/services/QuestionPendingRefreshRuntimeFacade.ts`
> **状态**: [REVIEW]

## 概述

`QuestionPendingRefreshRuntimeFacade` 把 pending question refresh 期间的 **resolved-request suppression、waiter-owned request 保活，以及草稿/active-index runtime state 清理** 从 `QuestionDockCoordinator` 中收束到一个小型 runtime facade，专门负责：

- 根据当前 tab runtime 的 `resolvedQuestionRequestIds` 压制刚被回答/拒绝、但服务端 pending 快照还没移除的 question request
- 在 refresh 快照缺失时保留仍由上方 dock waiter 持有的 request，避免提交/拒绝中的 UI 被短暂服务端快照抹掉
- 统一维护 `pendingQuestionRequests`、draft answers、active group/index 与 resolved-id pruning，避免 coordinator 在 refresh 分支里直接铺开多组 runtime map 操作

它不负责向 OpenCode 拉取 pending question、按 session 过滤、queue enqueue/remove 与 refresh/clear 完成后的 attention/render writeback、dock DOM render、dock waiter 生命周期、回答/拒绝请求，或 resolve 后的 status/sync follow-up；这些仍分别留给 `QuestionDockCoordinator`、`QuestionDockWritebackFacade`、`QuestionDock`、`QuestionDockQueueRuntimeFacade`、question API 与 `QuestionPostResolutionRuntimeFacade`。

## 公开接口

```typescript
export interface QuestionPendingRefreshRuntimeFacadeHost {
  getTabRuntimeState(tabId: TabId | null): QuestionPendingRefreshRuntimeState | null;
}

export class QuestionPendingRefreshRuntimeFacade {
  getPendingQuestionRequests(tabId: TabId | null): QuestionRequest[];
  clearPendingQuestionState(tabId: TabId | null): void;
  markQuestionRequestResolved(requestId: string, tabId: TabId | null): void;
  applyRefreshedPendingQuestionRequests(
    tabId: TabId | null,
    sessionRequests: readonly QuestionRequest[],
  ): QuestionRequest[];
}
```

## 关键行为

- `applyRefreshedPendingQuestionRequests()` 接收已经按 session 过滤过的 request 列表，再统一执行 resolved-id 过滤、waiter-owned request 合并、draft answer normalization 与 stale draft/group/index pruning
- `markQuestionRequestResolved()` 只写入本地 suppression set，等待下一次 pending refresh 时压制服务端尚未清理的 request
- `clearPendingQuestionState()` 清空 pending requests、resolved ids、draft answers、active group/index 与 waiter map，用于 tab/session 切换或显式清理；其中 waiter map 的创建/resolve 生命周期由 `QuestionDockQueueRuntimeFacade` 负责，本 facade 只在 refresh/clear 时读写整体集合

## 与 `OpenCodianView` 的边界

- `QuestionRuntimeHostAdapter` 负责从共享 `QuestionRuntimeViewHost` 派生本 facade 所需的 runtime host；`OpenCodianView` 不需要暴露额外的 question-refresh 专属 helper
- `QuestionDockCoordinator` 继续负责 question API fetch、session 过滤与 dock resolution flow；dock queue 的 waiter/enqueue/remove runtime 读写由 `QuestionDockQueueRuntimeFacade` 承接，pending refresh 期间的 resolved-state / stale-state 读写由本 facade 承接，queue enqueue/remove 与 refresh/clear 完成后的 attention/render writeback 由 `QuestionDockWritebackFacade` 承接
- `QuestionResolutionWritebackFacade` 现在经由本 facade 的 `markQuestionRequestResolved()` 小 port 标记 dock 与 inline fallback resolution，让两条 resolve path 写入同一份 suppression set

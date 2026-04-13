# VisibleConversationPostSyncCoordinator

> **源码**: `src/features/chat/services/VisibleConversationPostSyncCoordinator.ts`
> **状态**: [REVIEW]

## 概述

`VisibleConversationPostSyncCoordinator` 把 active visible-conversation background sync 收尾里的 refresh + state-commit 组合从 `BackgroundTaskPostSyncCoordinator` 中再收窄一层，专门负责：

- 先委托 `PostSyncQuestionTodoRefreshFacade` 执行 visible question / todo refresh
- 再委托 `VisibleConversationPostSyncStateCoordinator` 完成 current-conversation match、revert-state/fingerprint 写回与 render outcome 判定
- 让 visible path 和 hidden/background handoff path 形成对称 seam，避免 `BackgroundTaskPostSyncCoordinator` 同时拥有两侧 post-sync 编排细节

它不负责 signal/background-tab 的 source-specific handoff，也不负责 authoritative mark、attention、background-task rebuild 或 completion notice flush；这些仍分别留给 `BackgroundTaskPostSyncCoordinator`、`BackgroundConversationPostSyncHandoffCoordinator`、`BackgroundConversationPostSyncRefreshExecutor` 与相关 coordinator。

## 公开接口

```typescript
export interface VisibleConversationPostSyncOptions {
  tabId: TabId;
  expectedConversationId: string;
  questionSessionId: string | null | undefined;
  syncResult: VisibleConversationPostSyncResult;
}

export class VisibleConversationPostSyncCoordinator {
  handleVisibleConversationSyncComplete(...): Promise<VisibleConversationPostSyncOutcome>;
}
```

## 关键行为

- `handleVisibleConversationSyncComplete()` 先刷新 pending question / todo / status，再提交 visible current-conversation state
- visible refresh 的 session-id 配对继续由 `PostSyncQuestionTodoRefreshFacade` 与 `PostSyncQuestionTodoRefreshPlanBuilder` 组合承接
- state commit、fingerprint 更新与 apply/indicator outcome 判定继续由 `VisibleConversationPostSyncStateCoordinator` 持有，本 coordinator 只维护调用顺序

## 与 `OpenCodianView` 的边界

- `QuestionTodoBackgroundTaskRefreshHostAdapter` 统一装配本 coordinator 所需的 visible refresh seam 与 visible state-commit seam
- `ConversationSyncVisiblePostSyncRouter` 现在直接依赖本 coordinator，避免 visible post-sync 再绕经 hidden/background coordinator
- `BackgroundTaskPostSyncCoordinator` 现在只负责 hidden/background path 路由到 `BackgroundConversationPostSyncHandoffCoordinator`
- 这次切片继续推进 master plan 的 P2 `question / todo / background task` lane，把 active visible-conversation sync 的 refresh/commit 组合也迁到 dedicated single-purpose module

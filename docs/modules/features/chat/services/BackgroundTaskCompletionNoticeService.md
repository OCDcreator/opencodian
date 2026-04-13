# BackgroundTaskCompletionNoticeService

> **源码**: `src/features/chat/services/BackgroundTaskCompletionNoticeService.ts`
> **状态**: [REVIEW]

## 概述

`BackgroundTaskCompletionNoticeService` 把 `OpenCodianView` 里 background task completion notice 的队列与落盘协调独立出来，专门负责：

- 聚合同一 anchor 下的 completion reminder，维护 queued notice runtime
- 构造 completion notice 的稳定 fingerprint 与 markdown content
- 根据已持久化的 `noticeMeta` 做 source-reminder / task 集合去重
- 在 stream 结束后追加持久化 completion notice，并保留 noticeMeta 供 reload 后恢复

它不负责 background task timeline 推导，也不决定何时收集 segment；timeline 与 completion segment 收集现在由 `BackgroundTaskTimelineService` 负责，queue/flush 的调用时机则由 `BackgroundTaskIndicatorCoordinator` 在 inline render / post-sync 场景下统一协调。

## 公开接口

```typescript
export interface BackgroundTaskCompletionNoticeServiceHost {
  getTabRuntimeState(tabId: TabId | null): BackgroundTaskCompletionNoticeRuntime | null;
  appendPersistentAssistantNoticeMessage(...): Promise<void>;
}

export class BackgroundTaskCompletionNoticeService {
  queueNotices(...): void;
  flushQueuedNotices(...): Promise<void>;
}
```

## 关键行为

### queued reminder 聚合

- `queueNotices()` 以 `anchorKey` 为粒度合并 reminder 事件，把多个 source reminder 和 task 列表折叠进一个 queued notice
- 同一个 reminder message 若已经在 conversation 历史的 `noticeMeta.sourceReminderIds` 里出现，就不会再次入队
- `all-background-tasks-complete` 会提升 queued notice 的 `allComplete` 标记，但不会丢失之前已收集的单任务完成项

### persisted dedupe 与 flush

- `flushQueuedNotices()` 只在 tab 不再 streaming 时真正落盘，避免 primary stream 期间插入额外 notice
- flush 前会再次用 `anchorKey + allComplete + sorted taskIds` fingerprint 对照历史 notice，防止 reload / sync 后重复写入
- 追加 notice 时会把 `sourceReminderIds`、`taskIds` 和 `allComplete` 写回 `noticeMeta`，供后续 reload、后台同步和 dedupe 复用；真正的 persisted append 现统一经由 `PersistentAssistantNoticeService`

## 与 `OpenCodianView` 的边界

- `BackgroundTaskTimelineService` 负责 background task timeline 推导与 completion segment 的收集
- `BackgroundTaskInlinePanelRenderer` 负责 inline panel DOM 渲染
- `OpenCodianView` 负责 hydration / authoritative-sync gate host bridge
- `BackgroundTaskIndicatorCoordinator` 负责 completion notice queue/flush 的调用顺序，并供 hidden signal/background-tab sync 复用
- `BackgroundConversationPostSyncHandoffCoordinator` 负责 hidden signal/background-tab sync 后触发 completion notice refresh
- `PersistentAssistantNoticeService` 负责 completion notice 的持久化 append、sync fingerprint 写回，以及 hidden-tab attention/visible scroll follow-up
- `BackgroundTaskCompletionNoticeService` 负责 completion notice queued state、content/fingerprint 和 persisted dedupe/append 协调
- 这让 P2 `question / todo / background task` lane 继续把 background-task completion ownership 从主 view 迁到 dedicated service，而不是继续把 notice 细节留在 `OpenCodianView`

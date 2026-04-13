# BackgroundTaskTimelineService

> **源码**: `src/features/chat/services/BackgroundTaskTimelineService.ts`
> **状态**: [REVIEW]

## 概述

`BackgroundTaskTimelineService` 把 `OpenCodianView` 里仍然成块耦合的 background-task timeline/runtime ownership 收束成一个 dedicated service，专门负责：

- 从 search-mode user injection、`toolName === 'task'` 的 tool block，以及 system reminder 组装 segment timeline
- 维护 launch/completion 的 pending matching、completion event 收集与 display copy 组装
- 把 conversation 历史重建回 tab runtime 的 active anchor / launch / completion / waiting-for-follow-up 状态
- 为 inline panel 渲染和 completion notice queue 提供统一的 segment 视图
- 为 OMO background-task diagnostics 提供稳定的 anchor / pending / completed 快照

它不负责 stale/stopped notice 的内容与 suppression，也不直接渲染 inline panel DOM 或编排 completion notice queue/flush；这些现在分别由 `BackgroundTaskNoticeStateService`、`BackgroundTaskInlinePanelRenderer` 和 `BackgroundTaskIndicatorCoordinator` 承接。

## 公开接口

```typescript
export interface BackgroundTaskTimelineServiceHost {
  getTabRuntimeState(tabId: TabId | null): BackgroundTaskTimelineRuntime | null;
  getActiveTabId(): TabId | null;
  getMessageAnchorKey(message: ChatMessage): string;
  armAuthoritativeSyncGate(tabId: TabId | null): void;
  clearAuthoritativeSyncGate(tabId: TabId | null): void;
  syncTabStreamLikeState(tabId: TabId | null): void;
  isSuppressedBackgroundTaskSegment(...): boolean;
}

export class BackgroundTaskTimelineService {
  armIndicatorForUserMessage(...): void;
  upsertLaunch(...): void;
  collectSegments(...): BackgroundTaskSegment[];
  collectInlineSegments(...): BackgroundTaskSegment[];
  syncStateFromConversation(...): void;
  getPendingLaunches(...): BackgroundTaskLaunchInfo[];
  shouldRenderInlineSegment(...): boolean;
  getInlineCopy(...): BackgroundTaskInlineCopy;
  collectDiagnostics(...): BackgroundTaskDiagnostics | null;
  getLaunchDisplayId(...): string;
}
```

## 关键行为

### timeline segment 推导

- `collectSegments()` 会按 user anchor 聚合 task tool block 和 completion reminder；当 reminder 没有显式 task→launch 匹配时，会回退到最近仍 pending 的 segment
- active runtime 里的 launch/completion 也会并入同一条 timeline，避免只靠 conversation 快照时丢失尚未持久化的前台状态
- `collectInlineSegments()` 再叠加 stale-suppression 与 renderability 过滤，让 view 拿到可直接渲染的 segment 列表

### conversation → runtime rebuild

- `syncStateFromConversation()` 先清掉旧的 active anchor / launch / completion runtime，再从最新且未被 suppression 的 active segment 重建
- hydration 期间如果仍存在 active segment，会重新 arm authoritative-sync gate；这样 reload 后不会过早把“仍在运行”的后台任务降级成 stale
- `getPendingLaunches()` 与 `getInlineCopy()` 统一复用同一套 pending-matching / markdown copy 规则，避免 view 和 notice queue 各自维护不同的背景任务文案逻辑

## 与 `OpenCodianView` 的边界

- `BackgroundTaskInlinePanelRenderer` 负责 inline panel 的真实 DOM 创建、位置挂载、Markdown 渲染与 mount 复用
- `BackgroundTaskTimelineService` 负责 timeline 数据、runtime 重建、inline copy，以及 completion segment / diagnostics 快照
- `BackgroundTaskIndicatorCoordinator` 负责 indicator render 场景和 post-sync 场景共用的 completion notice queue/flush 顺序
- `BackgroundTaskLiveSignalCoordinator`、`BackgroundConversationPostSyncHandoffCoordinator`、`BackgroundTaskNoticeStateService` 和 `BackgroundTaskCompletionNoticeService` 继续分别负责 live-signal gate、hidden/background post-sync handoff、stale notice state、completion notice queue state
- 这让 P2 `question / todo / background task` lane 继续把 background-task 的核心 runtime ownership 从 `OpenCodianView` 迁到可单测服务，而不是继续把 timeline 逻辑留在主视图里

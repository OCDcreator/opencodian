# BackgroundTaskTimelineService

> **源码**: `src/features/chat/services/BackgroundTaskTimelineService.ts`
> **状态**: [REVIEW]

## 概述

`BackgroundTaskTimelineService` 是 background-task timeline lane 的 runtime facade。它继续向 `OpenCodianView`、inline panel、indicator coordinator 与 live-signal coordinator 暴露稳定入口，但不再直接铺开完整 message timeline assembly 细节。

当前职责集中在：

- indicator reset、active anchor、launch/completion、waiting-for-follow-up 与 stale fingerprint 的 runtime 清理
- search-mode user injection 到 active runtime indicator 的 arm 入口
- conversation→runtime rebuild 时的 authoritative-sync gate 与 stream-like state 回写
- inline segment renderability、suppression 过滤、inline copy / task markdown 组装
- 向调用方保留 `collectSegments()`、`collectDiagnostics()`、`upsertLaunch()` 与 `getPendingLaunches()` 的兼容 facade

它不直接拥有 task launch identity parsing、completion→pending matching 或 persisted message timeline assembly；这些分别下沉到 `BackgroundTaskTimelineLaunchService` 与 `BackgroundTaskTimelineAssemblyService`。

## 公开接口

```typescript
export interface BackgroundTaskTimelineServiceHost extends BackgroundTaskTimelineAssemblyHost {
  getActiveTabId(): TabId | null;
  clearInlinePanel(tabId: TabId | null): void;
  armAuthoritativeSyncGate(tabId: TabId | null): void;
  clearAuthoritativeSyncGate(tabId: TabId | null): void;
  syncTabStreamLikeState(tabId: TabId | null): void;
  isSuppressedBackgroundTaskSegment(...): boolean;
}

export class BackgroundTaskTimelineService {
  resetIndicatorState(...): void;
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

### runtime lifecycle

- `resetIndicatorState()` 统一清空 inline panel、active anchor、launch/completion map、waiting-for-follow-up 与 stale notice fingerprint，并同步 authoritative-sync gate 与 stream-like state。
- `syncStateFromConversation()` 复用同一份 runtime reset，只是不提前清空 inline panel；conversation reload / authoritative sync 的 runtime rebuild 因此与主动 reset 保持一致。
- `syncStateFromConversation()` 只会从存在真实 pending `task` launch 的 segment 重建 live runtime；历史会话里的纯 `search-mode` user injection 不会重新 armed 成“后台任务准备中”。
- hydration 期间如果 conversation 里仍存在 active segment，会重新 arm authoritative-sync gate，避免过早把仍在运行的 background task 降级为 stale。

### timeline facade

- `collectSegments()` 与 `collectDiagnostics()` 委托 `BackgroundTaskTimelineAssemblyService`，保留原 public API 与排序/diagnostics 语义。
- `upsertLaunch()` 与 `getPendingLaunches()` 通过 assembly/launch service 复用同一套 task id、description、completion matching 规则。
- `collectInlineSegments()` 在 assembly 输出之上叠加 stale suppression 与 renderability 过滤，供 `BackgroundTaskInlinePanelRenderer` 直接渲染。

### inline copy

- `shouldRenderInlineSegment()` 继续负责 all-complete / pending launch 的基础判定；零 launch 的 `search-mode` preparing 占位现在还要求 runtime 仍在跟踪该 active anchor，避免旧会话 reload 后把已失活的搜索模式误显示成“后台任务准备中”。
- `getInlineCopy()` 和 `buildTasksMarkdown()` 仍留在 facade 内，保证 inline panel 与 completion queue 使用同一份可读文案。

## 与相邻模块的边界

- `BackgroundTaskTimelineAssemblyService`：负责 persisted messages + runtime state 的 segment assembly、completion event 收集与 diagnostics 快照。
- `BackgroundTaskTimelineLaunchService`：负责 task launch upsert、`bg_*` id 抽取、description fallback、completion matching 与 pending 过滤。
- `BackgroundTaskInlinePanelRenderer`：负责真实 DOM 创建、位置挂载、Markdown 渲染与 mount 复用。
- `BackgroundTaskIndicatorCoordinator`：负责 indicator render 场景和 post-sync 场景共用的 completion notice queue/flush 顺序。
- `BackgroundTaskLiveSignalCoordinator`、`BackgroundTaskNoticeStateService` 与 `BackgroundTaskCompletionNoticeService` 继续分别负责 live-signal stale follow-up、stale notice state 与 completion notice queue state。

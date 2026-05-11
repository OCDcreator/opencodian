# BackgroundTaskTimelineService

> **源码**: `src/features/chat/services/BackgroundTaskTimelineService.ts`
> **状态**: [REVIEW]

## 概述

`BackgroundTaskTimelineService` 是 background-task timeline lane 的 runtime facade。它继续向 `OpenCodianView`、inline panel、indicator coordinator 与 live-signal coordinator 暴露稳定入口，但不再直接铺开完整 message timeline assembly 细节。

当前职责集中在：

- indicator reset、active anchor、launch/completion、waiting-for-follow-up 与 stale fingerprint 的 runtime 清理
- any user message 到 active runtime indicator 的 arm 入口，以及 native task tool lifecycle 的 runtime rebuild/facade 入口；OMO mode tag 只作为 metadata 保留
- conversation→runtime rebuild 时的 authoritative-sync gate 与 stream-like state 回写
- inline segment renderability、suppression 过滤、inline copy / task markdown 组装
- 向调用方保留 `collectSegments()`、`collectDiagnostics()`、`upsertLaunch()`、`upsertCompletionFromToolCall()` 与 `getPendingLaunches()` 的兼容 facade

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
  upsertCompletionFromToolCall(...): void;
  collectSegments(...): BackgroundTaskSegment[];
  collectInlineSegments(...): BackgroundTaskSegment[];
  syncStateFromConversation(...): void;
  getPendingLaunches(...): BackgroundTaskLaunchInfo[];
  shouldRenderInlineSegment(...): boolean;
  getInlineCopy(...): BackgroundTaskInlineCopy;
  collectDiagnostics(...): BackgroundTaskDiagnostics | null;
  getLaunchDisplayId(...): string;
}

export interface BackgroundTaskViewHost {
  resetBackgroundTaskIndicator(tabId?: TabId | null): void;
  syncBackgroundTaskStateFromConversation(conversation: Conversation, tabId?: TabId | null): void;
  renderBackgroundTaskIndicatorIfNeeded(tabId?: TabId | null): Promise<void>;
  armBackgroundTaskIndicatorForUserMessage(message: ChatMessage, tabId: TabId | null): void;
  logOmoBackgroundTaskDiagnostics(...): void;
}

export function createBackgroundTaskViewHost(
  dependencies: {
    timelineService: BackgroundTaskTimelineService;
    indicatorRenderPort: { renderIfNeeded(tabId?: TabId | null): Promise<void> };
  },
): BackgroundTaskViewHost;
```

## 关键行为

### runtime lifecycle

- `resetIndicatorState()` 统一清空 inline panel、active anchor、launch/completion map、waiting-for-follow-up 与 stale notice fingerprint，并同步 authoritative-sync gate 与 stream-like state。
- `syncStateFromConversation()` 复用同一份 runtime reset，只是不提前清空 inline panel；conversation reload / authoritative sync 的 runtime rebuild 因此与主动 reset 保持一致。
- `syncStateFromConversation()` 只会从存在真实 pending `task` launch 的 segment 重建 live runtime；历史会话里的纯 `search-mode` user injection 不会重新 armed 成“后台任务准备中”。
- hydration 期间如果 conversation 里仍存在 active segment，会重新 arm authoritative-sync gate，避免过早把仍在运行的 background task 降级为 stale。
- `syncStateFromConversation()` 会把 message-derived active segment 的轻量生命周期缓存写回 `conversation.backgroundTaskMetadata.activeAnchor`（`startedAt` / `anchorKey` / `modeTag` / `waitingForFollowUp` / `updatedAt`）。该 metadata 只用于 reload/hydration 恢复 active anchor，不保存 task launch、completion、tool output、structured payload 或 `contentBlocks`。
- 当 message timeline 显示没有 active segment、segment 已 all-complete，或 segment 被 suppression 规则压制时，message-derived state 始终优先，并会清理 stale `backgroundTaskMetadata`，避免 metadata 把已结束任务重新撑活。
- hydration/recovery 中如果 message timeline 还无法重建 active segment，且没有 message-derived 终止/抑制证据，service 可以从有效 `backgroundTaskMetadata.activeAnchor` 恢复 runtime 的 `startedAt`、`anchorKey`、`modeTag` 与 `waitingForFollowUp`，并重新 arm authoritative-sync gate；它不会伪造 `backgroundTaskLaunches` 或 `backgroundTaskCompletedTasks`。

### timeline facade

- `collectSegments()` 与 `collectDiagnostics()` 委托 `BackgroundTaskTimelineAssemblyService`，保留原 public API 与排序/diagnostics 语义。
- `logOmoBackgroundTaskDiagnostics()` 现在在 timeline owner 内维护每个 conversation 的 `OmoBackgroundTaskLogState`，负责 pending/completed background-task diagnostics 的去重记录，`OpenCodianView` 只触发这个入口。
- `upsertLaunch()`、`upsertCompletionFromToolCall()` 与 `getPendingLaunches()` 通过 assembly/launch service 复用同一套 native metadata 优先、OMO reminder fallback 的 task id、description、completion matching 规则。
- `collectInlineSegments()` 在 assembly 输出之上叠加 stale suppression 与 renderability 过滤，供 `BackgroundTaskInlinePanelRenderer` 直接渲染。
- Native OpenCode task metadata（`toolMetadata.sessionId`）优先作为 child-session/task identity；task tool tracking 不再 functionally require `search-mode`，`modeTag` 只作为 segment metadata 保留。

### inline copy

- `shouldRenderInlineSegment()` 继续负责 all-complete / pending launch 的基础判定；普通 user anchor 只有在 native task launch 出现后才渲染 inline panel，零 launch 的 OMO-mode preparing 占位仍要求 runtime 跟踪该 active anchor，避免普通聊天消息误显示成“后台任务准备中”。
- `getInlineCopy()` 和 `buildTasksMarkdown()` 仍留在 facade 内，保证 inline panel 与 completion queue 使用同一份可读文案。

## 与相邻模块的边界

- `BackgroundTaskTimelineAssemblyService`：负责 persisted messages + runtime state 的 segment assembly、completion event 收集与 diagnostics 快照。
- `OpenCodianView`：通过 `createBackgroundTaskViewHost()` 工厂一次性装配 background-task host 回调对象，再分发到各 host adapter；不再在 view 内联定义这些回调。`resetIndicatorState`、`armIndicatorForUserMessage`、`syncStateFromConversation`、`logOmoBackgroundTaskDiagnostics` 等入口均由工厂集中路由到本 service 或 `BackgroundTaskIndicatorCoordinator`。
- `BackgroundTaskTimelineLaunchService`：负责 task launch upsert、native `toolMetadata.sessionId` / historical `bg_*` id 抽取、description fallback、completion matching 与 pending 过滤。
- `BackgroundTaskInlinePanelRenderer`：负责真实 DOM 创建、位置挂载、Markdown 渲染与 mount 复用。
- `BackgroundTaskIndicatorCoordinator`：负责 indicator render 场景和 post-sync 场景共用的 completion notice queue/flush 顺序。
- `BackgroundTaskLiveSignalCoordinator`、`BackgroundTaskNoticeStateService` 与 `BackgroundTaskCompletionNoticeService` 继续分别负责 live-signal stale follow-up、stale notice state 与 completion notice queue state。

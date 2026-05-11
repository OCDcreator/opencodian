# BackgroundTaskStreamTriggerCoordinator

> **源码**: `src/features/chat/runtime/BackgroundTaskStreamTriggerCoordinator.ts`
> **状态**: [REVIEW]

## 概述

`BackgroundTaskStreamTriggerCoordinator` 是 background-task lane 的 stream-trigger runtime coordinator。它把 `OpenCodianView` 里原本直接处理的 streaming tool-call start/end 与 primary-stream finalize 入口收束成 dedicated runtime boundary，并复用既有的 `BackgroundTaskIndicatorCoordinator` / `BackgroundTaskTimelineService` / `BackgroundTaskLiveSignalCoordinator` 完成 indicator 刷新、launch runtime 更新，以及 authoritative-sync gate / indicator running 判定。当前它通常直接消费 `QuestionTodoBackgroundTaskRuntimeServiceBundle` 组装好的 stream-trigger host，而不是再让 view 自己拼接 session todo / tab runtime bridge。

## 公开接口

```typescript
export interface BackgroundTaskStreamTriggerCoordinatorHost {
  getActiveTabId(): TabId | null;
  getTabRuntimeState(tabId: TabId | null): BackgroundTaskStreamTriggerRuntime | null;
  applyStreamingTodoSnapshotFromTool(toolCall: ToolCallInfo, tabId: TabId | null): void;
  getSessionIdForTab(tabId: TabId | null): string | null;
  refreshTabSessionTodos(...): Promise<unknown>;
  resetBackgroundTaskIndicator(tabId: TabId | null): void;
}

export class BackgroundTaskStreamTriggerCoordinator {
  handleToolCallStart(...): Promise<void>;
  handleToolCallEnd(...): Promise<void>;
  finalizeAfterPrimaryStream(...): Promise<void>;
}
```

## 关键行为

- `handleToolCallStart()` 先复用 todo snapshot host（通常落到 `SessionTodoCoordinator.applyStreamingTodoSnapshotFromTool()`），再把 native `toolName === 'task'` 作为 background-task 触发器，补齐 `backgroundTaskStartedAt`、authoritative-sync gate、stale fingerprint 清理、launch upsert 与 indicator rerender；tracking 不再 functionally require `search-mode`
- `handleToolCallEnd()` 继续承接 todo tool 的即时 refresh；native `task` 结束会写回 launch result，completed / error 状态会经由 `toolMetadata.sessionId` 优先生成 completion snapshot，然后重新 arm gate 并触发 indicator rerender
- `finalizeAfterPrimaryStream()` 只负责 primary stream 收尾后的 background-task indicator runtime：它会先复用 `BackgroundTaskLiveSignalCoordinator.hasIndicator()` 判断该 tab 是否仍算 background-task running；没有剩余 launch 时 reset indicator；仍有 launch 时切换到 waiting-for-follow-up 并交由 indicator coordinator 重新渲染
- `backgroundTaskModeTag` / segment `modeTag` 只保留 search-mode 等来源 metadata，不再作为 task tool tracking 的 functional gate；OMO `system-reminder` tasks 仍由 timeline service 作为 historical fallback completion source 处理

## 与 `OpenCodianView` 的边界

- `OpenCodianView` 现在只保留 stream controller callback / send pipeline host 的 wiring，不再直接持有 background-task tool-call start/end/finalize 的 runtime orchestration，也不再自己组装 stream-trigger host 或实现 `applyStreamingTodoSnapshotFromTool()`
- `BackgroundTaskIndicatorCoordinator` 继续负责 live-signal reconcile 之后的 inline render、completion notice queue/flush 与 stream-like sync 顺序
- `BackgroundTaskTimelineService` 继续负责 launch upsert、native metadata completion snapshot 与 timeline segment 推导，本 coordinator 只在 streaming trigger 入口复用它
- `BackgroundTaskLiveSignalCoordinator` 继续负责 authoritative-sync gate 与 indicator running 判定，本 coordinator 只在 stream trigger / finalize 入口复用它
- `QuestionTodoBackgroundTaskRuntimeServiceBundle` 负责把 active-tab / session lookup、session todo snapshot/refresh、tab runtime lookup 与 reset indicator writeback 装配成 shared `BackgroundTaskStreamTriggerCoordinatorHost`
- `SessionTodoCoordinator` 继续负责 todowrite snapshot 写回、默认 session 解析与 todo refresh，本 coordinator 只是透过 bundle 提供的 host 复用这些 port
- 这让 P2 `question / todo / background task` lane 继续削弱 `OpenCodianView` 对 background-task stream runtime 的 ownership，而不是回到 paused trailing-assistant helper chain
- 该 coordinator 现在跟踪 OpenCode 原生 `task` stream lifecycle；普通 task/subagent 的最终分组、renderability 与 fallback completion 仍由 timeline service 根据 segment state 统一决定。

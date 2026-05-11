# BackgroundTaskTimelineAssemblyService

> **源码**: `src/features/chat/services/BackgroundTaskTimelineAssemblyService.ts`
> **状态**: [REVIEW]

## 概述

`BackgroundTaskTimelineAssemblyService` 是 background-task timeline 的 message/runtime assembly owner。它从 `BackgroundTaskTimelineService` 中接管 persisted conversation messages、completion reminder 与 active runtime state 的合并细节，让 facade 只保留 runtime lifecycle 与 inline copy 责任。

它负责：

- 按最近 user anchor 聚合带有 lifecycle state 的 native `toolName === 'task'` launch block
- 将 native task terminal state 与 `background-task-completed` / `all-background-tasks-complete` OMO system reminder 应用到匹配 segment
- 当 reminder 缺少明确 task→launch 匹配时，回退到最近仍有 task activity 的 segment
- 合并当前 tab runtime 中尚未持久化的 launch/completion 状态
- finalize pending / waiting-for-follow-up 状态，并按 anchor timestamp 排序
- 为 OMO background-task diagnostics 输出 anchor、pending、completed 与 all-complete 快照

## 公开接口

```typescript
export interface BackgroundTaskTimelineAssemblyHost {
  getTabRuntimeState(tabId: TabId | null): BackgroundTaskTimelineRuntime | null;
  getMessageAnchorKey(message: ChatMessage): string;
}

export class BackgroundTaskTimelineAssemblyService {
  upsertLaunch(...): void;
  getCompletedTaskFromToolCall(...): BackgroundTaskCompletionInfo | null;
  collectSegments(...): BackgroundTaskSegment[];
  collectDiagnostics(...): BackgroundTaskDiagnostics | null;
  getPendingLaunches(...): BackgroundTaskLaunchInfo[];
}
```

## 关键行为

- `collectSegments()` 先按 conversation order 收集 user anchors、tool launches 与 completion reminders，再合并 active runtime state，最后统一 resolve pending state。
- Native `task` tool blocks after any user anchor can create a background-task segment when they carry task lifecycle state; OMO search-mode anchors still provide historical grouping and reminder fallback.
- Native OpenCode task metadata（`toolMetadata.sessionId`）优先作为 child-session/task identity；OMO `system-reminder` tasks 继续作为历史或 OMO-enhanced conversation 的 fallback completion source。
- Task tool tracking no longer requires `search-mode`; `modeTag` is preserved as segment metadata rather than used as the functional gate.
- all-complete reminder 会清空 pending 并关闭 waiting-for-follow-up；普通 completion reminder 只按 task id / description matching 清掉对应 launch。
- runtime merge 不保存或修改 conversation，只把当前 tab 仍活跃但尚未持久化的 launch/completion 并入 segment 视图。
- `collectDiagnostics()` 仍只扫描最后一个 search-mode user anchor 之后的 task/reminder activity，继续保持 OMO diagnostics 的语义边界。

## 与相邻模块的边界

- `BackgroundTaskTimelineService`：保留 public facade、runtime reset/rebuild、inline renderability 与 copy 文案。
- `BackgroundTaskTimelineLaunchService`：提供 launch upsert、description/id 解析与 pending matching，本模块只消费它的纯规则。
- `BackgroundTaskIndicatorCoordinator` 与 `BackgroundTaskInlinePanelRenderer`：继续通过 facade 使用 assembly 输出，不直接依赖本模块。

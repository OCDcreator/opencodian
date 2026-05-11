# BackgroundTaskTimelineLaunchService

> **源码**: `src/features/chat/services/BackgroundTaskTimelineLaunchService.ts`
> **状态**: [REVIEW]

## 概述

`BackgroundTaskTimelineLaunchService` 集中 background-task launch identity 与 pending matching 规则。它是无状态静态服务，服务于 `BackgroundTaskTimelineAssemblyService` 和 `BackgroundTaskTimelineService` 的 public facade。

它负责：

- 从 native OpenCode task metadata（优先 `toolMetadata.sessionId`）以及 structured input / existing launch 中提取 child-session/task identity
- 按 description、prompt、title、summary、query、command 与 result fallback 推导可读 description
- 从 native completed task tool call 或 OMO `system-reminder` tasks 中提取 completed task snapshot
- 根据 task id 优先、description 次之的规则匹配 completion 与 launch
- 返回仍 pending 的 launch 列表

## 公开接口

```typescript
export class BackgroundTaskTimelineLaunchService {
  static upsertLaunch(...): void;
  static getCompletedTaskFromToolCall(...): BackgroundTaskCompletionInfo | null;
  static addCompletedTasksFromMessage(...): void;
  static filterPendingLaunches(...): BackgroundTaskLaunchInfo[];
}
```

## 关键行为

- `upsertLaunch()` 保留已有 description 作为 result fallback，并把无法解析到 child-session/task identity 的 launch 标成 `taskId: null`。
- Native OpenCode task metadata（`toolMetadata.sessionId`）优先作为 child-session/task identity；structured `task_id` / `taskId` / `id` 仍可作为兼容输入，但任意 result string / JSON string 里的 `bg_*` 不再被抓取成 task id。
- `getCompletedTaskFromToolCall()` 只从 native task metadata 生成 completion snapshot，避免把缺少 child session id 的普通结果误判为完成事件。
- `addCompletedTasksFromMessage()` 继续只消费 OMO `system-reminder` 的 tasks，作为历史或 OMO-enhanced conversation 的 fallback completion source；没有 id 和 description 的 task 会被忽略。
- `filterPendingLaunches()` 先用 task id 精确匹配 completion，再回退到 description 的大小写无关匹配，保持历史 pending 语义不变。

## 与相邻模块的边界

- `BackgroundTaskTimelineAssemblyService` 负责 segment assembly，本模块只提供 native metadata / OMO fallback 的 launch、completion 与 pending matching 纯规则。
- `BackgroundTaskTimelineService` 通过 assembly service 复用本模块，不在 facade 内重新实现 pending matching。

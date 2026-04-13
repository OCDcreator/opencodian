# ConversationSyncOrchestrationService

> **源码**: `src/features/chat/services/ConversationSyncOrchestrationService.ts`
> **状态**: [REVIEW]

## 概述

`ConversationSyncOrchestrationService` 把 `OpenCodianView` 里 **已匹配 tab 的 signal sync** 与后台轮询 sync 的 **loop lifecycle、signal debounce timer、tab / conversation 选择、conversation 加载，以及 dispatch 编排** 独立出来，专门负责：

- 判断当前是否还需要维持 2 秒一次的 conversation sync loop，并持有对应 interval 生命周期
- 合并同一 tab 上短时间内连续到达的 signal sync reason，并持有 debounce timer 生命周期
- 判断 signal sync 是应该回到当前可见会话同步，还是转向 hidden tab sync
- 在 hidden tab sync 前根据 tab 元数据加载目标 conversation
- 轮询时只枚举非活动、仍有 background task、且 runtime 允许发起同步的 tab
- 把真正的 per-tab runtime lock / fingerprint baseline 继续委托给 `ConversationSyncRuntimeCoordinator`

它不负责 OpenCodeService session sync listener 的生命周期，也不负责 session→tab 匹配；这些入口装配现在交给 `ConversationSessionSignalRuntime`。它同样不负责具体的服务端拉取，也不负责 post-sync question/todo/background-task 收尾；这些能力现在分别留在 `ConversationSyncBridge`、`ConversationSyncVisiblePostSyncRouter` 与 `ConversationSyncBackgroundPostSyncRouter`。view-state host 的装配也不再由 `OpenCodianView` 分散维护，而是交给 `ConversationSyncHostAdapter`。

## 公开接口

```typescript
export interface ConversationSyncOrchestrationHost {
  getCurrentConversation(): Conversation | null;
  getActiveTabId(): TabId | null;
  getAllTabs(): readonly TabData[];
  getTab(tabId: TabId): TabData | null;
  getTabRuntimeState(tabId: TabId | null): ConversationSyncRuntime | null;
  getConversationById(id: string): Promise<Conversation | null>;
}

export class ConversationSyncOrchestrationService {
  startConversationSyncLoop(...): void;
  stopConversationSyncLoop(): void;
  clearScheduledSignalConversationSync(...): void;
  scheduleConversationSyncFromSignal(...): void;
  syncConversationFromSignal(...): Promise<void>;
  syncBackgroundTaskTabs(...): Promise<void>;
}
```

## 关键行为

### signal sync dispatch

- 同一个 tab 的 signal sync 会先经过 120ms debounce；窗口内到达的 reason 会先排序再合并成 `message.updated+session.diff` 这一类 merged reason
- tab 被切换、清理或 hydration 开始时，service 会负责清掉未触发的 signal debounce timer
- 如果 signal 指向当前 active tab，且当前 conversation 已有 `openCodeSessionId`，就直接回调 visible sync 路径
- 否则会读取 tab 元数据，按 `conversationId` 加载目标 conversation，再进入 hidden-tab sync 回调
- signal sync 回调里会附带 `reason`、`activeTabId` 和 `tabHasBackgroundTask`，让 post-sync attention / stale-state 编排继续复用原语义

### background polling dispatch

- service 现在也负责持有 conversation sync loop interval，只在当前 visible conversation 或 background-task tab 至少一方需要同步时才启动轮询
- 只会枚举：
  - 非当前活动 conversation 的 tab
  - 仍标记 `hasBackgroundTask` 的 tab
  - runtime 不在 streaming 且没有 sync in-flight 的 tab
- 满足条件后才加载 conversation，避免为明显不可同步的 tab 做额外存储读取

## 与相邻模块的边界

- `ConversationSyncBridge` 现在承接 orchestration dispatch 后的 server sync / post-sync callback 装配
- `ConversationSessionSignalRuntime` 负责把 OpenCodeService 的 session sync signal 订阅、session→tab 匹配与 cleanup 统一桥接到 orchestration
- `ConversationSyncHostAdapter` 负责把 `OpenCodianView` 的单一 sync host 映射成 orchestration host
- `ConversationSyncOrchestrationService` 负责 “是否继续跑 sync loop、signal 是否需要 debounce、该同步哪个 tab / conversation、按哪条入口 dispatch”
- `ConversationSyncRuntimeCoordinator` 继续负责 “这个 tab 现在能不能同步、进入后怎么持有 runtime lock、baseline fingerprint 怎么取”
- `OpenCodianView` 只保留真正依赖当前 DOM/render host 的 render 入口
- 这次切片继续推进 master plan 的 P1 sync orchestration lane，让 `OpenCodianView` 再少持有一层 sync signal lifecycle ownership，而不是继续在已有 helper 链里做更窄的碎片化抽离

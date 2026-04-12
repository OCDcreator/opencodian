# ConversationSyncOrchestrationService

> **源码**: `src/features/chat/services/ConversationSyncOrchestrationService.ts`
> **状态**: [REVIEW]

## 概述

`ConversationSyncOrchestrationService` 把 `OpenCodianView` 里 signal sync 与后台轮询 sync 的 **tab / conversation 选择、conversation 加载，以及 dispatch 编排** 独立出来，专门负责：

- 判断 signal sync 是应该回到当前可见会话同步，还是转向 hidden tab sync
- 在 hidden tab sync 前根据 tab 元数据加载目标 conversation
- 轮询时只枚举非活动、仍有 background task、且 runtime 允许发起同步的 tab
- 把真正的 per-tab runtime lock / fingerprint baseline 继续委托给 `ConversationSyncRuntimeCoordinator`

它不负责具体的服务端拉取、post-sync question/todo/background-task 收尾，也不负责 signal debounce timer；这些能力仍分别留在 `OpenCodianView` 与 `BackgroundTaskPostSyncCoordinator`。

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
  syncConversationFromSignal(...): Promise<void>;
  syncBackgroundTaskTabs(...): Promise<void>;
}
```

## 关键行为

### signal sync dispatch

- 如果 signal 指向当前 active tab，且当前 conversation 已有 `openCodeSessionId`，就直接回调 visible sync 路径
- 否则会读取 tab 元数据，按 `conversationId` 加载目标 conversation，再进入 hidden-tab sync 回调
- signal sync 回调里会附带 `reason`、`activeTabId` 和 `tabHasBackgroundTask`，让 post-sync attention / stale-state 编排继续复用原语义

### background polling dispatch

- 只会枚举：
  - 非当前活动 conversation 的 tab
  - 仍标记 `hasBackgroundTask` 的 tab
  - runtime 不在 streaming 且没有 sync in-flight 的 tab
- 满足条件后才加载 conversation，避免为明显不可同步的 tab 做额外存储读取

## 与相邻模块的边界

- `OpenCodianView` 现在只保留 signal timer 调度、实际服务端同步调用，以及 post-sync host bridge
- `ConversationSyncOrchestrationService` 负责 “该同步哪个 tab / conversation、按哪条入口 dispatch”
- `ConversationSyncRuntimeCoordinator` 继续负责 “这个 tab 现在能不能同步、进入后怎么持有 runtime lock、baseline fingerprint 怎么取”
- 这次切片继续推进 master plan 的 P1 sync orchestration lane，让 `OpenCodianView` 少持有一层 tab/conversation 选择责任，而不是继续在已有 helper 链里做更窄的碎片化抽离

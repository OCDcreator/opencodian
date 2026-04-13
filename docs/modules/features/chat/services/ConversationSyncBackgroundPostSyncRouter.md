# ConversationSyncBackgroundPostSyncRouter

> **源码**: `src/features/chat/services/ConversationSyncBackgroundPostSyncRouter.ts`
> **状态**: [REVIEW]

## 概述

`ConversationSyncBackgroundPostSyncRouter` 把 `ConversationSyncBridge` 里 signal/background-tab sync 完成后的 **post-sync option shaping、hidden-tab fingerprint writeback 与 coordinator 路由** 收敛到一个独立模块，专门负责：

- 把 `SignalConversationSyncContext` 组装成 `BackgroundTaskPostSyncCoordinator.handleSignalSyncComplete()` 需要的参数
- 在 signal sync 成功后，统一提交 hidden/background tab 的 `lastConversationSyncFingerprint`
- 把 background-tab polling context 组装成 `handleBackgroundTabSyncComplete()` 所需参数

它不负责发起 server sync，也不负责 visible conversation 的 DOM patch / indicator fallback；这些职责仍留在 `ConversationSyncBridge`。

## 公开接口

```typescript
export interface ConversationSyncBackgroundPostSyncRouterHost {
  getTabRuntimeState(tabId: TabId | null): {
    lastConversationSyncFingerprint: string | null;
  } | null;
}

export class ConversationSyncBackgroundPostSyncRouter {
  routeSignalSyncComplete(...): Promise<void>;
  routeBackgroundTabSyncComplete(...): Promise<void>;
}
```

## 关键行为

### signal sync routing

- 读取目标 tab runtime，并在 sync 成功后写回最新 fingerprint
- 保留 orchestration/runtime 已经确定好的 `reason`、`activeTabId`、`tabHasBackgroundTask` 与 `previousFingerprint`
- 再统一转发给 `BackgroundTaskPostSyncCoordinator`

### background-tab polling routing

- 不触碰 runtime fingerprint
- 只负责把 polling sync context 与 `syncResult` 合并成 post-sync coordinator 可消费的参数

## 与相邻模块的边界

- `ConversationSyncBridge`：负责发起 sync、绑定 server-sync reason，并把 background/signal post-sync 委托给 router
- `BackgroundTaskPostSyncCoordinator`：负责 question/todo/background-task 的 post-sync 收尾
- `ConversationSyncRuntimeCoordinator` / `ConversationSyncOrchestrationService`：继续负责 sync guard、tab 选择与 signal dispatch

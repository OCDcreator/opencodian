# ConversationSyncVisiblePostSyncRouter

> **源码**: `src/features/chat/services/ConversationSyncVisiblePostSyncRouter.ts`
> **状态**: [REVIEW]

## 概述

`ConversationSyncVisiblePostSyncRouter` 把 `ConversationSyncBridge` 里 visible sync 完成后的 **post-sync request shaping 与 outcome dispatch** 收敛到一个独立模块，专门负责：

- 把 active-tab visible sync context 组装成 `BackgroundTaskPostSyncCoordinator.handleVisibleConversationSyncComplete()` 需要的参数
- 统一承接 `shouldApplySyncedConversationUpdate` 与 `shouldRenderBackgroundTaskIndicator` 两类 post-sync outcome
- 只在 coordinator 明确允许时才回落到 host 的 DOM patch / indicator render 入口

它不负责发起 server sync，也不负责 active-tab sync guard；这些职责仍分别留在 `ConversationSyncBridge` 与 `ConversationSyncRuntimeCoordinator`。

## 公开接口

```typescript
export interface ConversationSyncVisiblePostSyncRouterHost {
  applySyncedConversationUpdate(...): Promise<void>;
  renderBackgroundTaskIndicatorIfNeeded(...): Promise<void>;
}

export class ConversationSyncVisiblePostSyncRouter {
  routeVisibleSyncComplete(...): Promise<void>;
}
```

## 关键行为

### visible post-sync routing

- 保留 runtime/orchestration 已经确定好的 `tabId` 与 visible conversation
- 统一补齐 `expectedConversationId`、`questionSessionId` 与 `syncResult`
- 如果 post-sync outcome 允许 DOM patch，则调用 `applySyncedConversationUpdate()`
- 否则只在需要时调用 `renderBackgroundTaskIndicatorIfNeeded()`

## 与相邻模块的边界

- `ConversationSyncBridge`：负责发起 visible sync，并把 sync 完成后的 post-sync 路由委托给 router
- `BackgroundTaskPostSyncCoordinator`：负责 question/todo/background-task 相关的 visible post-sync 决策
- `ConversationSyncHostAdapter`：负责把 view 的 render callback 装配成 router 可消费的 host
- `OpenCodianView`：只继续提供真正依赖 DOM 的 render host，不再内联 visible post-sync outcome dispatch

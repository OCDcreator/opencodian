# TabRuntimeStateBridge

> **源码**: `src/features/chat/runtime/TabRuntimeStateBridge.ts`
> **状态**: [REVIEW]

## 概述

`TabRuntimeStateBridge` 把 `OpenCodianView` 里剩余的 tab stream-like badge / background-task badge / 用户消息 rewind-fork 按钮禁用态同步，和 attention 标记写回，收束成一个 dedicated runtime bridge。

它不推导 session status、background-task live predicate 或 question/todo attention 规则；这些判断仍分别留在 `BackgroundTaskLiveSignalCoordinator`、`BackgroundConversationAttentionCoordinator`、`QuestionDockCoordinator` 与发送/收尾链路。本模块只负责把已经算好的 runtime state 写回 `TabManager` 与消息区 DOM。

## 公开接口

```typescript
export interface TabRuntimeStateBridgeHost {
  getTabManager(): TabRuntimeStateBridgeTabManager | null;
  getActiveTabId(): TabId | null;
  getTabRuntimeState(tabId: TabId | null): { isStreaming: boolean } | null;
  getTabMessagesContainer(tabId: TabId | null): ParentNode | null;
  hasBackgroundTaskIndicator(tabId: TabId | null): boolean;
  updateSendButtonState(): void;
}

export class TabRuntimeStateBridge {
  syncStreamLikeState(tabId: TabId | null): void;
  syncActiveStreamLikeState(): void;
  setNeedsAttention(tabId: TabId | null, needsAttention: boolean): void;
}
```

## 关键行为

- `syncStreamLikeState()` 会统一刷新 `TabManager.setTabStreaming()`、`setTabBackgroundTaskRunning()`，并把当前 tab 消息区里的 rewind / fork 按钮禁用态同步到最新 streaming 状态
- 当目标 tab 正好是 active tab，bridge 还会负责触发 `updateSendButtonState()`；当 `tabId` 为空时，只刷新发送按钮，不再让 view 自己散落地处理空-tab 分支
- `setNeedsAttention()` 把 null guard 与 `TabManager.setTabNeedsAttention()` 写回集中到一个入口，供 question/background-task/message-finalization 链路共用

## 与 `OpenCodianView` 的边界

- `OpenCodianView` 只保留 wrapper 方法与 host 装配，不再直接持有 tab badge / user-action button 的具体同步逻辑
- `BackgroundTaskLiveSignalCoordinator` 继续负责回答“这个 tab 是否仍算 background-task running”
- `userMessageActions.ts` 继续只负责底层 DOM helper；它的上游消费者现在是 `TabRuntimeStateBridge`
- 这条边界推进的是 master plan 的 P1 `会话级 runtime 状态桥接`，而不是继续深挖已暂停的 trailing-assistant helper 链

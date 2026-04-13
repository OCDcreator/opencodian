# BackgroundConversationPostSyncHandoffCoordinator

> **源码**: `src/features/chat/services/BackgroundConversationPostSyncHandoffCoordinator.ts`
> **状态**: [REVIEW]

## 概述

`BackgroundConversationPostSyncHandoffCoordinator` 把 signal sync 与 background-tab sync 之间剩余的 source-specific post-sync routing 从 `BackgroundTaskPostSyncCoordinator` 里抽离出来，专门负责：

- 统一承接 hidden/background conversation sync 完成后的 handoff 入口
- 在 signal sync 路径上按固定顺序串联 `BackgroundConversationSignalSyncStateCoordinator` → `BackgroundConversationPostSyncRefreshExecutor` → `BackgroundConversationAttentionCoordinator`
- 在 background-tab sync 路径上把 background refresh 与 attention writeback 组合成单一 seam

它不负责 visible current-conversation post-sync 收尾，也不负责 question/todo refresh 细节、background-task timeline 推导或 DOM writeback；这些继续分别留在 `BackgroundTaskPostSyncCoordinator`、`BackgroundConversationPostSyncRefreshExecutor` 与 `BackgroundTaskIndicatorCoordinator` 一侧。

## 公开接口

```typescript
export class BackgroundConversationPostSyncHandoffCoordinator {
  constructor(...);
  handleSignalSyncComplete(...): Promise<void>;
  handleBackgroundTabSyncComplete(...): Promise<void>;
}
```

## 关键行为

### signal sync handoff

- `handleSignalSyncComplete()` 先把 authoritative-sync ready 标记委托给 `BackgroundConversationSignalSyncStateCoordinator`
- 接着调用 `BackgroundConversationPostSyncRefreshExecutor.refreshSignalSyncedBackgroundConversation()`，让 pending question / todo status refresh、background task rebuild 与 completion follow-up 保持既有顺序
- 最后把 fingerprint/attention 判定委托给 `BackgroundConversationAttentionCoordinator.commitSignalSyncAttention()`

### background-tab handoff

- `handleBackgroundTabSyncComplete()` 面向已有后台 tab 的 sync 结果，委托 `BackgroundConversationPostSyncRefreshExecutor.refreshBackgroundTabConversation()`
- refresh 完成后再调用 `BackgroundConversationAttentionCoordinator.commitBackgroundTabSyncAttention()`，保持 background attention writeback 仍晚于 refresh/build/flush

## 与 `BackgroundTaskPostSyncCoordinator` 的边界

- `BackgroundTaskPostSyncCoordinator` 现在只保留 visible-conversation post-sync refresh 与 visible state-commit 协调，并把 hidden/background source routing 委托给本 coordinator
- `BackgroundConversationSignalSyncStateCoordinator` 继续拥有 signal-specific authoritative-sync state policy
- `BackgroundConversationPostSyncRefreshExecutor` 继续拥有 signal/background-tab question/todo refresh 与 background-task writeback 执行顺序
- `BackgroundConversationAttentionCoordinator` 继续拥有 signal/background-tab fingerprint 对比与 tab attention policy

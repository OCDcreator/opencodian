# BackgroundConversationPostSyncHandoffCoordinator

> **源码**: `src/features/chat/services/BackgroundConversationPostSyncHandoffCoordinator.ts`
> **状态**: [REVIEW]

## 概述

`BackgroundConversationPostSyncHandoffCoordinator` 把 signal sync 与 background-tab sync 之间剩余的 source-specific post-sync routing 收口到 dedicated handoff seam，专门负责：

- 统一承接 hidden/background conversation sync 完成后的 handoff 入口
- 在 signal sync 路径上按固定顺序串联 authoritative-sync mark → `BackgroundConversationPostSyncRefreshExecutor` → tab attention 判定
- 在 background-tab sync 路径上把 background refresh 与 attention writeback 组合成单一 seam

它不负责 visible current-conversation post-sync 收尾，也不负责 question/todo refresh 细节、background-task timeline 推导或 DOM writeback；这些继续分别留在 `VisibleConversationPostSyncCoordinator`、`BackgroundConversationPostSyncRefreshExecutor` 与 `BackgroundTaskIndicatorCoordinator` 一侧。

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

- `handleSignalSyncComplete()` 先写入 background-task authoritative-sync ready 标记，reason 统一加上 `sync-event:` 前缀
- 接着调用 `BackgroundConversationPostSyncRefreshExecutor.refreshSignalSyncedBackgroundConversation()`，让 pending question / todo status refresh、background task rebuild 与 completion follow-up 保持既有顺序
- 最后按 `changed || fingerprint !== previousFingerprint` 判定是否写入 tab attention；signal sync 对 active tab 写入 `false`，对非 active tab 写入 `true`

### background-tab handoff

- `handleBackgroundTabSyncComplete()` 面向已有后台 tab 的 sync 结果，委托 `BackgroundConversationPostSyncRefreshExecutor.refreshBackgroundTabConversation()`
- refresh 完成后再按同一 fingerprint/change 判定写入 attention；background-tab sync 一旦变化固定写入 `true`，保持 attention writeback 仍晚于 refresh/build/flush

## 与 post-sync router 的边界

- `ConversationSyncBackgroundPostSyncRouter` 现在直接调用本 coordinator，hidden/background pass-through layer 不再单独存在
- `BackgroundConversationPostSyncHandoffHostAdapter` 现在以同一个 shared handoff view host 同时承接 refresh executor 与本 coordinator 的 writeback 需求；本模块拥有 signal/background-tab 的 handoff 调度顺序、authoritative mark 与 attention policy
- `VisibleConversationPostSyncCoordinator` 继续拥有 visible-conversation post-sync refresh 与 visible state-commit 协调
- `BackgroundConversationPostSyncRefreshExecutor` 继续拥有 signal/background-tab question/todo refresh 与 background-task writeback 执行顺序

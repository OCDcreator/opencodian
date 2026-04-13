# BackgroundConversationSignalSyncStateCoordinator

> **源码**: `src/features/chat/services/BackgroundConversationSignalSyncStateCoordinator.ts`
> **状态**: [REVIEW]

## 概述

`BackgroundConversationSignalSyncStateCoordinator` 把 signal sync 完成后的 background-task authoritative-sync ready 标记从 hidden/background post-sync handoff 中抽出，专门负责：

- 将 OpenCode sync event reason 规范化为 background-task live signal 使用的 `sync-event:*` reason
- 把 signal-synced tab 的 authoritative-sync ready 写回委托给 host
- 让 post-sync coordinator 不再直接持有 signal state writeback 规则

它不负责 question/todo refresh、background-task rebuild、completion notice flush，也不负责 tab attention 判定；这些职责仍分别由 `BackgroundConversationPostSyncRefreshExecutor` 与 `BackgroundConversationAttentionCoordinator` 承接。

## 公开接口

```typescript
export interface BackgroundConversationSignalSyncStateCoordinatorHost {
  markBackgroundTaskAuthoritativeSync(tabId: TabId | null, reason: string): void;
}

export class BackgroundConversationSignalSyncStateCoordinator {
  commitSignalSyncState(options: SignalConversationSyncStateOptions): void;
}
```

## 关键行为

- `commitSignalSyncState()` 接收 signal sync 的原始 reason，并统一写回为 `sync-event:${reason}`
- authoritative-sync 标记仍通过 host 间接桥接到 `BackgroundTaskLiveSignalCoordinator.markAuthoritativeSync()`
- 本模块不判断 fingerprint 或 active tab；这些 background attention policy 保持在 `BackgroundConversationAttentionCoordinator`

## 与 `OpenCodianView` 的边界

- `OpenCodianView` 不直接依赖本模块；host wiring 由 `QuestionTodoBackgroundTaskRefreshHostAdapter` 统一装配
- `BackgroundConversationPostSyncHandoffCoordinator` 只调用 `commitSignalSyncState()`，不再直接格式化 signal reason 或写回 authoritative-sync mark
- 这条边界继续推进 master plan 的 P2 `question / todo / background task` lane：把 signal post-sync state writeback 拆成独立、可单测的单一职责模块

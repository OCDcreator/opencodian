# BackgroundConversationAttentionCoordinator

> **源码**: `src/features/chat/services/BackgroundConversationAttentionCoordinator.ts`
> **状态**: [REVIEW]

## 概述

`BackgroundConversationAttentionCoordinator` 把 signal/background-tab post-sync 路径里的 fingerprint 对比与 tab attention 判定从 `BackgroundTaskPostSyncCoordinator` 中抽出，专门负责：

- 根据 sync result 与上一轮 fingerprint 判断 background conversation 是否真的发生变化
- 在 signal sync 结束后，按 active-tab 关系决定是否把目标 tab 标记为需要关注
- 在 background-tab sync 结束后，统一把有变化的后台 tab 标记为需要关注

它不负责 question/todo refresh、background-task rebuild、completion notice flush，也不负责 authoritative-sync ready 标记；这些职责仍分别留在 `BackgroundConversationPostSyncRefreshExecutor` 与 `BackgroundConversationSignalSyncStateCoordinator`。

## 公开接口

```typescript
export interface BackgroundConversationAttentionCoordinatorHost {
  setTabNeedsAttention(tabId: TabId | null, needsAttention: boolean): void;
}

export class BackgroundConversationAttentionCoordinator {
  commitSignalSyncAttention(options: SignalConversationAttentionOptions): void;
  commitBackgroundTabSyncAttention(options: BackgroundTabConversationAttentionOptions): void;
}
```

## 关键行为

- `commitSignalSyncAttention()` 只有在 `changed === true` 或 fingerprint 相比 `previousFingerprint` 变化时才写回 attention
- signal sync 的 attention 写回会复用原有语义：当前 active tab 写回 `false`，hidden/background tab 写回 `true`
- `commitBackgroundTabSyncAttention()` 固定把有变化的后台 tab 标为需要关注，保持 background-tab sync 的旧语义
- fingerprint 比对规则现在集中在本模块，避免 `BackgroundTaskPostSyncCoordinator` 再同时持有 refresh routing 和 attention outcome policy

## 与 `OpenCodianView` 的边界

- `OpenCodianView` 不直接依赖本模块；attention writeback 通过 `QuestionTodoBackgroundTaskRefreshHostAdapter` 间接桥接到 `TabRuntimeStateBridge`
- `BackgroundTaskPostSyncCoordinator` 现在只保留 visible/background refresh orchestration；signal authoritative mark 与 background attention outcome 分别委托给 `BackgroundConversationSignalSyncStateCoordinator` 与本模块
- 这条边界继续推进 master plan 的 P2 `question / todo / background task` lane：把 background sync 的后置状态判定拆成独立、可单测的单一职责模块

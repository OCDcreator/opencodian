# VisibleConversationPostSyncStateHostAdapter

> **源码**: `src/features/chat/services/VisibleConversationPostSyncStateHostAdapter.ts`
> **状态**: [REVIEW]

## 概述

`VisibleConversationPostSyncStateHostAdapter` 把 visible conversation post-sync state commit 需要的 host 装配从通用的 question/todo/background refresh adapter 中拆出，专门负责：

- 从共享的 question/todo/background-task view host 派生 `VisibleConversationPostSyncStateCoordinator` 所需的 current-conversation id、revert-state 写回与 fingerprint 写回回调
- 在不引入新业务规则的前提下，把 visible post-sync state writeback 装配收敛为独立 single-purpose module
- 让 `QuestionTodoBackgroundTaskRefreshHostAdapter` 只保留 question/todo refresh、activation refresh bridge、background handoff 相关的 host 组装

它不负责 visible question/todo refresh 顺序，也不负责 background handoff、authoritative sync state 或 tab attention；这些仍分别留给 `PostSyncQuestionTodoRefreshFacade`、`VisibleConversationPostSyncCoordinator` 与 background-task 相关 coordinator。

## 公开接口

```typescript
export interface VisibleConversationPostSyncStateViewHost {
  getCurrentConversation(): Conversation | null;
  setCurrentConversationRevertState(revertState: ConversationRevertStateSnapshot | null): void;
  setTabConversationSyncFingerprint(tabId: TabId, fingerprint: string): void;
}

export function createVisibleConversationPostSyncStateHosts(...): VisibleConversationPostSyncStateHosts;
export function createVisibleConversationPostSyncStateServices(...): VisibleConversationPostSyncStateServices;
```

## 关键行为

- `createVisibleConversationPostSyncStateHosts()` 只把共享 view host 缩成 `VisibleConversationPostSyncStateCoordinatorHost` 需要的三条回调，不再夹带 question/todo refresh 或 background-task writeback 依赖
- `createVisibleConversationPostSyncStateServices()` 只实例化 `VisibleConversationPostSyncStateCoordinator`，让 visible writeback 装配与 refresh/handoff 装配分离

## 与 `OpenCodianView` 的边界

- `OpenCodianView` 继续提供共享的 question/todo/background-task view host，但 visible current-conversation writeback 现在先交给本模块装配，再注入 `QuestionTodoBackgroundTaskRefreshHostAdapter`
- 这次切片继续推进 master plan 的 P2 `question / todo / background task` lane，减少 generic refresh adapter 对 visible state writeback 的 ownership

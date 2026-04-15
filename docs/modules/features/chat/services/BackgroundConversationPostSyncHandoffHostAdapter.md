# BackgroundConversationPostSyncHandoffHostAdapter

> **源码**: `src/features/chat/services/BackgroundConversationPostSyncHandoffHostAdapter.ts`
> **状态**: [REVIEW]

## 概述

`BackgroundConversationPostSyncHandoffHostAdapter` 把 background-task post-sync handoff 所需的 host assembly 从 `QuestionTodoBackgroundTaskRefreshHostAdapter` 中拆出，专门负责：

- 从 `QuestionTodoBackgroundTaskRuntimeServiceBundle` 组装的窄 `syncBackgroundTaskStateFromConversation()` seam 与 late-bound background indicator / live-signal / tab-runtime bridge ports 组合出 dedicated background handoff view host
- 让同一个 dedicated background handoff view host 直接满足 `BackgroundConversationPostSyncRefreshExecutor`、`BackgroundConversationSignalSyncStateCoordinator` 与 `BackgroundConversationAttentionCoordinator` 需要的 writeback surface
- 统一装配 `BackgroundConversationPostSyncHandoffCoordinator`，让 signal/background-tab post-sync handoff 的 host wiring 收口在单一 shared-host seam 里

它不负责 visible conversation post-sync refresh，也不负责 activation refresh 或 question/todo runtime gate；这些继续分别留在 `QuestionTodoBackgroundTaskRefreshHostAdapter`、`VisibleConversationPostSyncStateHostAdapter` 与 `PostSyncQuestionTodoRefreshHostAdapter` 一侧。

## 公开接口

```typescript
export interface BackgroundConversationPostSyncHandoffViewHostAdapterHost {
  syncBackgroundTaskStateFromConversation(...): void;
}

export function createBackgroundConversationPostSyncHandoffViewHostAdapter(...):
  BackgroundConversationPostSyncHandoffViewHost;

export function createBackgroundConversationPostSyncHandoffServices(...):
  BackgroundConversationPostSyncHandoffServices;
```

## 关键行为

### dedicated background host assembly

- `createBackgroundConversationPostSyncHandoffViewHostAdapter()` 只暴露 background handoff 自己需要的四个 writeback seam：background task state rebuild、completion notice flush、authoritative-sync mark 与 tab attention writeback
- late-bound getters 让 runtime factory 仍能在构造期提前建立 handoff bundle，同时安全引用稍后初始化的 `BackgroundTaskIndicatorCoordinator`、`BackgroundTaskLiveSignalCoordinator` 与 `TabRuntimeStateBridge`

### handoff coordinator wiring

- `createBackgroundConversationPostSyncHandoffServices()` 复用外部传入的 `PostSyncQuestionTodoRefreshPlanBuilder` 与 `QuestionTodoStatusRefreshCoordinator`，并把 shared handoff view host 直接交给 refresh executor、signal-state coordinator 与 attention coordinator
- signal/background-tab follow-up 不再先拆成额外的 per-owner host object；shared handoff view host 直接成为 post-sync refresh、authoritative mark 与 tab attention 的统一 writeback seam

## 与 `QuestionTodoBackgroundTaskRefreshHostAdapter` 的边界

- `QuestionTodoBackgroundTaskRefreshHostAdapter` 现在只保留 question/todo refresh host、activation refresh bridge 与 visible post-sync coordinator 装配
- 本模块独立拥有 signal/background-tab follow-up 所需的 host pass-through，不再要求 refresh-side adapter 继续暴露 background-only writeback surface
- 这次切片继续推进 master plan 的 P2 `question / todo / background task` lane：把 background handoff 的 late-bound writeback seam 从 shared refresh adapter 中迁走，让 `OpenCodianView` 更接近 host assembly 入口而不是 mixed post-sync wiring owner

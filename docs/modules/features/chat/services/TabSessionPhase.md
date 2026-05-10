# TabSessionPhase

> **源码**: `src/features/chat/services/TabSessionPhase.ts`
> **状态**: [REVIEW]
> **最近更新**: Compatibility wrapper over writable tab session lifecycle

## 概述

`TabSessionPhase` 现在是 `TabSessionLifecycleState` 的兼容 wrapper 与 UI phase helper。可写 per-tab lifecycle state machine 已迁移到 `TabSessionLifecycleState.ts`；本模块保留旧 public import surface，并把 lifecycle state、context compaction overlay、server busy/retry overlay 与 legacy runtime flags 归一成 UI 可消费的 phase。

它仍不保存、不 set/mutate，也不直接读取 runtime。写入入口在 `ConversationTabRuntimeCoordinator`，本模块只负责派生与 re-export。

## 公开接口

```typescript
export type {
  TabSessionLifecycleSignals,
  TabSessionLifecycleState,
  TabSessionPhase,
  WritableTabSessionPhase,
};

export {
  createInitialTabSessionLifecycleState,
  deriveTabSessionPhaseFromLifecycle,
  isForegroundBusyTabSessionPhase,
  transitionTabSessionLifecycle,
};

export interface TabSessionPhaseSignals {
  readonly lifecycle?: TabSessionLifecycleState;
  readonly isStreaming?: boolean;
  readonly isSameSessionStreamingInAnotherTab?: boolean;
  readonly isConversationSyncInFlight?: boolean;
  readonly isContextCompacting?: boolean;
  readonly sessionStatus?: SessionActivityStatus | null;
}

export function deriveTabSessionPhase(
  signals: TabSessionPhaseSignals,
): TabSessionPhase;

export function isForegroundBusyTabSessionPhase(
  phase: TabSessionPhase,
): boolean;
```

## 关键行为

- phase 优先级来自 `deriveTabSessionPhaseFromLifecycle()`：本地 lifecycle foreground-busy phase 优先，然后才是 same-session streaming、context compaction、server retry、server busy 与 idle/error/cancelled。
- `preparing`、`streaming`、`finalizing`、`syncing` 都是 writable lifecycle phase，并且都属于 foreground busy，避免发送、finalization 与 authoritative sync 写入互相穿插。
- `compacting`、`server-busy` 与 `server-retrying` 仍作为 UI overlay phase，由 context usage 与 server `sessionStatus` 信号派生。
- `isStreaming` 与 `isConversationSyncInFlight` 仍作为 legacy compatibility input：当调用方尚未提供已推进过的 lifecycle state 时，它们会映射到 `streaming` / `syncing` fallback。
- 同 session 其他 tab streaming 继续复用 `streaming` phase，让 foreground send gating 阻止同一 OpenCode session 被重复 active stream 覆盖。

## 边界

- 本模块不读取 tab manager、runtime state、context usage 或 session status；调用方必须先收集信号。
- 本模块不拥有 follow-up queue、sync-event batching、background-task metadata persistence 或 UI/render 状态。
- 如果新增 writable phase，必须同步 `TabSessionLifecycleState` reducer、`ConversationTabRuntimeCoordinator` transition owner、消费测试与本文件的优先级说明。

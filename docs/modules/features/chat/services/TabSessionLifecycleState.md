# TabSessionLifecycleState

> **源码**: `src/features/chat/services/TabSessionLifecycleState.ts`
> **状态**: [REVIEW]
> **最近更新**: Writable per-tab lifecycle state machine

## 概述

`TabSessionLifecycleState` 是 tab/session lifecycle 的可写状态机 owner。它把每个 tab 的本地主动运行阶段记录成一个小型、可测试的 state：`phase`、`sequence`、`reason` 与 `changedAt`。

它不读取 DOM、Obsidian API、tab manager 或 conversation storage，也不直接保存消息。调用方负责在进入发送、流式、finalization 与 authoritative sync 等边界时提交 transition。

## 公开接口

```typescript
export type WritableTabSessionPhase =
  | 'idle'
  | 'preparing'
  | 'streaming'
  | 'finalizing'
  | 'syncing'
  | 'cancelled'
  | 'error';

export type TabSessionPhase =
  | WritableTabSessionPhase
  | 'compacting'
  | 'server-busy'
  | 'server-retrying';

export interface TabSessionLifecycleState {
  readonly phase: WritableTabSessionPhase;
  readonly sequence: number;
  readonly reason: string | null;
  readonly changedAt: number;
}

export function createInitialTabSessionLifecycleState(now = 0): TabSessionLifecycleState;
export function transitionTabSessionLifecycle(...): TabSessionLifecycleState;
export function deriveTabSessionPhaseFromLifecycle(...): TabSessionPhase;
export function isForegroundBusyTabSessionPhase(phase: TabSessionPhase): boolean;
```

## 关键行为

- 初始 state 为 `idle`、`sequence: 0`、`reason: null`、`changedAt` 使用传入时间，便于测试稳定断言。
- 每次接受新的 `phase`/`reason` transition 都会递增 `sequence`，并刷新 `changedAt`。
- 相同 `phase` 与 `reason` 的重复 transition 会返回原 state，避免无意义的 sequence churn。
- foreground-busy 本地阶段包括 `preparing`、`streaming`、`finalizing` 与 `syncing`；这些阶段优先于 context/server overlay。
- `compacting`、`server-busy` 与 `server-retrying` 是派生 overlay phase，不写入 `TabSessionLifecycleState.phase`。

## 与 `ConversationTabRuntimeCoordinator` 的边界

- `ConversationTabRuntimeCoordinator` 是 tab runtime 写入入口，负责把 send/sync/finalization 等事件推进到本状态机。
- 本模块只提供 reducer、phase 派生与 busy 判断，不枚举 tab、不查询 session status、不处理 legacy flag 回写。
- 迁移期内 `ConversationTabRuntimeCoordinator` 仍维护 `isStreaming` 与 `isConversationSyncInFlight` 兼容信号，但 busy gating 应优先通过 lifecycle-derived phase 判断。

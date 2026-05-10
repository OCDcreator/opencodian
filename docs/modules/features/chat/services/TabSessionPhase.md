# TabSessionPhase

> **源码**: `src/features/chat/services/TabSessionPhase.ts`
> **状态**: [REVIEW]
> **最近更新**: TabSessionPhase read-only derived view

## 概述

`TabSessionPhase` 是 tab/session 活动状态的只读派生视图。它只把 `ConversationTabRuntimeCoordinator` 已经读取到的 runtime、context usage 与 session status 信号归一成一个小型 phase，不保存、不 set/mutate，也不取代 `isStreaming`、`isConversationSyncInFlight`、`sessionStatus` 等既有 truth source。

## 公开接口

```typescript
export type TabSessionPhase =
  | 'idle'
  | 'streaming'
  | 'syncing'
  | 'compacting'
  | 'server-busy'
  | 'server-retrying';

export interface TabSessionPhaseSignals {
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

- phase 优先级固定为：本 tab streaming > 同 session 其他 tab streaming > conversation sync in flight > context compaction > server retry > server busy > idle。
- 同 session 其他 tab streaming 复用 `streaming` phase，让 foreground send gating 能继续阻止同一 OpenCode session 被重复 active stream 覆盖。
- `syncing` 只表达 authoritative conversation sync 正在进行；它不是 foreground busy phase，保留既有发送阻塞语义。
- `isForegroundBusyTabSessionPhase()` 只把 `streaming`、`compacting`、`server-busy`、`server-retrying` 视为 foreground busy。

## 边界

- 本模块不读取 tab manager、runtime state、context usage 或 session status；调用方必须先收集信号。
- 本模块不拥有 follow-up queue、sync-event batching、background-task metadata persistence 或 UI/render 状态。
- 如果新增 phase，必须同步 `ConversationTabRuntimeCoordinator` 的消费测试与本文件的优先级说明。

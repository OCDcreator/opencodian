# shared/diagnostics/types

> **源码**: `src/shared/diagnostics/types.ts`
> **状态**: [REVIEW]

## 概述

后端无关的会话 trace 基础类型。`TraceEventBase` 定义共享 store 与报告构建器依赖的全部字段（时间戳、单调序号、traceId、runtimeSegmentId、可选 runId/rootSessionId/parentSessionId/sessionId/sourceEventId、字符串化的 channel/source、severity、name、metrics、payload、payloadRef）；各后端（OpenCode、Codex）在此之上扩展带类型的 channel/source 与自己的 id 字段。`TraceSummary` 与 `TraceStoreStatus` 是 store 的索引摘要与运行状态形状，`TraceSeverity` / `TraceTerminalState` / `TracePayloadRef` 为公共枚举型别名。

## 导入关系

```text
上游: 无
下游: shared/diagnostics/TraceStore, shared/diagnostics/TraceRedactor 调用方, core/opencode/diagnostics/types, 各后端 trace 类型
```

## 核心类型 / 接口

```typescript
export type TraceSeverity = 'debug' | 'info' | 'warning' | 'critical' | 'error';
export type TraceTerminalState = 'completed' | 'cancelled' | 'error' | 'incomplete';
export interface TracePayloadRef { kind: 'inline' | 'deep'; runId?: string }
export interface TraceEventBase { schemaVersion: number; timestamp: string; monotonicSequence: number; traceId: string; runtimeSegmentId: string; runId?: string; sessionId?: string; channel: string; source: string; severity: TraceSeverity; name: string; /* ... */ }
export interface TraceSummary { traceId: string; sessionId?: string; lastUpdatedAt: string; eventCount: number; runCount: number; highestSeverity: TraceSeverity; highestUnreadSeverity?: TraceSeverity; unreadAnomalyCount: number; deepCaptureCount: number }
export interface TraceStoreStatus { mode: 'disk' | 'memory'; rootDirectory: string; queuedEvents: number; approximateBytes: number; lastError?: string; droppedEvents: number }
```

## 注意事项

- `sessionId` 是通用会话锚点：OpenCode 映射 sessionId，Codex 映射 threadId。
- `channel` / `source` 在基座上是 `string`，后端子类型应收窄为各自的字面量联合。

# diagnostics/types

> 2026-07-30: OpenCode trace events, summaries and storage status now reuse the shared diagnostics contracts. `OpenCodeTraceEventV1` extends `TraceEventBase`, severity/terminal-state aliases point at shared unions, and summary/status aliases point at `TraceSummary` / `TraceStoreStatus`.

> **源码**: `src/core/opencode/diagnostics/types.ts`
> **状态**: [REVIEW]

定义 OpenCode 会话诊断的稳定 v1 事件 schema、六类通道、共享严重级别/终态、运行令牌、关联上下文、存储状态及 `OpenCodeTracePort`。Port 的可选 `recordReconnect` 统一承载 foreground transport 与全局订阅的 attempt/warning/recovery 证据。OpenCode-specific 字段仍保留 channel/source 与消息、part、call、request 关联；通用事件字段由 shared diagnostics 类型提供。诊断令牌仅在插件内部传递，禁止序列化进 OpenCode 请求。

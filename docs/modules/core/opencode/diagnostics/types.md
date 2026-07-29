# diagnostics/types

> **源码**: `src/core/opencode/diagnostics/types.ts`
> **状态**: [REVIEW]

定义 OpenCode 会话诊断的稳定 v1 事件 schema、六类通道、严重级别、运行令牌、关联上下文、存储状态及 `OpenCodeTracePort`。Port 的可选 `recordReconnect` 统一承载 foreground transport 与全局订阅的 attempt/warning/recovery 证据。`OpenCodeTraceSummary` 同时保存历史 `highestSeverity` 与可清零的 `highestUnreadSeverity`，使目录审计和会话徽标各自使用正确语义。诊断令牌仅在插件内部传递，禁止序列化进 OpenCode 请求。

# backend/diagnostics/index

> **源码**: `src/core/agents/backend/diagnostics/index.ts`
> **状态**: [REVIEW]

Codex 后端 diagnostics 模块的 barrel 入口。按 `simple-import-sort` 顺序 re-export：`./CodexSessionTraceService`（trace runtime，实现 `CodexTracePort` 及 `CodexSessionTraceServiceOptions`）、`./CodexTraceRingBuffer`（按 thread 分 lane 的追溯式线记录缓冲与 `CodexTraceRingBufferEntry`）、`./CodexWireTraceBridge`（app-server 线流量桥，含 Task 7 前的本地 `CodexAppServerWireObserver` 占位接口）、`./types`（trace 事件/上下文/设置/线记录类型与 `CodexTracePort` 契约）。

# backend/diagnostics/index

> **源码**: `src/core/agents/backend/diagnostics/index.ts`
> **状态**: [REVIEW]

Claude Code、Codex 与 DSH 后端 diagnostics 模块的 barrel 入口。按 `simple-import-sort` 顺序 re-export：`./ClaudeSessionTraceService`（Claude trace runtime，实现 `ClaudeTracePort` 与深度捕获/看门狗/导出边界）、`./ClaudeTraceRingBuffer`（按 Claude SDK session 分 lane 的已脱敏追溯缓冲）、`./CodexSessionTraceService`（Codex trace runtime，实现 `CodexTracePort` 及 `CodexSessionTraceServiceOptions`）、`./CodexTraceRingBuffer`（按 thread 分 lane 的追溯式线记录缓冲与 `CodexTraceRingBufferEntry`）、`./CodexWireTraceBridge`（app-server 线流量桥）、`./DshSessionTraceService`（DSH wire-trace runtime，实现 `DshTracePort`；2026-11-10 起契约收窄为 metadata-only，见其模块页）、`./types`（三种 backend 的 trace 事件、上下文、设置、记录和端口契约）。

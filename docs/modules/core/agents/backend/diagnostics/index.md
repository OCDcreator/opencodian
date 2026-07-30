# backend/diagnostics/index

> **源码**: `src/core/agents/backend/diagnostics/index.ts`
> **状态**: [REVIEW]

Codex 后端 diagnostics 模块的 barrel 入口。当前仅 re-export `./types`（trace 事件/上下文/设置/线记录类型与 `CodexTracePort` 契约）；后续任务加入 trace runtime、store 绑定与报告构建器实现时，在此追加导出。

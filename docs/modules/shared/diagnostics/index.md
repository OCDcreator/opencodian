# shared/diagnostics/index

> **源码**: `src/shared/diagnostics/index.ts`
> **状态**: [REVIEW]

统一导出后端无关的 trace 基础设施：基础事件/摘要/状态类型（`./types`）、递归脱敏器与默认目录解析（`./TraceRedactor`）、泛化持久化 store（`./TraceStore`）。OpenCode 与后续 Codex 后端的 diagnostics 模块共同消费该 barrel。

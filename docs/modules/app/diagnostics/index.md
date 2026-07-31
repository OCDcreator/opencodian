# app/diagnostics index

> **源码**: `src/app/diagnostics/index.ts`
> **状态**: [REVIEW]

app 层诊断 barrel。导出 `DiagnosticsRuntimeCoordinator` 类与 `DiagnosticsBackendPorts` / `DiagnosticsRuntimeInputs` 类型，供 `main.ts` 构造诊断运行时并供后续 Task 12/13 的 chat/settings coordinator 消费 typed backend ports。不导出内部实现细节。

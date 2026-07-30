# OpenCodeTraceStore

> **源码**: `src/core/opencode/diagnostics/OpenCodeTraceStore.ts`
> **状态**: [REVIEW]

薄兼容包装。实现已下沉到 `src/shared/diagnostics/TraceStore.ts` 的 `TraceStore<TEvent>`；本模块仅保留 `OpenCodeTraceStore extends TraceStore<OpenCodeTraceEventV1>`（构造签名 `(customDirectory?, fallbackDirectory = resolveDefaultOpenCodeTraceDirectory())`，并固定 `bundlePrefix: 'opencode-trace'` 以维持导出目录命名）与 `resolveDefaultOpenCodeTraceDirectory()`（委托 `resolveDefaultTraceDirectory('opencode')`）。既有调用方与测试不受影响。

行为说明（批量队列、deep 10 MiB 上限、压力通知、索引重建、轮转、降级内存环、导出二次脱敏等）见 `docs/modules/shared/diagnostics/TraceStore.md`。

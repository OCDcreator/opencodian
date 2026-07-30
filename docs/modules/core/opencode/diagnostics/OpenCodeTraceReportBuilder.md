# OpenCodeTraceReportBuilder

> **源码**: `src/core/opencode/diagnostics/OpenCodeTraceReportBuilder.ts`
> **状态**: [REVIEW]

薄兼容包装：继承共享的 `TraceReportBuilder<OpenCodeTraceEventV1>`（实现见 `src/shared/diagnostics/TraceReportBuilder.ts`），构造签名保持 `(store, buildIdentity, redactor)` 不变，注入标题 `'OpenCodian OpenCode Session Trace'` 与模块级 `extractOpenCodeTraceMetadata`。该提取器为原 `buildMetadataLines` 的机械迁移（逻辑逐字保留，无 `this.` 依赖），汇总 runtime segment 计数、`run.started` 的 providers/models、`runtime.started` 的 serverMode/baseUrl connections、`credential.identity` 的 HMAC 指纹与 `metrics.redactedSecrets/normalizedPaths/truncatedValues` 计数，并容忍未知 payload 形状而不中断报告生成。报告结构、窗口选择、脱敏与 1 MiB 截断均由共享基类实现。

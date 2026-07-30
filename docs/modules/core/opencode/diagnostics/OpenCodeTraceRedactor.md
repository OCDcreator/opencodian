# OpenCodeTraceRedactor

> 2026-07-30: This module is now a compatibility facade. The implementation and redaction policy live in `src/shared/diagnostics/TraceRedactor.ts`; this file re-exports the shared types/class under the OpenCode names and also re-exports `resolveDefaultTraceDirectory`.

> **源码**: `src/core/opencode/diagnostics/OpenCodeTraceRedactor.ts`
> **状态**: [REVIEW]

OpenCode 诊断仍通过该兼容导出获得结构化脱敏能力：认证字段、Cookie、URL userinfo/敏感查询参数、环境变量、PEM、已知秘密、本地路径、循环对象、超长字段、base64 及二进制摘要均由共享 `TraceRedactor` 处理。调用方可继续使用 `OpenCodeTraceRedactor`、`OpenCodeTraceRedactorOptions`、`OpenCodeRedactionResult` 与 `OpenCodeRedactionStats`，但新增策略应修改 shared owner，避免 OpenCode/Codex 两套规则漂移。

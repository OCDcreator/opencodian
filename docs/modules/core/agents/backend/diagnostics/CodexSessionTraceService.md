# backend/diagnostics/CodexSessionTraceService

> **源码**: `src/core/agents/backend/diagnostics/CodexSessionTraceService.ts`
> **状态**: [REVIEW]

## 概述

Codex 后端会话 trace 的核心 runtime，实现 Task 4 定义的 `CodexTracePort`。职责：以 `trace-` + sha256(threadId) 前 32 位十六进制生成稳定 traceId，经 `TraceStore.bindSession` 持久化绑定以支持跨实例 `thread.bound` / `thread.resumed`；按 thread/turn 模型发射生命周期事件（`turn.started` / `turn.notification` / `turn.finished`）；`recordWireEvent` 始终把原始线记录送入 `CodexTraceRingBuffer`，并发射 `wire.<kind>` transport 事件——非深度捕获时只保留 envelope（direction/method/requestId/ok/bytes），仅当该 thread 的 active turn 持有已 claim 的深度捕获令牌且 `captureContent=true` 时才把完整 payload 写入 deep run，`captureContent=false` 时降级为形状摘要；`flushRingBuffer` 以 `retro-<uuid>` runId 把缓冲条目作为 `wire.retroactive` 深度事件回放；`recordServiceOutput()` 将 CLI stdout/stderr 归入 `service-output` channel，`shouldCaptureServiceOutput()` 供 transport 按当前设置动态决定是否安全接管。构造时把 store 的 `runStartEventName` 设为 `turn.started`，`disabled` 与 settings.enabled 对齐，并显式使用 `TraceRedactor` 的 `hardened` 模式：密钥、绝对 vault 路径、`Error.name`、对象/环境键与 symbol/function 的字符串化值均不会进入持久化或导出；通过 `sanitizeExport` 再在导出前做后端 scrub；另外实现 turn 静默看门狗（60s warning 触发一次 buffer 回放 + `turn.stalled`，180s critical 将 turn 以 `incomplete` 终结）、连接关闭/错误时 `failActiveTurns`、response 失败时 `wire.response_error` 异常标记与仅在线程已知时的 buffer 回放，以及深度捕获的 arm/cancel/claim/getCaptureState 状态机。`enabled=false` 时 `emit` 整体短路（含 `runtime.started`）。公开字段 `runtimeSegmentId` / `store` / `reportBuilder` / `wireBridge` 供 UI 与 Task 7 传输层接入。

## 导入关系

```text
上游: shared（createLogger）, shared/diagnostics（TraceStore / TraceRedactor / TraceReportBuilder / resolveDefaultTraceDirectory）, ./CodexTraceRingBuffer, ./CodexWireTraceBridge, ./types
下游: 后续 Task 6（看门狗测试/UI）、Task 7（CodexAppServerTransport wire observer 接入）
```

## 注意事项

- 文件头部保留了 `eslint-disable max-params`：内部 `emit` 统一承载 context/channel/source/severity/name/payload/options 七参数签名，与 OpenCode 先例一致，不要拆散。
- 看门狗定时器在本任务已实现但未被测试覆盖（Task 6 补）；`dispose` 会清理全部 active turn 定时器，测试 teardown 依赖这一点避免 Jest 悬挂。
- 事件 `sessionId` 复用共享 `TraceEventBase.sessionId` 字段承载 threadId，runtime 事件（无 sessionId 且 traceId===runtimeSegmentId）落 runtime segment 文件，thread 事件落 structural 文件。

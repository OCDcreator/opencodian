# backend/diagnostics/ClaudeSessionTraceService

> **源码**: `src/core/agents/backend/diagnostics/ClaudeSessionTraceService.ts`
> **状态**: [REVIEW]

## 概述

Claude Code 后端会话 trace 的核心 runtime，实现 `ClaudeTracePort`，复用共享 `TraceStore`、`TraceRedactor` 和 `TraceReportBuilder`。它以 Claude 专用默认目录和 `turn.started` 作为 run 起点，默认读取 `backendSettings.claudeCode.sessionTrace`；`enabled=false` 时所有写入路径短路。每个公开采集、报告、导出、清理和 timer 回调都包在 best-effort 安全边界内，诊断错误不会改变 SDK 迭代、permission、elicitation、持久化或聊天结束路径。

服务固定使用 `TraceRedactor` 的 `hardened` 模式。`knownSecrets` 是动态 getter，因而 Claude settings 中 api-key/token/secret 类字段的后续更改立即参与脱敏；vault 与 diagnostics 绝对路径也会规范化。SDK message 在进入 `ClaudeTraceRingBuffer` 前已脱敏，非深度捕获只持久化 type/id/bytes envelope 或 chunk shape，已 claim 的 deep capture 才写入完整脱敏 payload。导出另经 `sanitizeExport` 逐行重洗，避免 bundle 中出现 api key、token 或本地路径明文。

新本地 Claude session 在 input push 时先以 provisional id 建立内存 turn 与 60s/180s 看门狗；SDK durable `session_id` 可以在后续若干 hook/message 后才出现。此前的 SDK、normalized chunk、turn 和 `trace.retroactive` 事件全部先经 hardened redactor 进入有界内存 defer（最多 4096 条、5MiB），并随 provisional ring 一起迁移；不会以本地 id 写入持久 trace。`bindSession()` 得到 SDK id 后将上下文、active turn 与 ring 迁移到该 id，以其作为稳定 trace id，并严格按 `session.bound`（或 `session.resumed`）→ `turn.started` → 原始事件顺序统一落盘。迁移看门狗按 `lastActivityAt` 计算剩余延迟后重新绑定，不重置 60s/180s 时限。

60 秒无输出会发射 `turn.stalled` warning 并只触发一次 ring 回放；若仍未绑定 SDK id，这些 warning/retro 证据继续 defer。180 秒 critical 会以 `incomplete` 终结；任何仍无 SDK id 的 terminal 路径同样会物化 provisional evidence，保证错误与终态可诊断。SDK error、normalized error、send error 和异常终结都会触发回溯；回放使用独立 `retro-<uuid>` deep run 和 `trace.retroactive` 事件。

按 tab 的深度捕获状态机支持 arm、claim、cancel、查询状态；token 有 30 分钟 TTL。capture 到期时仍在运行的 turn 会写 `anomaly.capture_expired` 并以 deep `incomplete` 结束。服务也记录 SDK/normalizer、生命周期、permission、MCP elicitation、session CRUD/fork/rewind 等事件，提供智能报告、导出、清空、存储状态和最近 20 条摘要给 UI。console `standard` 只镜像异常，`full` 再按 channel 开关镜像普通事件，`off` 不镜像。

## 导入关系

```text
上游: shared（createLogger）, shared/diagnostics（TraceStore / TraceRedactor / TraceReportBuilder / resolveDefaultTraceDirectory）, ./ClaudeTraceRingBuffer, ./types
下游: main.ts（构造、动态 knownSecrets 注入与 dispose）, ClaudeCodeAdapter（ClaudeTracePort）, ClaudeDiagnosticsHostAdapter（capture/report/export/status）
```

## 导出辅助函数

- `collectClaudeCodeKnownSecrets(value)`：递归遍历 Claude Code 设置子树，按 key 名（`api[_-]?key` / `token` / `secret`）收集非空凭据值，供 `main.ts` 作为 `knownSecrets` getter 传给 service 构造器。它由 `main.ts` 通过 `./core/agents/backend/diagnostics` barrel 导入，目的是把凭据收集逻辑留在 trace service 同族 owner，避免在 `main.ts` 里长出运行期所有权（owner-guard）。实现为 cycle-safe（`WeakSet` 防环）的纯函数，只读取字符串叶子、不修改入参。

## 注意事项

- `runtimeSegmentId`、`store` 和 `reportBuilder` 是 host/UI 所需的公开观察面；不要让 adapter 直接访问 service 的 ring、timer 或 session maps。
- `ClaudeTraceRingBuffer` 默认单 session 5MB、全局 20MB；只有已经脱敏的 SDK payload 可被追溯回放。
- pre-bind defer 的 4096 条/5MiB 上限独立于 ring；超出时只计入 `trace.deferred_dropped`，不会扩大内存或改写聊天路径。
- `finishTurn` 通过 session/turn/run key 防止重复终态；含 SDK `is_error` 或 error chunk 的 turn 必须终结为 `error`，不能误记为 `completed`。

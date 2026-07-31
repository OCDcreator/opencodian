# ChatDiagnosticsCoordinator

> **源码**: `src/features/chat/services/ChatDiagnosticsCoordinator.ts`
> **状态**: [REVIEW]

## 概述

`ChatDiagnosticsCoordinator` 是 chat surface 的 OpenCode-only 诊断边界。`OpenCodianView` 只提供回调式的窄 host 端口；协调器不会保留 plugin、通用后端服务表或 trace canonical state。

## 公开接口

- `getOpenCodeDiagnosticsState()` 是唯一读取 session-trace `enabled` 的 product gate：设置为 `false` 时返回 `disabled`；启用后按 store 健康度、活动 tab 的 capture state，以及当前 session 未读 anomaly 的最高严重级别，返回 `degraded`、`normal`、`armed`、`capturing`、`warning` 或 `critical`。
- `showOpenCodeDiagnostics(event)` 为当前 OpenCode tab 建立 capture/cancel/copy 菜单，不因 session-trace 设置为 `false` 而省略。copy 的成功顺序是 resolve trace、context prompt、smart report、clipboard、header refresh、success notice。
- `claimOpenCodeDiagnosticRunToken(tabId, sessionId)` 只为实际 tab 领取下一次 send 所消耗的一次性 deep-capture token，不读取 session-trace 设置。
- `cancelOpenCodeDiagnosticCapture(tabId)` 只在 tab cleanup 时取消该 tab 的 OpenCode capture，不读取 session-trace 设置，也不触及 Codex 或 Claude。

## 安全与降级边界

- 状态计算把任一 settings/service/store/tab/capture/session/trace-summary 读取异常，以及启用后缺少 service，保守地表示为 `degraded`；不会把读取失败伪装成 `off` 或 `normal`。只有 `enabled: false` 返回 `disabled`。
- 菜单构造与每一个点击回调各自使用无日志的 fail-closed 边界：缺少 service 或 tab 时安全 no-op；任一步抛出或异步 rejection 时立即停止后续 menu/capture/copy 副作用。异常文本、secret 和 vault path 不会被记录或显示。
- 诊断不会加入 conversation deletion 路径；delete 仍不读取、flush 或取消任何 trace。

## 依赖关系

- 上游：`OpenCodeSessionTraceService` 的公开 service/store/reportBuilder 签名、OpenCode session-trace settings、i18n 文案与 host 注入的 UI ports。
- 下游：`ChatHeaderPresenter` 的 OpenCode badge/menu route、`SendPipelineRuntime` 的 token claim，以及 `ConversationTabLifecycleRecoveryCoordinator` 的 tab cleanup cancellation。

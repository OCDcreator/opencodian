# ChatDiagnosticsCoordinator

> **源码**: `src/features/chat/services/ChatDiagnosticsCoordinator.ts`
> **状态**: [REVIEW]

## 概述

`ChatDiagnosticsCoordinator` 是 chat surface 的 OpenCode/Codex 诊断边界。它接收 OpenCode 的窄 host 端口，并在构造时创建/持有现有的 `CodexDiagnosticsHostAdapter` 及其 Codex host 端口；不会保留 plugin、通用后端服务表或 trace canonical state。Claude 仍由 `OpenCodianView` 中的独立 `ClaudeDiagnosticsHostAdapter` 处理，等待 Task 12 的下一后端切片。

## 公开接口

- `getOpenCodeDiagnosticsState()` 是唯一读取 session-trace `enabled` 的 product gate：设置为 `false` 时返回 `disabled`；启用后按 store 健康度、活动 tab 的 capture state，以及当前 session 未读 anomaly 的最高严重级别，返回 `degraded`、`normal`、`armed`、`capturing`、`warning` 或 `critical`。
- `showOpenCodeDiagnostics(event)` 为当前 OpenCode tab 建立 capture/cancel/copy 菜单，不因 session-trace 设置为 `false` 而省略。copy 的成功顺序是 resolve trace、context prompt、smart report、clipboard、header refresh、success notice。
- `claimOpenCodeDiagnosticRunToken(tabId, sessionId)` 只为实际 tab 领取下一次 send 所消耗的一次性 deep-capture token，不读取 session-trace 设置。
- `cancelOpenCodeDiagnosticCapture(tabId)` 只在 tab cleanup 时取消该 tab 的 OpenCode capture，不读取 session-trace 设置，也不触及 Codex 或 Claude。
- `getCodexDiagnosticsState(tabId)`、`showCodexDiagnostics(event, tabId)`、`claimCodexDiagnosticRunToken(tabId, threadId)` 和 `cancelCodexDiagnosticCapture(tabId)` 暴露 Codex-specific operations，并委托给协调器持有的 `CodexDiagnosticsHostAdapter`；不提供按 backend id 查找可变服务的通用接口。

## 当前迁移状态

这是 Task 12 的中间切片：OpenCode inline diagnostics logic 和 Codex adapter composition 已进入协调器；Claude 仍保留在自己的 adapter 上，因此 Task 12 尚未完成。

## 安全与降级边界

- 状态计算把任一 settings/service/store/tab/capture/session/trace-summary 读取异常，以及启用后缺少 service，保守地表示为 `degraded`；不会把读取失败伪装成 `off` 或 `normal`。只有 `enabled: false` 返回 `disabled`。
- 菜单构造与每一个点击回调各自使用无日志的 fail-closed 边界：缺少 service 或 tab 时安全 no-op；任一步抛出或异步 rejection 时立即停止后续 menu/capture/copy 副作用。异常文本、secret 和 vault path 不会被记录或显示。
- OpenCode 的协调器边界和 Codex adapter 的 backend-specific 边界彼此独立；tab cleanup 只调用对应 backend 的 cancellation operation。诊断不会加入 conversation deletion 路径；delete 仍不读取或 flush 任何 trace。

## 依赖关系

- 上游：`OpenCodeSessionTraceService` 的公开 service/store/reportBuilder 签名、`CodexDiagnosticsHostAdapter`、OpenCode/Codex session-trace settings、i18n 文案与 host 注入的 backend-specific UI ports。
- 下游：`ChatHeaderPresenter` 的 OpenCode/Codex badge/menu routes、`SendPipelineRuntime` 的 OpenCode/Codex token claims，以及 `ConversationTabLifecycleRecoveryCoordinator` 的对应 tab cleanup cancellations；Claude route 仍直接依赖 `ClaudeDiagnosticsHostAdapter`。

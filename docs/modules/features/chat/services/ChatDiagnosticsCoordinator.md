# ChatDiagnosticsCoordinator

> **源码**: `src/features/chat/services/ChatDiagnosticsCoordinator.ts`
> **状态**: [REVIEW]

## 概述

`ChatDiagnosticsCoordinator` 是 chat surface 的统一诊断边界。它保留 OpenCode 的 inline diagnostics logic，并在构造时创建、持有 `CodexDiagnosticsHostAdapter` 与 `ClaudeDiagnosticsHostAdapter`；三个 backend 都通过各自的 adapter 或窄 service port 接入。它不是 backend map 或 service locator，不提供按 backend id 查找可变服务的通用接口，也不把 plugin 或 trace canonical state 暴露给 `OpenCodianView`。

## 公开接口

- OpenCode：`getOpenCodeDiagnosticsState()`、`showOpenCodeDiagnostics(event)`、`claimOpenCodeDiagnosticRunToken(tabId, sessionId)`、`cancelOpenCodeDiagnosticCapture(tabId)`。
- Codex：`getCodexDiagnosticsState(tabId)`、`showCodexDiagnostics(event, tabId)`、`claimCodexDiagnosticRunToken(tabId, threadId)`、`cancelCodexDiagnosticCapture(tabId)`。
- Claude Code：`getClaudeDiagnosticsState(tabId)`、`showClaudeDiagnostics(event, tabId)`、`claimClaudeDiagnosticRunToken(tabId, sessionId)`、`cancelClaudeDiagnosticCapture(tabId)`。

这些是 backend-specific state/show/claim/cancel operations；调用方不需要也不能通过协调器查询一个通用 backend service 表。

## 装配边界

`createChatDiagnosticsCoordinatorFactory()` 接收 app-composition 提供的三个显式 backend getter，并返回只接受 chat/UI host 的工厂。`OpenCodianView` 提供 settings、current conversation、active tab/session、header/menu、prompt、clipboard 和 Notice callbacks；backend trace service getter 留在工厂闭包中。工厂创建一个 coordinator，coordinator 再创建并持有 Codex/Claude adapters。

`main.ts` 在 `registerWorkspaceIntegration()` 中传入惰性 getter：bootstrap 前 getter 没有 runtime service 时 fail closed，bootstrap 后仍从同一个 `DiagnosticsRuntimeCoordinator` 读取 OpenCode、Codex、Claude ports。

## 路由与安全边界

- Header 的 badge/state/menu、send pipeline 的一次性 deep-capture token claim，以及 tab cleanup 的 cancellation 都通过对应 backend-specific coordinator operation 路由；三条 backend 路由不在 View 中重复实现。
- OpenCode 状态在读取 settings/service/store/tab/capture/session summary 异常或 service 缺失时保守返回 `degraded`；菜单、点击回调、token claim 和 cancellation 对缺失对象、同步 throw 与异步 rejection 都 fail closed，诊断异常不会逃逸到聊天路径。
- conversation deletion 本身不读取、flush、claim、report 或以其它方式交互 trace；只有生命周期 cleanup 路由在关闭/删除 tab 时按 backend 调用 cancellation。

## 依赖关系

- 上游：`OpenCodeSessionTraceService` 的窄 service/store/reportBuilder port、`CodexDiagnosticsHostAdapter`、`ClaudeDiagnosticsHostAdapter`、三个 backend 的 session-trace settings，以及 app-composition 的显式 ports。
- 下游：`ChatHeaderPresenter` 的 backend-specific badge/menu routes、`SendPipelineRuntime` 的 backend-specific token claims，以及 `ConversationTabLifecycleRecoveryCoordinator` 的 backend-specific cleanup cancellations。

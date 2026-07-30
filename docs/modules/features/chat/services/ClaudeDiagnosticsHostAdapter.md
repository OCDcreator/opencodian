# ClaudeDiagnosticsHostAdapter

> 2026-07-30: Added the Claude Code chat diagnostics host seam, mirroring the Codex adapter while keeping trace failures outside the chat path.

> **源码**: `src/features/chat/services/ClaudeDiagnosticsHostAdapter.ts`
> **状态**: [REVIEW]

## 概述

`ClaudeDiagnosticsHostAdapter` owns the Claude Code session-trace callbacks used by the chat header, send pipeline, and tab-recovery paths. `OpenCodianView` supplies callback-based live state only; the adapter does not own the view, plugin settings object, trace store, or watchdog lifecycle.

## 公开接口

- `getDiagnosticsState(tabId)` resolves `disabled`, `degraded`, `armed`, `capturing`, `normal`, `warning`, or `critical` from `backendSettings.claudeCode.sessionTrace.enabled`, trace-store health, active capture state, and the current conversation's unread anomaly summary. A memory-mode store or storage error is conservatively `degraded`.
- `showDiagnostics(event, tabId)` builds the Claude menu only while tracing is enabled. The menu arms the next run for deep capture, cancels an armed/capturing token, or copies the current conversation's smart report.
- `claimDiagnosticRunToken(tabId, sessionId?)` claims the one-shot deep-capture token consumed by `SendPipelineRuntime`; `cancelDiagnosticCapture(tabId)` clears an armed/claimed capture when a tab is closed or deleted.
- `exportConversationDiagnostics(conversation)` flushes the per-session ring and store, resolves the Claude SDK session trace, prompts for optional actual/expected/reproduction context, builds a current-session smart report, and copies it to the clipboard. It never falls back to an unrelated conversation's trace.
- `promptDiagnosticsUserContext()` owns the three optional diagnostic prompts used by chat export.

## 安全与降级边界

- Every synchronous read/call is wrapped by `safeTrace`; async store and clipboard work use `safeTraceAsync`. A throwing trace hook returns a conservative fallback, emits only a generic warning, and never interrupts sending, header rendering, or tab recovery.
- Disabled settings gate menu construction, direct cancellation, and export. An arm callback reports success only when the returned token has a future expiry, so stale tokens cannot produce a false “capture armed” notice.
- Claude trace export is current-session scoped and uses the service's hardened redaction/report path. The adapter does not inspect or log raw SDK payloads, API keys, tokens, prompt text, or tool input.
- The adapter uses the callback-based `ClaudeDiagnosticsHostAdapterHost` contract: live Claude service/settings, current conversation, header refresh, Obsidian `Menu` construction, and `Notice` display are injected by `OpenCodianView`.

## 依赖关系

- 上游：`ClaudeSessionTraceService`, shared `TraceStoreStatus`, conversation backend-session identity, i18n copy, and Obsidian `Menu`/`Notice` adapters.
- 下游：`ChatHeaderPresenter` badge/menu routing, `SendPipelineRuntime` deep-capture claim/refresh, and `ConversationTabLifecycleRecoveryCoordinator` capture cancellation.


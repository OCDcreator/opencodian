# CodexDiagnosticsHostAdapter

> **源码**: `src/features/chat/services/CodexDiagnosticsHostAdapter.ts`
> **状态**: [REVIEW]

## 概述

`CodexDiagnosticsHostAdapter` owns the Codex diagnostics callbacks used by the chat header, send pipeline, and tab-recovery paths. It keeps `OpenCodianView` as a thin host: live trace-service/settings/conversation reads and UI side effects are supplied through `CodexDiagnosticsHostAdapterHost` callbacks.

## 公开接口

- `getDiagnosticsState(tabId)` resolves `disabled`, `degraded`, `armed`, `capturing`, `normal`, `warning`, or `critical` from session-trace settings, trace-store health, live capture state, and the active conversation's unread anomaly summary.
- `showDiagnostics(event, tabId)` builds the Codex capture/cancel/copy context menu only while session tracing is enabled; disabled settings leave the menu closed.
- `claimDiagnosticRunToken(tabId, threadId?)` claims the one-shot deep-capture token for an outgoing send; `cancelDiagnosticCapture(tabId)` clears an armed or claimed capture during tab recovery.
- `exportConversationDiagnostics(conversation)` flushes the ring buffer/store, resolves the backend session trace, prompts for actual/expected/reproduction context, builds a current-session smart report, and copies it to the clipboard.
- `promptDiagnosticsUserContext()` owns the three shared diagnostic prompts.

## 安全与降级边界

- Every synchronous trace-service read/call is wrapped by `safeTrace`; failures return conservative fallbacks and emit only a generic warning (never serialized exception text) without interrupting header rendering, sending, or tab recovery.
- Disabled settings gate menu construction, direct cancellation, and export actions. An arm callback only shows the capture-armed notice when the returned token has a future expiry; stale/expired tokens refresh the header without reporting false success.
- Deferred menu callbacks and trace-store/clipboard work use `safeTraceAsync`; failed export reports show the localized unavailable notice and a payload-free warning instead of leaking an exception into the chat path.
- An unread `critical` or `error` summary maps to `critical`; other unread anomalies map to `warning`. A memory-mode or errored store maps to `degraded`, and disabled/missing service maps to `disabled`.
- The adapter passes only callback-based host dependencies and does not own the view, plugin settings object, or trace-store lifecycle.

## 依赖关系

- 上游：`CodexSessionTraceService`, shared `TraceStoreStatus`, conversation backend-session identity, i18n copy, and Obsidian `Menu`/`Notice` adapters.
- 下游：`OpenCodianView` header diagnostics, send-pipeline diagnostic token claims, and conversation-tab lifecycle cancellation.

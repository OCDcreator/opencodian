# backend/diagnostics/types

> **源码**: `src/core/agents/backend/diagnostics/types.ts`
> **状态**: [REVIEW]

## 概述

Claude Code 与 Codex 后端会话 trace 的类型定义层。Claude 一侧 `ClaudeTraceEventV1` 把共享 `TraceEventBase` 固定到 schema v1，并使用 `lifecycle` / `stream-sync` / `tool-interaction` / `persistence-recovery` / `service-output` 五个 channel 和 `plugin` / `sdk` / `cli` / `storage` source；它补充 `turnId`、SDK `messageUuid`、`partId`、`toolUseId` 锚点。`ClaudeTraceContext` 关联 trace/runtime/session/turn/run 与可选 deep capture，`ClaudeDiagnosticRunToken` 描述按 tab claim 的捕获令牌，`ClaudeSessionTraceSettings` 是 enabled、`off|standard|full` console preset、五个 channel 和 storage directory 的设置 schema，`ClaudeSdkTraceRecord` 是只进入内存 ring 的已脱敏 SDK 记录。`ClaudeTracePort` 是 Claude adapter 的完整安全采集契约：绑定/开始/结束 turn、SDK 与 normalized chunk、生命周期/permission/elicitation/persistence 事件、回溯缓冲、捕获状态、报告/导出/清理与摘要查询。

Codex 一侧 `CodexTraceEventV1` 把 `schemaVersion` 固定为 `CODEX_TRACE_SCHEMA_VERSION`（1）、把 channel/source 收窄为 Codex 字面量联合（`lifecycle` / `transport` / `stream-sync` / `tool-interaction` / `service-output` 五个 channel，`plugin` / `app-server` / `cli` / `storage` 四类 source），并追加 `turnId` / `itemId` 锚点。`CodexTraceContext` 是跨 trace/run/thread/turn 的上下文句柄；`CodexDiagnosticRunToken` 描述深度捕获令牌；`CodexSessionTraceSettings` 是设置 schema（enabled、consolePreset、consoleChannels、storageDirectory、captureContent）；`CodexWireRecord` 描述 app-server 线协议记录；`CodexTracePort` 是 Codex runtime 的采集端口契约。

## 导入关系

```text
上游: shared/diagnostics（TraceEventBase / TraceTerminalState）
下游: core/types/settings（Claude/Codex session trace settings 与 channel IDs）, Claude/Codex trace runtime、对应 adapter 与 chat diagnostics host
```

## 注意事项

- `ClaudeTracePort` 与 `CodexTracePort` 都是 adapter 依赖的窄接口；具体 service 自有的 store、redactor、ring 和 timer 不应泄漏进该契约。
- `CLAUDE_TRACE_CHANNEL_IDS` 与 `CODEX_TRACE_CHANNEL_IDS` 是设置归一化重建 channel map 的唯一权威来源；新增 channel 必须同步 settings UI 与 locale。

# backend/diagnostics/types

> **源码**: `src/core/agents/backend/diagnostics/types.ts`
> **状态**: [REVIEW]

## 概述

Codex 后端会话 trace 的类型定义层。`CodexTraceEventV1` 在共享 `TraceEventBase` 之上把 `schemaVersion` 固定为 `CODEX_TRACE_SCHEMA_VERSION`（1）、把 channel/source 收窄为 Codex 字面量联合（`lifecycle` / `transport` / `stream-sync` / `tool-interaction` / `service-output` 五个 channel，`plugin` / `app-server` / `cli` / `storage` 四类 source），并追加 `turnId` / `itemId` 锚点。`CodexTraceContext` 是跨 trace/run/thread/turn 的上下文句柄；`CodexDiagnosticRunToken` 描述深度捕获令牌；`CodexSessionTraceSettings` 是设置 schema（enabled、consolePreset、consoleChannels、storageDirectory、captureContent），由 `core/types/settings.ts` 提供默认值与归一化；`CodexWireRecord` 描述 app-server 线协议记录；`CodexTracePort` 是后续 trace runtime 实现的完整采集端口接口（bindThread/beginTurn/各类 record/finishTurn/异常标记/深度捕获 arm-cancel-claim）。

## 导入关系

```text
上游: shared/diagnostics（TraceEventBase / TraceTerminalState）
下游: core/types/settings（CodexSessionTraceSettings / CODEX_TRACE_CHANNEL_IDS）, 后续 Codex trace runtime 模块
```

## 注意事项

- `CodexTracePort` 当前仅为接口契约，实现由后续任务落地；不要在此文件中提前加入实现自有字段。
- `CODEX_TRACE_CHANNEL_IDS` 是设置归一化重建 channel map 的唯一权威来源，新增 channel 需同步设置 UI 与 locale。

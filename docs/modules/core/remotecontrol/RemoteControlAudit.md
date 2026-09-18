# RemoteControlAudit

> **源码**: `src/core/remotecontrol/RemoteControlAudit.ts`
> **状态**: [REVIEW]

## 概述

R-C6 远程驱动的审计设施（R-C6 设计 §5.4 / §6）。在既有 `shared.diagnostics` 基座上组装独立 `TraceStore` 实例（`bundlePrefix: 'remote-control'`，默认共享诊断目录，结构层保留 7 天 / 50MB 滚动窗口），并定义审计记录的**内容契约**：指令只存 `charLength` + sha256 前 12 hex 的摘要，令牌只存指纹；v1 刻意不提供任何"调试内容采集"开关，使需求验收标准 3 的豁免条款空转。

## 导入关系

```text
上游: node:crypto、shared/diagnostics（TraceStore / TraceRedactor / types）、./RemoteControlAuth
下游: RemoteControlService.ts、SettingsRemoteControlSection.ts（审计目录/丢弃计数展示）
```

## 记录形态（schema v1）

TraceEventBase 复用为记录骨架（`schemaVersion: 1` 对应设计文档 JSON 示例中的 `v`），`traceId` 固定 `remote-control-audit`（全部事件落同一结构层 JSONL，`runtimeSegmentId` 每事件唯一，确保不会被判为 runtime 事件），`sessionId` 在指令已绑定远程会话后携带。payload 按事件名分形：

| 事件 | severity | payload 关键字段 |
|---|---|---|
| `lifecycle.started` / `lifecycle.stopped` | info | bindAddress、port、reason |
| `lifecycle.bind_failed` | error | bindAddress、port、error（redacted） |
| `request.rejected` | warning | requestId?、op?、source、authFingerprint?、outcome{httpStatus, code} |
| `request.completed` | debug | 健康探活/状态查询的成功记录 |
| `request.terminal` | info/warning | requestId、op、source、authFingerprint、instruction{charLength, sha256Prefix12}、outcome{httpStatus, terminalState, durationMs} |

`source` 环回下为 `{ remoteAddress, remotePort, host }`——无身份模型下的物理上限，如实记录。

## 双层 redaction

1. **append 时**：payload 先过 `TraceRedactor({ redactionMode: 'hardened', knownSecrets })`（knownSecrets 动态收集：当前 `remoteControlToken` + 设置内现存 apiKey/password/token），字段名/值/密钥形态一并击穿；redaction 失败 contained，绝不影响请求路径。
2. **导出时**：`sanitizeExport` 逐行复跑 hardened redaction（先例 `ClaudeSessionTraceService.redactExportContent`），`TraceStore` 再对导出文件统一套 `sanitizeDiagnosticReport()`（报告级 sanitizer）。

## 注意事项

- 存储降级继承 TraceStore 既有语义：磁盘失败转内存环并计 `droppedEvents`，`getStatus()` 透出给设置页。
- 服务关闭态下 audit 实例是惰性构造的（见 `RemoteControlService`），因此"关闭 = 零成本"包括不建目录。
- 单测：`tests/unit/core/remotecontrol/RemoteControlAudit.test.ts`（记录四要素、摘要不含内容子串、令牌击穿、导出双层 scrub）。

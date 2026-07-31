# settings/debug/types

> **源码**: `src/features/settings/debug/types.ts`
> **状态**: [REVIEW]

## 概述

该模块定义 OpenCode、Codex 与 Claude Code debug panel 的窄类型 contract，并在 settings composition 边界把 app-owned trace services 分别适配为 panel 可消费的 diagnostics ports。它只描述边界和转接，不创建第二份 settings、trace status 或 catalog state。

## 导入关系

```text
上游: core/opencode/diagnostics, core/agents/backend/diagnostics, i18n, shared/debugModules, shared/diagnostics
下游: OpenCodeDebugPanel, CodexDebugPanel, ClaudeCodeDebugPanel, OpenCodianSettings, OpenCodianSettingsView, SettingsTabbedRenderer, settings tests
```

## 核心类型 / 接口

| 导出 | 作用 |
|------|------|
| `DebugModuleGroupConfig` | 让 panel 复用 section 的 debug-module 分组渲染参数 |
| `OpenCodeDebugSettingsPort` | 暴露 panel 所需的 OpenCode session-trace settings 形状 |
| `OpenCodeTraceDiagnosticsPort` | 暴露 status、summary、smart report、flush、export、clear、delete 等最小诊断操作 |
| `OpenCodeDebugPanelOptions` | 汇总 settings、diagnostics、保存、目录、按钮和 module-render callbacks |
| `CodexDebugSettingsPort` | 暴露 panel 所需的 Codex session-trace settings 形状 |
| `CodexTraceDiagnosticsPort` | 暴露 Codex status、summary、smart report、flush、export、clear、delete 等最小诊断操作 |
| `CodexDebugPanelOptions` | 汇总 Codex settings、diagnostics、保存、目录和按钮 callbacks |
| `ClaudeCodeDebugSettingsPort` | 暴露 Claude logger channels、session-trace settings 与 panel 所需的 debug 状态 |
| `ClaudeTraceDiagnosticsPort` | 暴露 Claude trace status、summary、smart report、export、clear、delete 等最小诊断操作 |
| `ClaudeCodeDebugPanelOptions` | 汇总 Claude settings、diagnostics、保存、目录、导出验证、日志与共享 helper callbacks |

## 核心逻辑

### OpenCode diagnostics adapter

`createOpenCodeTraceDiagnosticsPort(service)` 在 service 存在时把 `store` 和 `reportBuilder` 的既有操作逐项映射到窄 port；service 未构造时返回 `undefined`。adapter 是唯一的 settings composition seam，不把完整 service 暴露给 `SettingsDebugSection` 或 `OpenCodeDebugPanel`。

### Codex diagnostics adapter

`createCodexTraceDiagnosticsPort(service)` 与 OpenCode adapter 对称地把 `CodexSessionTraceService.store` 和 `reportBuilder` 的既有操作逐项映射到 `CodexTraceDiagnosticsPort`；service 未构造时返回 `undefined`。Codex panel 使用该 port 读取 `TraceStoreStatus` / `TraceSummary`，执行 smart report、flush、bundle export、clear 和 delete；adapter 不复制 service 的 storage state，也不把完整 service 暴露给 `SettingsDebugSection` 或 `CodexDebugPanel`。

### Claude diagnostics adapter

`createClaudeTraceDiagnosticsPort(service)` 在 service 存在时把 `ClaudeSessionTraceService` 的 storage status、recent traces、smart report、export、clear-all 和 delete 操作映射到 `ClaudeTraceDiagnosticsPort`；service 未构造时返回 `undefined`。Claude panel 只消费该 port，不接触 service、store 或 report builder；console logger 的 visible-log report 仍由 `SettingsDebugSection` 通过 callback 提供。

### Callback contract

`OpenCodeDebugPanelOptions` 只携带 OpenCode panel 所需的 settings、diagnostics、异步保存、目录选择、按钮创建和 debug-module 渲染能力。`CodexDebugPanelOptions` 只携带 Codex panel 所需的 settings、diagnostics、异步保存、目录选择和按钮创建能力；它不需要 OpenCode 的 debug-module renderer。`ClaudeCodeDebugPanelOptions` 额外携带 section-owned 的已验证导出目录、可见日志和 summary-only report callbacks，但不携带完整 plugin 或全局诊断 service。全量 plugin、section 私有 helper 和其他 backend diagnostics 不属于这些 contracts。

## 关键导出

| 方法 / 类型 | 说明 |
|-------------|------|
| `createOpenCodeTraceDiagnosticsPort()` | 将可选 OpenCode trace service 转成可选窄 diagnostics port |
| `OpenCodeTraceDiagnosticsPort` | panel 访问诊断状态和命令的最小接口 |
| `OpenCodeDebugPanelOptions` | panel 的组合依赖接口 |
| `createCodexTraceDiagnosticsPort()` | 将可选 Codex trace service 转成可选窄 diagnostics port |
| `CodexTraceDiagnosticsPort` | Codex panel 访问诊断状态和命令的最小接口 |
| `CodexDebugPanelOptions` | Codex panel 的组合依赖接口 |
| `createClaudeTraceDiagnosticsPort()` | 将可选 Claude trace service 转成可选窄 diagnostics port |
| `ClaudeTraceDiagnosticsPort` | Claude panel 访问诊断状态和命令的最小接口 |
| `ClaudeCodeDebugPanelOptions` | Claude panel 的组合依赖接口 |

## 数据流

```text
plugin.openCodeTraceService?
  -> createOpenCodeTraceDiagnosticsPort()
  -> getOpenCodeDiagnostics callback
  -> OpenCodeDebugPanelOptions
  -> OpenCodeDebugPanel

plugin.codexTraceService?
  -> createCodexTraceDiagnosticsPort()
  -> getCodexDiagnostics callback
  -> CodexDebugPanelOptions
  -> CodexDebugPanel

plugin.claudeTraceService?
  -> createClaudeTraceDiagnosticsPort()
  -> getClaudeDiagnostics callback
  -> ClaudeCodeDebugPanelOptions
  -> ClaudeCodeDebugPanel
```

三个 settings composition 路径（标准设置 tab、editor-area settings view、tabbed renderer）都在各自边界分别创建三个 backend 的 port；它们共享对应 adapter，但不改变 diagnostics service 的 canonical ownership。Claude port 的注入不改变 classic 与 tabbed 都渲染 Claude panel 的事实；Codex port 的注入也不改变 Codex panel 只由 debug tabbed route 挂载的事实。

## 与其他模块的交互

- `OpenCodeDebugPanel`: 消费 OpenCode contract，不依赖完整 plugin。
- `CodexDebugPanel`: 消费 Codex contract，不依赖完整 plugin；其 `captureContent` settings 由 `CodexDebugSettingsPort` 暴露。
- `ClaudeCodeDebugPanel`: 消费 Claude settings/diagnostics contract；`debugChannels` 与 `sessionTrace.consoleChannels` 由同一 settings port 暴露但语义保持独立。
- `SettingsDebugSection`: 接收三个 diagnostics callbacks，并继续提供 section-level shared callbacks、visible-log/report callbacks。
- `OpenCodianSettings`、`OpenCodianSettingsView`、`SettingsTabbedRenderer`: 分别注入三个 adapter factory 的结果。
- `core/opencode/diagnostics`: 保留 trace service、store、report builder 的真实 ownership。

## 配置项

无独立配置项；`OpenCodeDebugSettingsPort` 映射既有 `backendSettings.opencode.sessionTrace`。

## 注意事项

- 不把 full plugin、store 或 report builder 加回任一 panel options；新增操作先评估是否属于对应窄 port。
- 不在此模块复制 settings state 或 debug-module helper；OpenCode 与 Claude helper 的实现仍属于 `SettingsDebugSection`，各 panel 使用 section 注入的 action/path/log callbacks。
- `createClaudeTraceDiagnosticsPort()` 只映射 app-owned Claude trace service；不得把 full service/store/report builder 加回 `ClaudeCodeDebugPanelOptions`。
- 本 slice 不新增 locale key；本模块声明三个 backend contracts，并保留 Claude console `debugChannels` 与 trace `consoleChannels` 的独立语义。

# ClaudeCodeDebugPanel

> **源码**: `src/features/settings/debug/ClaudeCodeDebugPanel.ts`
> **状态**: [REVIEW]

## 概述

`ClaudeCodeDebugPanel` 是 Claude Code debug workbench 的完整 UI owner。它负责 workbench DOM、Claude SDK 摘要状态、隐私说明、console debug channels、session-trace settings/status/actions/catalog/filter，以及 Claude 日志预览；它不接收完整 plugin，也不直接访问 `ClaudeSessionTraceService`、store 或 report builder。

classic `SettingsDebugSection.attach()` 与 tabbed `attachTabbed()` 都渲染该 panel。tabbed 路径由外层 `createDebugTabShell()` 提供标题和说明，因此传入 `includeIntro: false`；classic 路径使用 panel 自己的 header。

## 导入关系

```text
上游: obsidian, core/agents/backend/diagnostics, core/types, i18n, shared/debugModules, shared/diagnostics, settings/debug/types
下游: SettingsDebugSection, ClaudeCodeDebugPanel.test.ts
```

## 核心类型 / 接口

```typescript
export interface ClaudeCodeDebugPanelRenderOptions
export class ClaudeCodeDebugPanel
```

构造函数接收 `ClaudeCodeDebugPanelOptions`。settings、diagnostics、保存、目录选择、action button、debug-module renderer、可见日志与 section-level 报告能力都通过窄 port/callback 提供。

## 核心逻辑

### Workbench 生命周期

`render()` 创建 `data-debug-workbench="claude-code"` workbench，并按固定顺序渲染：代码诊断状态条、隐私说明、Claude module toggle、console channel controls、session-trace status/controls/actions/catalog，以及 logger 日志预览。panel 不保存第二份 settings 或 catalog state；设置写回仍调用注入的 `saveSettings()`。

`backendSettings.claudeCode.debugChannels` 是 Claude console logger 的 channel 开关，过滤最近日志预览；`backendSettings.claudeCode.sessionTrace.consoleChannels` 是 session trace 的独立 channel 配置，服务于 trace capture preset。两者必须保持独立，trace enabled/preset 不会改变 console logger controls。

### Session trace

panel 从窄 `ClaudeTraceDiagnosticsPort` 读取 storage status 和最近 trace summaries，并渲染 capture enabled、storage mode/directory、queued events、estimated bytes、dropped events、last error、`off` / `standard` / `full` preset、五个 `CLAUDE_TRACE_CHANNEL_IDS` 开关和 storage directory。缺少 `sessionTrace` 分支时，panel 以既有默认 backend settings 补齐后再保存。

trace actions 通过 port 执行 smart report copy、最新 trace bundle export 和确认后的 clear-all；recent catalog 最多读取 20 条 summary，支持 anomaly-only filter、逐条 smart-report copy 与 delete。logger 的“复制当前日志”和“复制 Claude diagnostics”仍通过 section 注入的可见日志与 summary-only report callbacks，不使用 trace report builder。

### Fail-closed / unavailable

`getDiagnostics()` 可以返回 `undefined`，对应 service 尚未构造的生命周期。此时 status 使用 settings/default directory 与零计数安全渲染，catalog 显示 empty state；需要 diagnostics 的 copy、delete、clear 等 action 不伪造结果。export 还必须通过 section 提供的已验证 Debug export directory；没有最近 trace 或目录不可用时显示 Notice，不执行导出。panel 不绕过 port 去探测 service，也不展示原始 SDK payload。

## 共享 helper 边界

- `SettingsDebugSection` 保留 debug source-tab shell/router、插件 export、平台路径与目录选择、action-button 工厂、debug-module renderer、日志筛选/取数、可见日志清空、Claude summary-only diagnostic report 和 copy failure logging。
- panel 通过 `renderDebugModules()` 复用 section 的 `claudeCode` module helper，不复制 registry 或 module rendering。
- `ClaudeSessionTraceService` 仍由 app diagnostics runtime 持有；composition 层通过 `createClaudeTraceDiagnosticsPort()` 暴露最小的 status、summary、report、export、clear、delete 操作。
- 不把全量 plugin、trace service、store、report builder 或全局 diagnostic export 加回 panel options；共享导出路径验证与全局 report 行为继续留在 section。

## 与其他模块的交互

- `SettingsDebugSection`: 构造 panel、提供 callbacks，并决定 classic/tabbed 挂载位置；classic 与 tabbed 都继续渲染 Claude，Codex 的 legacy classic omission 不在此修复。
- `settings/debug/types.ts`: 定义 `ClaudeCodeDebugSettingsPort`、`ClaudeTraceDiagnosticsPort`、`ClaudeCodeDebugPanelOptions` 和 service adapter。
- `OpenCodianSettings`、`OpenCodianSettingsView`、`SettingsTabbedRenderer`: 在各自 composition 边界注入 `createClaudeTraceDiagnosticsPort(plugin.claudeTraceService)` 的结果，不改变 trace service 的 canonical ownership。
- `core/agents/backend/diagnostics`: 通过 narrow port 提供 Claude trace status、summary、smart report、bundle export、clear 和 delete。

## 配置项

- `settings.enableDebugLogging`
- `settings.debugModuleSettings.claudeCode`
- `settings.backendSettings.claudeCode.debugChannels`
- `settings.backendSettings.claudeCode.sessionTrace.enabled`
- `settings.backendSettings.claudeCode.sessionTrace.consolePreset`
- `settings.backendSettings.claudeCode.sessionTrace.consoleChannels`
- `settings.backendSettings.claudeCode.sessionTrace.storageDirectory`

## 注意事项

- panel 是完整 Claude workbench owner，不是只转发一个调用的 shim。
- console `debugChannels` 与 session-trace `consoleChannels` 是两个独立配置面；文档、测试和后续改动都不能把它们合并。
- 诊断 service 未构造时必须保持安全空态和无副作用 action；不要通过新的全量 service 依赖绕过 fail-closed seam。
- 保持既有 `data-debug-workbench` / trace catalog markers、locale keys、保存/目录重启提示和 clear confirmation 语义。

## 测试

`tests/unit/features/settings/ClaudeCodeDebugPanel.test.ts` 覆盖 panel DOM/data markers、classic/tabbed intro 行为、console 与 session-trace channel 独立性、无 diagnostics service 的安全空态、settings controls、actions/catalog/filter，以及 panel 不直接接触 plugin/service/store/report-builder 的结构约束。

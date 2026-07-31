# CodexDebugPanel

> **源码**: `src/features/settings/debug/CodexDebugPanel.ts`
> **状态**: [REVIEW]

## 概述

`CodexDebugPanel` 是 Codex session-trace debug workbench 的完整 owner。它负责 Codex trace 的状态展示、设置控件、诊断动作和最近 trace catalog；不是只转发一个调用的 shim，也不接收完整 `OpenCodianPlugin`、trace service、store 或 report builder。

当前 intermediate slice 中，`SettingsDebugSection.attachTabbed()` 在 Codex debug tab shell 的 body 内调用 `render(..., { includeIntro: false })`。经典 `SettingsDebugSection.attach()` 有意不调用该 panel，因此 legacy non-tabbed attach 的 Codex visibility omission 保持不变；本 slice 不修复、删除或重新解释这条 legacy 路径。

## 导入关系

```text
上游: obsidian, core/agents/backend/diagnostics, core/types, i18n, shared/diagnostics, settings/debug/types
下游: SettingsDebugSection, CodexDebugPanel.test.ts
```

## 核心类型 / 接口

```typescript
export interface CodexDebugPanelRenderOptions
export class CodexDebugPanel
```

构造函数只接收 `CodexDebugPanelOptions`：Codex settings port、可选 diagnostics port、保存设置、目录选择和共享 action-button callback。panel 不拥有这些依赖背后的 canonical state。

## 核心逻辑

### 面板渲染

`render()` 创建 `data-debug-workbench="codex"` workbench。默认会渲染 Codex 标题和说明；tabbed composition 由外层 `createDebugTabShell()` 提供标题/说明，因此传入 `includeIntro: false`，避免重复页面级文案。随后按固定顺序渲染 trace status、trace controls、trace actions 和 recent catalog。

### 状态与设置

- status 读取 settings 中的 `sessionTrace.enabled`，并通过 diagnostics port 获取 storage mode、最近 trace 数量（`listSummaries(100)`）、估算大小和 last error。
- 如果 `backendSettings.codex` 或 `sessionTrace` 尚未初始化，panel 使用既有 `getDefaultBackendSettings().codex` 默认值补齐；它不建立第二份 settings state。
- controls 持久化 enabled 开关、`standard` / `full` preset、自定义 storage directory、`CODEX_TRACE_CHANNEL_IDS` 的五个 channel toggles，以及 `captureContent`。
- 目录文本变化会 trim 后保存；失焦和目录选择会保留现有 restart Notice 语义。所有设置写回都通过注入的 `saveSettings()`。

### 诊断动作与 catalog 生命周期

诊断服务未构造时，status 和空 catalog 仍可渲染；实际动作由 composition path 提供 diagnostics port 后执行。主动作通过 section 注入的 `addActionButton()` 创建：

- copy report：调用 `buildSmartReport()` 后复制到 clipboard；
- flush：调用 `flush()`；
- export：读取最新的 `listSummaries(1)`，让用户选择目录后调用 `exportTraceBundle()`；无 trace 时保持 empty Notice；
- clear：确认后调用 `clear()`，并清空当前 Codex catalog DOM。

catalog 初次渲染最多读取 20 条 summary，提供 anomaly-only filter。每条 summary 显示 session/trace 标识、更新时间、事件数和最高严重级别，并提供该 trace 的 smart-report copy 与 `deleteTrace()`；删除成功后只移除当前 row。catalog 不复制 trace service 的存储状态，summary/status/flush/export/clear/delete 全部经 `CodexTraceDiagnosticsPort`。

## 与其他模块的交互

- `SettingsDebugSection`: 保留 debug source-tab shell/router、共享目录选择、action-button helper、插件 export 和 Claude workbench；只在 tabbed Codex 路由挂载本 panel。
- `settings/debug/types.ts`: 定义 `CodexDebugPanelOptions`、`CodexDebugSettingsPort` 和 `CodexTraceDiagnosticsPort`，并在 composition 边界提供 service adapter。
- `OpenCodianSettings`、`OpenCodianSettingsView`、`SettingsTabbedRenderer`: 各自在创建 `SettingsDebugSection` 时注入 `createCodexTraceDiagnosticsPort(plugin.codexTraceService)`；这不改变 Codex trace service 的 app-owned ownership。
- `core/agents/backend/diagnostics`: 通过 narrow port 提供 Codex trace status、summary、report、flush、bundle export、clear 和 delete 操作。
- `i18n`: 复用既有 Codex debug 文案；本 slice 不增加 locale key。

## 关键方法 / 导出

| 方法 / 导出 | 说明 |
|-------------|------|
| `CodexDebugPanelRenderOptions` | 控制是否由 panel 自己渲染 intro；tabbed composition 传 `includeIntro: false` |
| `render()` | 在注入的容器中创建完整 Codex workbench |
| `CodexDebugPanel` | 组装 status、settings、actions 和 catalog 的完整 owner |

## 注意事项

- 不把完整 plugin、`codexTraceService`、store 或 report builder 加回 panel options；新增能力先扩展窄 port 并保留 adapter 在 composition 边界。
- `captureContent` 是当前 Codex trace settings contract 的一部分，不能在 panel 重构中遗漏或与 `consolePreset` 混为一谈。
- tabbed-only 是当前 section 的挂载事实，不是对 legacy classic attach 的修复；不要把 Codex panel 加回 `attach()`，也不要声称 non-tabbed visibility omission 已解决。
- shared platform/path/action helper 继续由 `SettingsDebugSection` 提供；Claude 的 console debug channels 与独立 session-trace controls 仍由该 section 持有，本文件不定义 Claude panel contract。

## 测试

`tests/unit/features/settings/CodexDebugPanel.test.ts` 覆盖 DOM/data markers、状态与空服务渲染、全部 settings controls（含 `captureContent`）、action/catalog operation order、tabbed-only/classic omission 以及 panel 不接触 plugin/store/report-builder 的结构约束。

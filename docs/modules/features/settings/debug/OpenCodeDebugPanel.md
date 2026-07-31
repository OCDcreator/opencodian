# OpenCodeDebugPanel

> **源码**: `src/features/settings/debug/OpenCodeDebugPanel.ts`
> **状态**: [REVIEW]

## 概述

`OpenCodeDebugPanel` 是设置页 OpenCode debug workbench 的完整 owner。它渲染 OpenCode trace 的状态、设置、channel controls、debug-module rows、动作和最近 trace catalog，并同时服务 classic `SettingsDebugSection.attach()` 与 tabbed `attachTabbed()`。它不接收完整 plugin，也不直接持有 OpenCode trace service、store 或 report builder。

## 导入关系

```text
上游: obsidian, core/opencode/diagnostics, core/types, i18n, shared/debugModules, settings/debug/types
下游: SettingsDebugSection, OpenCodeDebugPanel.test.ts
```

## 核心类型 / 接口

```typescript
export const OPEN_CODE_DEBUG_MODULE_KEYS
export interface OpenCodeDebugPanelRenderOptions
export class OpenCodeDebugPanel
```

构造函数接收 `OpenCodeDebugPanelOptions`。其中 settings、diagnostics、保存设置、目录选择、按钮创建和共享 debug-module 渲染都通过窄 port/callback 提供。

## 核心逻辑

### 面板渲染

`render()` 创建 `data-debug-workbench="opencode"` workbench，可按 classic/tabbed 需要决定是否渲染标题和说明。随后按固定顺序渲染 trace status、trace controls、OpenCode module rows、trace actions 和 recent catalog，保持原有 DOM 标记与交互语义。

### 设置与诊断动作

面板从 `settings.backendSettings.opencode.sessionTrace` 读写 OpenCode trace 设置；缺少该分支时使用既有默认值。服务状态、summary、smart report、flush、bundle export、clear 和 delete 全部通过 `OpenCodeTraceDiagnosticsPort` 调用；可选 diagnostics port 允许 service 尚未构造时安全展示状态和空 catalog，需要实际执行诊断动作的 composition path 仍提供对应 port。

### 共享 helper 边界

OpenCode panel 复用 `SettingsDebugSection` 提供的目录选择、action button 和 debug-module renderer callback。它不复制这些平台/section helper，也不承担插件导出、Codex 或 Claude workbench。

## 关键方法

| 方法 / 导出 | 说明 |
|-------------|------|
| `OPEN_CODE_DEBUG_MODULE_KEYS` | OpenCode debug module 的单一 key 集合：`server`、`models`、`streaming` |
| `render()` | 在 classic 或 tabbed 容器中渲染完整 OpenCode workbench |
| `OpenCodeDebugPanel` | 通过窄 options contract 组装状态、设置、动作和 catalog |

## 数据流

```text
OpenCodianSettings / OpenCodianSettingsView / SettingsTabbedRenderer
  -> createOpenCodeTraceDiagnosticsPort(plugin.openCodeTraceService)
  -> SettingsDebugSection
  -> OpenCodeDebugPanel.render()
  -> settings port + diagnostics port + shared callbacks
```

## 与其他模块的交互

- `SettingsDebugSection`: 提供 section shell、共享 callbacks，并决定 classic/tabbed 挂载位置。
- `settings/debug/types.ts`: 定义 settings、diagnostics 与共享 helper contract，并适配 app-owned trace service。
- `core/opencode/diagnostics`: 只通过类型和 port 语义提供 trace 状态、summary、报告和存储操作。
- `i18n`: 复用既有 OpenCode debug 文案；本 slice 不增加 locale key。

## 配置项

- `settings.backendSettings.opencode.sessionTrace.enabled`
- `settings.backendSettings.opencode.sessionTrace.consolePreset`
- `settings.backendSettings.opencode.sessionTrace.storageDirectory`
- `settings.backendSettings.opencode.sessionTrace.consoleChannels`

## 注意事项

- 这是完整 OpenCode panel owner，不是只转发一个调用的 shim。
- 不把完整 plugin 或 trace service 作为新的 panel 依赖；service/store/report 访问只能留在 `types.ts` 的 composition adapter 内。
- shared path/action/module helper 继续由 `SettingsDebugSection` 提供；Codex 与 Claude panel 是同一 owner 下的相邻 backend workbench，不应被重新塞回 OpenCode panel。
- 保持既有 OpenCode locale keys、DOM data markers、保存/导出/清空确认语义；legacy non-tabbed attach Codex omission 不在这里修复。

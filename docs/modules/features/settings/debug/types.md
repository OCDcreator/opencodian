# settings/debug/types

> **源码**: `src/features/settings/debug/types.ts`
> **状态**: [REVIEW]

## 概述

该模块定义 OpenCode debug panel 的窄类型 contract，并在 settings composition 边界把 app-owned `OpenCodeSessionTraceService` 适配为 panel 可消费的 `OpenCodeTraceDiagnosticsPort`。它只描述边界和转接，不创建第二份 trace state。

## 导入关系

```text
上游: core/opencode/diagnostics, i18n, shared/debugModules
下游: OpenCodeDebugPanel, OpenCodianSettings, OpenCodianSettingsView, SettingsTabbedRenderer, settings tests
```

## 核心类型 / 接口

| 导出 | 作用 |
|------|------|
| `DebugModuleGroupConfig` | 让 panel 复用 section 的 debug-module 分组渲染参数 |
| `OpenCodeDebugSettingsPort` | 暴露 panel 所需的 OpenCode session-trace settings 形状 |
| `OpenCodeTraceDiagnosticsPort` | 暴露 status、summary、smart report、flush、export、clear、delete 等最小诊断操作 |
| `OpenCodeDebugPanelOptions` | 汇总 settings、diagnostics、保存、目录、按钮和 module-render callbacks |

## 核心逻辑

### Diagnostics adapter

`createOpenCodeTraceDiagnosticsPort(service)` 在 service 存在时把 `store` 和 `reportBuilder` 的既有操作逐项映射到窄 port；service 未构造时返回 `undefined`。adapter 是唯一的 settings composition seam，不把完整 service 暴露给 `SettingsDebugSection` 或 `OpenCodeDebugPanel`。

### Callback contract

`OpenCodeDebugPanelOptions` 只携带 panel 所需的 settings、异步保存、目录选择、按钮创建和 debug-module 渲染能力。全量 plugin、section 私有 helper 和其他 backend diagnostics 不属于该 contract。

## 关键导出

| 方法 / 类型 | 说明 |
|-------------|------|
| `createOpenCodeTraceDiagnosticsPort()` | 将可选 OpenCode trace service 转成可选窄 diagnostics port |
| `OpenCodeTraceDiagnosticsPort` | panel 访问诊断状态和命令的最小接口 |
| `OpenCodeDebugPanelOptions` | panel 的组合依赖接口 |

## 数据流

```text
plugin.openCodeTraceService?
  -> createOpenCodeTraceDiagnosticsPort()
  -> getOpenCodeDiagnostics callback
  -> OpenCodeDebugPanelOptions
  -> OpenCodeDebugPanel
```

三个 settings composition 路径（标准设置 tab、editor-area settings view、tabbed renderer）都在各自边界创建该 port；它们共享同一 adapter，但不改变 diagnostics service 的 canonical ownership。

## 与其他模块的交互

- `OpenCodeDebugPanel`: 消费所有 contract，不依赖完整 plugin。
- `SettingsDebugSection`: 接收 `getOpenCodeDiagnostics`，并继续提供 section-level shared callbacks。
- `OpenCodianSettings`、`OpenCodianSettingsView`、`SettingsTabbedRenderer`: 注入 adapter factory 的结果。
- `core/opencode/diagnostics`: 保留 trace service、store、report builder 的真实 ownership。

## 配置项

无独立配置项；`OpenCodeDebugSettingsPort` 映射既有 `backendSettings.opencode.sessionTrace`。

## 注意事项

- 不把 full plugin、store 或 report builder 加回 panel options；新增操作先评估是否属于窄 port。
- 不在此模块复制 settings state 或 debug-module helper；helper 的实现仍属于 `SettingsDebugSection`。
- 本 slice 不新增 locale key，也不声明 Codex/Claude panel contracts。

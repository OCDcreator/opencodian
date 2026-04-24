# SettingsDebugSection

> **源码**: `src/features/settings/SettingsDebugSection.ts`
> **状态**: [REVIEW]

## 概述

`SettingsDebugSection` 是设置页 debug 分区的厚 owner。当前它负责完整调试生命周期 UI：

- debug 总开关
- 模块级 debug 开关
- 高频日志刷新间隔
- inline serialized args
- 日志导出路径
- 复制诊断 / 导出日志文件
- 清空最近日志缓存
- 复制版本 / `BUILD_ID`
- 控制台打开帮助

## 核心逻辑

### 模块开关

section 通过 `DEBUG_MODULE_REGISTRY` 动态生成模块 toggles，而不是手写散落的开关列表。这样新增 debug module 时：

1. 先改注册表
2. 设置页自动出现 toggle
3. 对应测试也能发现映射遗漏

### 高频日志刷新间隔

section 直接编辑 `settings.debugRefreshIntervalMs`。logger 侧会用该值限制相同高频 payload 的重复输出频率，当前最直接受益的是 context usage 轮询日志。

### 诊断动作

- `Copy recent diagnostics`：调用 `buildDiagnosticReport('copy-diagnostics')`
- `Generate log file`：调用 `writeDiagnosticLogFile(targetDirectory, 'settings-export')`
- `Clear recent logs`：清空 logger 最近缓存
- `Copy version / BUILD_ID`：复制 `OpenCodian <version> BUILD_ID=<id>`

## 与其他模块的交互

- `src/main.ts`: 提供 `saveSettings()`、`logServerStatusSnapshot()`、`buildDiagnosticReport()`、`writeDiagnosticLogFile()` 和 build identity 文本
- `src/shared/debugModules.ts`: 提供模块注册表和刷新间隔归一化
- `src/shared/logger.ts`: 提供 `clearRecentLogs()` 和底层日志开关能力
- `src/core/types/settings.ts`: 持久化 `debugModuleSettings`、`debugRefreshIntervalMs` 和 `debugLogPaths`

## 注意事项

- 这里的模块开关只控制 `info` / `debug`；`always` / `warn` / `error` 不应被隐藏。
- 导出路径的选择、确认后持久化语义保持不变。
- 如果后续继续扩展 debug 面板，优先继续在这个 owner 收口，不要把逻辑重新散回 `OpenCodianSettings.ts`。

## 2026-04-24 Tabbed layout support

Added `attachTabbed(containerEl, secondaryTabId)` method for the tabbed settings layout. It routes content by secondary tab:

- `general` — renders debug toggle + module toggles + refresh interval
- `modules` — renders module-level debug switches
- `logs` — renders log path picker + export/log actions
- `actions` — renders diagnostic copy/generate/clear actions + console help

The classic `attach()` method remains unchanged.

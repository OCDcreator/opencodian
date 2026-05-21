# SettingsDebugSection

> **源码**: `src/features/settings/SettingsDebugSection.ts`
> **状态**: [REVIEW]

## 概述

`SettingsDebugSection` 是设置页 debug 分区的厚 owner。当前它负责完整调试生命周期 UI：

- `Plugin` 来源分组：debug 总开关，以及 app/settings/chat/contextUsage/tasks/storage/providerIcons/visuals 等插件内部模块开关
- `OpenCode` 来源分组：server/models/streaming 等 OpenCode 后端诊断开关
- `Claude Code` 来源分组：`claudeCode` SDK 诊断开关，用于 query/session/stream/permission/hook/subagent 摘要日志
- `Export` 分组：高频刷新、参数格式、日志路径、诊断动作和控制台帮助
- 高频日志刷新间隔
- inline serialized args
- 日志导出路径
- 复制诊断 / 导出日志文件
- 清空最近日志缓存
- 复制版本 / `BUILD_ID`
- 控制台打开帮助

## 核心逻辑

### 模块开关

section 通过 `DEBUG_MODULE_REGISTRY` 动态生成模块 toggles，并在本 owner 内按来源过滤到 `plugin`、`opencode`、`claude-code` 三个分组，而不是手写散落的开关列表。这样新增 debug module 时：

1. 先改注册表
2. 在 `SettingsDebugSection` 里把 module key 放进正确来源分组
3. 对应测试也能发现映射遗漏

`claudeCode` 目前只表示 Claude Code SDK 诊断开关，文案明确说它控制 query/session/stream/permission/hook/subagent 摘要日志，不代表 full runtime proof 已完成。

### 高频日志刷新间隔

section 直接编辑 `settings.debugRefreshIntervalMs`。logger 侧会用该值限制相同高频 payload 的重复输出频率，当前最直接受益的是 context usage 轮询日志。

### 诊断动作

- `Copy recent diagnostics`：调用 `buildDiagnosticReport('copy-diagnostics')`
- `Generate log file`：调用 `writeDiagnosticLogFile(targetDirectory, 'settings-export')`
- `Clear recent logs`：清空 logger 最近缓存
- `Copy version / BUILD_ID`：复制 `OpenCodian <version> BUILD_ID=<id>`
- 日志导出路径输入标记 `.opencodian-wide-text-setting`，复用设置页长文本字段布局，让 macOS/Windows 路径 placeholder 不再挤在默认短控制列里

## 与其他模块的交互

- `src/main.ts`: 提供 `saveSettings()`、`logServerStatusSnapshot()`、`buildDiagnosticReport()`、`writeDiagnosticLogFile()` 和 build identity 文本
- `src/shared/debugModules.ts`: 提供模块注册表和刷新间隔归一化
- `src/shared/logger.ts`: 提供 `clearRecentLogs()` 和底层日志开关能力
- `src/core/types/settings.ts`: 持久化 `debugModuleSettings`、`debugRefreshIntervalMs` 和 `debugLogPaths`

## 注意事项

- 这里的模块开关只控制 `info` / `debug`；`always` / `warn` / `error` 不应被隐藏。
- 导出路径的选择、确认后持久化语义保持不变。
- 如果后续继续扩展 debug 面板，优先继续在这个 owner 收口，不要把逻辑重新散回 `OpenCodianSettings.ts`。

## 2026-05-21 Debug source IA

`attachTabbed(containerEl, secondaryTabId)` 现在按来源分区路由内容：

- `plugin` — renders the global debug toggle and plugin-internal module switches
- `opencode` — renders OpenCode backend diagnostics for server/config/model/streaming ownership
- `claude-code` — renders the Claude Code SDK diagnostics switch
- `export` — renders refresh interval, inline args, log path, diagnostic actions, and console help

The classic `attach()` method remains single-page, but it follows the same source order.

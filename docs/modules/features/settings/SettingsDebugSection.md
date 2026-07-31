# SettingsDebugSection

> 2026-07-31: The OpenCode, Codex, and Claude Code debug workbenches now use complete owners, `debug/OpenCodeDebugPanel.ts`, `debug/CodexDebugPanel.ts`, and `debug/ClaudeCodeDebugPanel.ts`. This section retains the shared source-tab shell/router, plugin export, and shared platform/path/action/module helpers. It passes narrow diagnostics ports for all three backends and has no direct trace-service, store, or report-builder access. Claude is rendered by the panel from both classic and tabbed attach; Codex remains mounted only by `attachTabbed()`, so the legacy non-tabbed attach Codex omission remains unchanged.
> 2026-07-29: OpenCode diagnostics now includes status, settings, channels, recent traces, smart copy, full export, delete and confirmed clear.
> 2026-07-30: Added a Codex diagnostics tab block mirroring the OpenCode block — status (capture enabled/disabled, storage mode, trace count, size, last error), enabled toggle, standard/full preset, five channel checkboxes (`CODEX_TRACE_CHANNEL_IDS`), custom storage directory, smart copy, full export, recent traces list with per-trace smart copy / delete, and confirmed clear. Reads `backendSettings.codex.sessionTrace` and `this.plugin.codexTraceService` (may be undefined; status/catalog rendering is null-safe).
> 2026-07-30: Added the Claude Code session-trace subsection inside the existing `claude-code` workbench. It is separate from `backendSettings.claudeCode.debugChannels`: the trace block renders mode/directory/queue/bytes/dropped/error status, enabled + off/standard/full preset, five trace-channel toggles (`CLAUDE_TRACE_CHANNEL_IDS`), storage-directory input, smart copy, latest-bundle export, clear-all confirmation, and a recent-20 trace catalog with inline copy/delete.
> 2026-07-30: The Codex shell now uses the unified `data-section-block` / `data-debug-tab-shell` markers like every other debug shell. The earlier `data-codex-section-block` / `data-codex-debug-tab-shell` special-case has been removed, so `showActiveBlock()` selects only `[data-section-block]`. Codex tab switching, the shared shell class, header, body and visual layout are unchanged.

> **源码**: `src/features/settings/SettingsDebugSection.ts`
> **状态**: [REVIEW]

## 概述

`SettingsDebugSection` 是设置页 debug 分区的共享 shell owner。它负责来源分区的 shell/router、插件导出、共享平台路径/按钮/模块 helper，并把 OpenCode、Codex、Claude Code 的完整 workbench 分别交给 `debug/OpenCodeDebugPanel`、`debug/CodexDebugPanel` 和 `debug/ClaudeCodeDebugPanel` owner 渲染。

- `Plugin` 来源分组：debug 总开关，以及 app/settings/chat/contextUsage/tasks/storage/providerIcons/visuals 等插件内部模块开关
- `OpenCode` 来源分组：由 `OpenCodeDebugPanel` 负责 server/models/streaming 等 OpenCode 后端诊断开关、trace 状态、控制项、动作和 catalog
- `Codex` 来源分组：由 `CodexDebugPanel` 负责 trace 状态、enabled/preset/channel/storage/`captureContent` 控件、动作和 catalog；当前只从 tabbed debug route 挂载
- `Claude Code` 来源分组：Claude Code SDK 诊断工作台，用于查看状态摘要、隐私边界、模块总开关、runtime/session/stream/permission/MCP/experimental 通道开关和最近 Claude Code 摘要日志；同一 block 内还承载独立的 session-trace 状态、捕获 preset、trace channel、持久化目录、智能复制/导出/清空和最近轨迹目录
- `Export` 分组：高频刷新、参数格式、日志路径、诊断动作和控制台帮助
- 高频日志刷新间隔
- inline serialized args
- 日志导出路径
- 复制诊断 / 导出日志文件
- 清空最近日志缓存
- 复制版本 / `BUILD_ID`
- 控制台打开帮助

### OpenCode panel boundary

`SettingsDebugSection` 在 classic `attach()` 和 tabbed `attachTabbed()` 两条路径中调用 `OpenCodeDebugPanel` 与 `ClaudeCodeDebugPanel`；`CodexDebugPanel` 只在 `attachTabbed()` 的 Codex shell 中调用。section 注入共享的目录选择、action button、debug-module 渲染和保存回调，以及三个 backend 的窄 diagnostics ports；因此 section 不直接访问任一 backend trace service、store 或 report builder。Claude 的 console debug channels、session-trace controls、status、actions 和 catalog 均由 `ClaudeCodeDebugPanel` 持有，section 只保留其 callbacks 与共享 helper。

当前 slice 已完成 OpenCode、Codex 与 Claude Code panel 的抽取。三条 settings composition 路径各自在边界创建三个 backend 的 diagnostics ports；Claude panel 通过窄 callbacks 接收 section-owned 的日志/导出能力，且不改变 console `debugChannels` 与 session-trace `consoleChannels` 的独立性。legacy non-tabbed attach 的 Codex omission 明确保持不变，不在本 slice 修复或删除。

## 核心逻辑

### 模块开关

section 通过 `DEBUG_MODULE_REGISTRY` 动态生成模块 toggles，并在共享 shell 中按来源过滤到 `plugin` 等仍由本 owner 路由的分组；OpenCode 的 `server` / `models` / `streaming` 与 Claude 的 `claudeCode` key 集合由对应 panel 声明并通过 callback 复用本 section 的模块渲染 helper，而不是复制 helper。这样新增 debug module 时：

1. 先改注册表
2. 在 `SettingsDebugSection` 里把 module key 放进正确来源分组
3. 对应测试也能发现映射遗漏

`claudeCode` 目前只表示 Claude Code SDK 诊断开关，文案明确说它控制 query/session/stream/permission/MCP/experimental 摘要日志，不代表 full runtime proof 已完成。

### Claude Code 诊断工作台（panel-owned）

`ClaudeCodeDebugPanel` 完整渲染 Claude Code block；section 只负责把 panel 挂入 source shell 并提供窄 callbacks。工作台渲染：

- SDK 诊断标题、说明和 backend/logging/channel/recent-log 状态条组成一个顶部设置块
- summary-only 隐私说明，明确不展示 prompt、tool input、用户答案、env 值或 secret
- `claudeCode` module 总开关
- `runtime` / `sessions` / `stream` / `permissions` / `mcp` / `experimental` 通道开关，持久化到 `backendSettings.claudeCode.debugChannels`
- 最近 20 条 Claude Code 日志预览，按 module + enabled channel 过滤
- 复制当前 Claude 日志、复制 Claude 专属 summary-only 诊断报告、清空最近日志动作

工作台视觉结构跟随 `Formatter & Language Servers > Formatters` 子标签：总开关、通道开关和日志预览使用同宽 `.opencodian-settings-block`，标题、说明和内容保持统一内边距；通道 row 使用 formatter 内置项一样的 object row 语法。复制类动作保持 CTA 权重，清空日志降为普通按钮，避免破坏调试页的信息层级。

`experimental` 通道默认关闭，只为 hooks、subagent summary、checkpoint、history 等后续 runtime-proof 诊断预留，不代表这些能力已经进入 stable UI。

### Claude Code session trace 工作台（panel-owned）

Trace 子区段紧接 Claude Code debug channel toggles，位于 logger 日志预览之前；它不改变既有 `claudeCode.debugChannels` 预览和复制行为。panel 通过 `ClaudeCodeDebugSettingsPort` 读取 `backendSettings.claudeCode.sessionTrace`，并通过可选 `ClaudeTraceDiagnosticsPort` 读取 trace service 状态，因此 service 尚未构造时仍可安全渲染。`debugChannels` 与 `sessionTrace.consoleChannels` 必须保持独立。

- 状态条显示 capture enabled/disabled、storage mode、resolved directory、queued events、estimated bytes、dropped events 和 last error。
- 控件提供 enabled 总开关、`off` / `standard` / `full` console preset、`CLAUDE_TRACE_CHANNEL_IDS` 五个 trace channel toggle，以及可选的 storage directory。路径变更沿现有 reload 提示语义保存；它与 Claude logger 的 `debugChannels` 完全独立。
- 动作提供智能报告复制、将最新 trace bundle 导出到 Debug export log directory、确认后清空全部历史。导出前要求该目录存在；没有最近轨迹时显示空态而不导出其他会话。
- 最近轨迹目录最多显示 20 条 summary 行，保留 unread-anomaly filter；每行支持 current trace smart-report copy 和删除。报告/trace service 自己负责 hardened 二次脱敏，Settings UI 不展示原始 SDK payload。
- 既有 Claude Code logger 预览仍位于 trace 子区段之后，继续按 `debugChannels` 过滤并保留“复制当前日志 / 复制 Claude 诊断 / 清空日志”动作；session trace 的 enabled 开关不会改变这些 logger 控件。

### 高频日志刷新间隔

section 直接编辑 `settings.debugRefreshIntervalMs`。logger 侧会用该值限制相同高频 payload 的重复输出频率，当前最直接受益的是 context usage 轮询日志。

### 诊断动作

- `Copy recent diagnostics`：调用 `buildDiagnosticReport('copy-diagnostics')`
- `Generate log file`：调用 `writeDiagnosticLogFile(targetDirectory, 'settings-export')`
- `Clear recent logs`：清空 logger 最近缓存
- `Copy version / BUILD_ID`：复制 `OpenCodian <version> BUILD_ID=<id>`
- 日志导出路径输入标记 `.opencodian-wide-text-setting`，复用设置页长文本字段布局，让 macOS/Windows 路径 placeholder 不再挤在默认短控制列里
- Claude Code workbench 的 `Copy Claude diagnostics` 不调用全局 `buildDiagnosticReport()`，而是在本 section 内生成仅包含 Claude Code 设置摘要和 channel-filtered Claude logs 的报告，避免把 OpenCode 或插件内部日志混入 Claude 专属隐私边界。导出前通过 `sanitizeDiagnosticReport()` 对全文执行密钥/令牌/密码净化。

## 与其他模块的交互

- `src/main.ts`: 为本 section 的 export、日志与 shared callbacks 提供 `saveSettings()`、`buildDiagnosticReport()`、`writeDiagnosticLogFile()` 和 build identity 文本；backend diagnostics 由 composition path 转成窄 port 后注入
- `src/features/settings/debug/OpenCodeDebugPanel.ts`、`CodexDebugPanel.ts`、`ClaudeCodeDebugPanel.ts` / `types.ts`: 三个完整 panel，以及对应窄 port/adapter contracts
- `src/shared/debugModules.ts`: 提供模块注册表和刷新间隔归一化
- `src/shared/diagnosticSecretSanitizer.ts`: 提供 `sanitizeDiagnosticReport()` 用于导出前密钥净化
- `src/core/agents/backend/diagnostics/ClaudeSessionTraceService.ts`: 提供 Claude trace storage status、smart report、bundle export、recent summary 与 clear-all 操作；service 内部使用 hardened redaction 和 ring/deep capture 生命周期
- `src/shared/logger.ts`: 提供 `clearRecentLogs()` 和底层日志开关能力
- `src/core/types/settings.ts`: 持久化 `debugModuleSettings`、`debugRefreshIntervalMs` 和 `debugLogPaths`

## 注意事项

- 这里的模块开关只控制 `info` / `debug`；`always` / `warn` / `error` 不应被隐藏。
- 导出路径的选择、确认后持久化语义保持不变。
- 如果后续扩展 debug 面板，shared shell/helper 继续在本 owner 收口；backend-specific panel 行为应进入对应的 `settings/debug/` owner，不要重新散回 `OpenCodianSettings.ts` 或本 section 的共享 shell。

## 2026-05-21 Debug source IA

`attachTabbed(containerEl, secondaryTabId)` 现在按来源分区路由内容：

- `plugin` — renders the global debug toggle and plugin-internal module switches
- `opencode` — renders OpenCode backend diagnostics for server/config/model/streaming ownership
- `codex` — renders the Codex session-trace workbench (status, enabled/preset/channels, capture-content toggle, storage directory, smart copy/export/clear, recent traces)
- `claude-code` — renders the Claude Code SDK diagnostics workbench with status, channel switches, log preview, and copy/clear actions
- `export` — renders refresh interval, inline args, log path, diagnostic actions, and console help

The classic `attach()` method remains single-page and keeps the legacy source order, but it intentionally omits the Codex panel; only the tabbed route mounts `CodexDebugPanel`.

All five source tabs owned here render inside `.opencodian-debug-tab-shell`, a shared shadcn-inspired settings shell that provides a compact header, muted description, badge rail, and neutral body stack. Plugin/OpenCode module groups still use shared Setting rows, Codex/Claude Code keep their workbench controls and filtered log preview, and Export keeps refresh/path/action/help controls without changing persistence or copy/export behavior.

In tabbed mode the shell owns the tab title and intro copy. Child blocks must not repeat the same title or description inside the body; module rows, status strips, privacy notes, channel controls, logs, and export actions should start directly after the shell header unless they introduce a genuinely different subsection.

Ordinary Debug rows are intentionally neutral Field rows, not accent/object cards. The global logging switch, module toggles, channel toggles, export inputs, and action rows must not receive purple/violet/accent classes, object-card borders, or fixed-width control columns that can push the settings modal wider than its viewport. Claude Code status entries are muted metadata rows and are not reused as debug tab badges.

## 2026-06-29 Debug source-tab visual refactor

The Debug primary tab has six secondary tabs in `settingsLayoutRegistry.ts`: `plugin`, `opencode`, `codex`, `claude-code`, `export`, and `capability-lab`. The first five are owned here; `capability-lab` is owned by `SettingsCapabilityLabSection`.

The first five tabs borrow shadcn/Radix component structure as DOM/CSS vocabulary only: Card-like shell, Field rows, Badge chips, Button groups, ScrollArea-like log preview, and Alert-like console/privacy notes. No React, Radix, Tailwind, or shadcn dependency is introduced.

Behavior remains unchanged:

- all tab ids and `[data-section-block]` values are preserved
- global logging and module/channel toggles write the same settings keys
- Claude Code copy actions still use the summary-only diagnostic report path
- export actions still call `buildDiagnosticReport()` / `writeDiagnosticLogFile()` with the same sources

## 2026-07-29 OpenCode diagnostics workbench

OpenCode tab adds an OpenCode-only session trace workbench: enabled/preset/six channels, storage directory/status/occupancy, historical-anomaly filter, recent trace copy/export/delete and separately confirmed clear-all. The catalog keeps read historical anomalies visible, while chat badges and smart-report selection use highest unread severity. Smart copy prompts for optional actual/expected/reproduction context; custom directory changes explicitly require reload. These controls do not change Claude Code, Codex or ACP logging.

# SettingsSecuritySection

> **源码**: `src/features/settings/SettingsSecuritySection.ts`
> **状态**: [REVIEW]

## 概述

`SettingsSecuritySection.ts` 是设置页 Security 分区的专属 owner。它从 `OpenCodianSettings` 主类中接管了这块 section 的完整 lifecycle，包括：

- `.opencode/opencode.json` 的 config status 检查与状态样式
- permission template 写回后的 config-status 刷新与 auto-restart 判定
- config editor / apply-and-restart 动作
- blocklist、external-access reminder、saved external paths 与平台 blocked commands 的输入装配

目标不是拆薄 helper，而是把一整块 security/config DOM、status 与 restart 责任收口到单独 owner，避免 `OpenCodianSettings` 继续直接持有大段 security section 组装逻辑。

## 核心逻辑

### 挂载与配置状态

- `attach()` 负责创建 section heading，并在 vault path 可用时初始化 `OpencodeConfigManager`
- config status setting 会异步读取 `.opencode/opencode.json`，先做 **精确模板匹配**（YOLO / ask-by-default / review），否则回退为自定义规则摘要，而不是再用“只要有 deny 就算 plan”这种模糊判定
- custom status 会在同一条状态文案里提示 task allowlist、external_directory 规则或其他 patterned rules，避免把上游规则系统误报成 OpenCodian 自定义模板
- 如果当前环境拿不到 vault path，仍保持只渲染一条本地化的 “vault path unavailable” 状态，而不继续装配其余 security 控件

### Permission 与重启

- permission template 下拉仍只写回插件设置，让宿主 `saveSettings()` 负责同步项目级 `.opencode` config
- mode 写回后会立即刷新 config status，并继续沿用“未开启自动重启时只提示手动重启”的旧行为
- auto restart 仍只在 local server 且健康检查通过时执行；remote 模式继续提示不可管理，不会擅自改动 remote-manage 语义
- config editor tooltip、restart 按钮文本和 restart notice 现已全部走 locale keys，不再硬编码英文
- `Restart service` 按钮继续保留“运行中则 stop → wait → start，未运行则直接 start”的旧流程

### Blocklist 与导出路径

- export paths 与 blocked commands 仍按逐行 trim + 去空行的旧规则写回
- `allowExternalAccess` / `allowedExportPaths` 在这一轮被明确成 **插件侧 reminder / helper 文案**：它们不会假装替代 `.opencode` 里的 `external_directory` 权限规则
- blocked commands 仍按当前平台优先显示 Unix 或 Windows 输入框，并在保存插件设置后同步写入当前项目 `.opencode/opencode.json` 的 `permission.bash` deny patterns
- 同步 blocked commands 时会通过 `OpencodeConfigManager.syncManagedBashDenyPatterns()` 维护插件上一轮管理的 deny pattern：保留用户自定义的 `permission.bash` 默认值、allow/ask/deny pattern 和其他 `permission` 字段，只替换插件文本框对应的旧 deny 项
- blocked commands 同步成功后会复用权限变更的 auto-restart 策略：开启自动重启且当前是本地运行服务时执行 stop → wait → start；未开启时提示手动重启；remote 模式提示插件无法管理远程服务
- 如果当前 vault path / config manager 不可用，blocked commands 仍会保存到插件设置，并通过 Notice 与日志提示无法同步 OpenCode bash 权限
- blocked commands 文案明确这是 OpenCode bash permission 同步，不是操作系统级沙箱
- blocked commands setting 带有帮助按钮，打开 `OpenCodeProjectConfigHelpModal` 解释 `permission.bash` deny pattern、能力边界和官方 permissions/tools 文档链接
- Windows 下仍额外显示 Unix blocklist，因为 Git Bash 仍可能执行 Unix 命令

## 关键方法

| 方法 | 说明 |
|------|------|
| `attach()` | 挂载整个 security section，并触发初次 config status 刷新 |
| `updatePermissionMode()` | 写回 permission template、刷新 config status，并按设置决定是否自动重启 |
| `applyConfigRestart()` | 执行 config file 区块的 apply-and-restart 动作 |
| `syncBlockedCommands()` | 把 blocked commands 同步为 OpenCode `permission.bash` deny patterns，失败时保留插件设置并提示 |

## 与其他模块的交互

- `OpenCodianSettings`: 创建该 owner，自身只保留 section heading 装配入口
- `OpencodeConfigManager`: 提供 `.opencode/opencode.json` 的读取、路径信息，以及 blocked commands → bash deny patterns 的合并写入
- `OpenCodeService`: 提供重启所需的 `checkHealth()`、`stop()`、`start()` runtime API
- `OpencodeConfigModal`: config file 编辑按钮对应的弹窗入口
- `OpenCodeProjectConfigHelpModal`: 为 blocked commands / `permission.bash` 提供用户可读解释和官方文档链接

## 注意事项

- 这里的 owner seam 必须继续保留 permission writeback、auto-restart 条件、remote-manage 限制与平台 blocklist 语义
- 该 section 当前是 OpenCode-owned 设置面板；permission template、config editor/apply restart、auto restart、blocklist、external access、export paths 和 blocked-command sync callback 都会在执行前重新检查 active backend。若页面在 OpenCode active 时挂载后切到 Claude Code，stale callback 只显示 Security OpenCode-only Notice，不写插件设置、不写 `.opencode/opencode.json`，也不调用 OpenCode restart/health API。
- 如果只改 security section，优先扩展这个 owner；不要再把 config-status/restart/blocklist/export-path 细节塞回 `OpenCodianSettings`

## 2026-04-24 Tabbed layout support

Added `attachTabbed(containerEl, secondaryTabId)` method for the tabbed settings layout. It routes content by secondary tab:

- `config` — renders config status + permission template + restart action
- `permissions` — renders blocklist + external access reminder + saved paths
- `safety` — renders platform blocked commands

The classic `attach()` method remains unchanged.

Security blocklist, external path, and blocked-command textareas use `TextareaSizeMemory` with stable keys so manual resize height survives settings reloads; `dispose()` cleans the attached observers.

# SettingsSecuritySection

> **源码**: `src/features/settings/SettingsSecuritySection.ts`
> **状态**: [REVIEW]

## 概述

`SettingsSecuritySection.ts` 是设置页 Security 分区的专属 owner。它从 `OpenCodianSettings` 主类中接管了这块 section 的完整 lifecycle，包括：

- `.opencode/opencode.json` 的 config status 检查与状态样式
- permission mode 写回后的 config-status 刷新与 auto-restart 判定
- config editor / apply-and-restart 动作
- blocklist、external access、export path 与平台 blocked commands 的输入装配

目标不是拆薄 helper，而是把一整块 security/config DOM、status 与 restart 责任收口到单独 owner，避免 `OpenCodianSettings` 继续直接持有大段 security section 组装逻辑。

## 核心逻辑

### 挂载与配置状态

- `attach()` 负责创建 section heading，并在 vault path 可用时初始化 `OpencodeConfigManager`
- config status setting 会异步读取 `.opencode/opencode.json`，继续沿用 `notCreated / yolo / normal / plan / custom` 的旧状态判定与 CSS class
- 如果当前环境拿不到 vault path，仍保持只渲染一条 `Vault path unavailable` 状态，而不继续装配其余 security 控件

### Permission 与重启

- permission mode 下拉仍只写回插件设置，让宿主 `saveSettings()` 负责同步项目级 `.opencode` config
- mode 写回后会立即刷新 config status，并继续沿用“未开启自动重启时只提示手动重启”的旧行为
- auto restart 仍只在 local server 且健康检查通过时执行；remote 模式继续提示不可管理，不会擅自改动 remote-manage 语义
- `Apply & Restart` 按钮继续保留“运行中则 stop → wait → start，未运行则直接 start”的旧流程

### Blocklist 与导出路径

- export paths 与 blocked commands 仍按逐行 trim + 去空行的旧规则写回
- blocked commands 仍按当前平台优先显示 Unix 或 Windows 输入框
- Windows 下仍额外显示 Unix blocklist，因为 Git Bash 仍可能执行 Unix 命令

## 关键方法

| 方法 | 说明 |
|------|------|
| `attach()` | 挂载整个 security section，并触发初次 config status 刷新 |
| `updatePermissionMode()` | 写回 permission mode、刷新 config status，并按设置决定是否自动重启 |
| `applyConfigRestart()` | 执行 config file 区块的 apply-and-restart 动作 |

## 与其他模块的交互

- `OpenCodianSettings`: 创建该 owner，自身只保留 section heading 装配入口
- `OpencodeConfigManager`: 提供 `.opencode/opencode.json` 的读取与路径信息
- `OpenCodeService`: 提供重启所需的 `checkHealth()`、`stop()`、`start()` runtime API
- `OpencodeConfigModal`: config file 编辑按钮对应的弹窗入口

## 注意事项

- 这里的 owner seam 必须继续保留 permission writeback、auto-restart 条件、remote-manage 限制与平台 blocklist 语义
- 如果只改 security section，优先扩展这个 owner；不要再把 config-status/restart/blocklist/export-path 细节塞回 `OpenCodianSettings`

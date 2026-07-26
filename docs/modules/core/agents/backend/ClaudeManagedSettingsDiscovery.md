# ClaudeManagedSettingsDiscovery

> **源码**: `src/core/agents/backend/ClaudeManagedSettingsDiscovery.ts`
> **状态**: [ACTIVE]

## 概述

`ClaudeManagedSettingsDiscovery` 是 Claude Code 操作系统托管策略文件的只读 discovery owner。它集中维护各平台的精确 filesystem policy root、`managed-settings.d` 扫描、macOS MDM plist 候选和 plist path-only inspection；`ClaudeSettingsSourceService` 只组合其结果，不重复平台路径或扫描逻辑。

## 职责

- 按平台解析默认 managed root：macOS `/Library/Application Support/ClaudeCode`、Linux `/etc/claude-code`、Windows `C:\Program Files\ClaudeCode`；不支持的平台 fail closed，不继承其他平台路径。
- 生成只读 `managed-settings.json` 候选，并只扫描 root 内受 confinement 约束的 regular `managed-settings.d/*.json` 文件。
- 在 macOS 生成 device 与当前 user 两个 `/Library/Managed Preferences/**/com.anthropic.claudecode.plist` 候选。
- plist 只做 parent-anchor confinement 与 `lstat` no-follow 检查；不读 bytes、不按 UTF-8 解码、不做 JSON 解析。

## 核心导出

| 导出 | 说明 |
|------|------|
| `ClaudeManagedSettingsDiscovery` | 托管策略候选 discovery 与 plist path-only inspection owner |
| `ClaudeManagedSettingsDiscoveryOptions` | platform、managed roots、username 和 priority 的可注入配置 |
| `ClaudeManagedSettingsSlot` | 永远 `scope=managed`、`editable=false` 的候选契约 |
| `ClaudeManagedPlistInspection` | plist 的 exists + persistence evidence 结果 |

## 导入关系

上游: Node `fs/promises`、`os`、`path`；`ProjectResourceSecureWrite.assertWithinRoot`

下游: `ClaudeSettingsSourceService`

## 维护约束

- 此 owner 仅覆盖文件系统策略来源；Windows HKLM/HKCU registry policy discovery 明确仍是 residual（本 owner 不读 registry，不能描述为完整 Windows managed-policy discovery）。
- managed 候选永远只读，不得进入可写 allowlist 或 mutation 路径。
- 明确注入的 managed path 使用 host path semantics；注入 `platform=win32` 且未覆盖 path 时必须保留 Windows separators，便于跨平台精确路径测试。

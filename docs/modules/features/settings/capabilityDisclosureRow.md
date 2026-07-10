# capabilityDisclosureRow

> **源码**: `src/features/settings/capabilityDisclosureRow.ts`
> **状态**: [REVIEW]

## 概述

Shared helper that renders read-only SDK capability disclosure rows inside existing Settings sections. Each row shows a capability's availability status (available / unsupported-by-server / disabled-by-user / unsupported-by-sdk / unknown), the redacted reason, and a shared "Re-check" button that re-probes server support.

## 核心逻辑

- `renderCapabilityDisclosureRows(containerEl, plugin, capabilityIds, options?)` 对每个 capability id 调用 `plugin.openCodeService.requireSdkCapability(id)`，渲染状态徽章 + 脱敏原因 + 禁用/启用状态。
- unsupported 行始终可见（不隐藏），action button 在 unsupported 时 disabled。
- Re-check 按钮调用 `refreshSdkCapabilities()` 并幂等重渲染。
- 只显示 availability result 的 `reason` / `minimumServerHint`，绝不显示 secrets、tokens 或原始 server 错误。

## 与其他模块的交互

- 被 `SettingsServerSection`、`SettingsAgentsSection`、`SettingsCommandsSection`、`SettingsSkillSection`、`SettingsSecuritySection`、`SettingsMcpSection`、`SettingsModelSection` 调用。
- 通过 `OpenCodeService.requireSdkCapability()` 与 `refreshSdkCapabilities()` 获取能力真相。

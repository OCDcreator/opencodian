# AgentSwitcherChips

> **源码**: `src/features/settings/AgentSwitcherChips.ts`
> **状态**: [REVIEW]

## 概述

`AgentSwitcherChips` 是旧版 tabbed settings 标题下方 enabled agent 快速切换 chip 行 renderer。当前稳定设置页已改为标题行内的 icon-only switcher；本模块保留为兼容实现，不再由 `SettingsTabbedRenderer` 挂载。

## 职责

- 当 enabled agent 少于两个时不渲染切换 UI
- 按 `SettingsBackendSection.BACKEND_OPTIONS` 的顺序展示 agent 名称
- 用 `activeBackend` 派生的 `selectedAgent` 标记当前 chip
- 点击 chip 后把选中的 agent 回传给 `SettingsTabbedRenderer` 统一持久化与刷新

## 集成

- `SettingsTabbedRenderer`: 不再调用本 renderer；active backend switcher 现在由 `AgentSwitcherFloatingIcons.renderAgentSwitcherHeaderIcons()` 挂在 `.opencodian-settings-panel-title-actions`，并保留 `renderAgentSwitcherFloatingIcons()` 作为左侧可收缩图标 rail
- `SettingsBackendSection.BACKEND_OPTIONS`: 复用 agent id 与 locale key，避免重复维护显示名称

# AgentSwitcherChips

> **源码**: `src/features/settings/AgentSwitcherChips.ts`
> **状态**: [REVIEW]

## 概述

`AgentSwitcherChips` 渲染 tabbed settings 标题下方的 enabled agent 快速切换 chip 行。它只负责纯前端导航，不启动或切换 runtime。

## 职责

- 当 enabled agent 少于两个时不渲染切换 UI
- 按 `SettingsBackendSection.BACKEND_OPTIONS` 的顺序展示 agent 名称
- 用 `activeBackend` 派生的 `selectedAgent` 标记当前 chip
- 点击 chip 后把选中的 agent 回传给 `SettingsTabbedRenderer` 统一持久化与刷新

## 集成

- `SettingsTabbedRenderer`: 在一级 tab bar 之前调用本 renderer
- `SettingsBackendSection.BACKEND_OPTIONS`: 复用 agent id 与 locale key，避免重复维护显示名称

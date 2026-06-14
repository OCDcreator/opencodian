# SettingsTabbedHeader

> **源码**: `src/features/settings/SettingsTabbedHeader.ts`
> **状态**: [REVIEW]

## 概述

`SettingsTabbedHeader` 负责 tabbed settings 每次重渲染前的标题区整理。它保留 `SettingsPanelChrome` 已经生成的 `.opencodian-settings-panel-title` 品牌标题，并把 active backend switcher 挂到同一标题行里的 action slot。

## 职责

- 保留 `.opencodian-settings-panel-title`，避免 tabbed renderer 清空 OpenCodian logo / wordmark
- 移除 tabbed renderer 上一次生成的正文 DOM，防止一级 / 二级标签切换时残留旧内容
- 清理旧 `.opencodian-settings-panel-title-actions`，避免 repeated render 累积重复 backend switcher
- 当 enabled backend 至少两个时，在品牌标题后创建 `.opencodian-settings-panel-title-actions`
- 调用 `AgentSwitcherFloatingIcons.renderAgentSwitcherHeaderIcons()` 渲染 icon-only backend switcher

## 集成

- `SettingsTabbedRenderer`: 在计算当前 active backend 与 enabled backend 后调用 `refreshSettingsTabbedHeader()`
- `SettingsPanelChrome`: 先创建品牌标题 DOM，本模块只复用与补充 action slot
- `AgentSwitcherFloatingIcons`: 提供实际 backend icon button 渲染与点击回调

## 修改注意点

- 本模块只处理 tabbed settings 的标题行和 renderer 自有正文 DOM，不应创建一级 / 二级 tab，也不应直接路由内容 section。
- 标题行 action slot 是 active backend 快速切换入口，不替代 `SettingsBackendSection` 的启用 / 禁用 backend 管理。

# AgentSwitcherFloatingIcons

> **源码**: `src/features/settings/AgentSwitcherFloatingIcons.ts`
> **状态**: [REVIEW]

## 概述

`AgentSwitcherFloatingIcons` 渲染 tabbed settings 左侧边缘的悬浮 agent 图标组。它是绝对定位 overlay，不参与设置页主布局。

## 职责

- 当 enabled agent 少于两个时不渲染悬浮切换 UI
- 为左侧 80px hover 区和垂直图标组创建 DOM
- 用 Obsidian `setIcon()` 绑定 OpenCode、Claude Code、Codex、Copilot 和 Pi 的 Lucide 图标
- 为 entry/click 动画添加短生命周期 CSS class，持久 idle/hover/selected 效果交给 CSS
- 点击图标后把选中的 agent 回传给 `SettingsTabbedRenderer` 统一持久化与刷新

## 集成

- `SettingsTabbedRenderer`: 在 tabbed settings 容器内创建悬浮 overlay
- `src/style/components/agent-switcher.css`: 定义 hover reveal、staggered entry、idle float、hover、click bounce 和 selected 样式

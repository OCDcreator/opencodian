# AgentSwitcherFloatingIcons

> **源码**: `src/features/settings/AgentSwitcherFloatingIcons.ts`
> **状态**: [REVIEW]

## 概述

`AgentSwitcherFloatingIcons` 渲染 tabbed settings 左侧边缘的悬浮 agent 图标组。它是绝对定位 overlay，不参与设置页主布局。

## 职责

- 当 enabled agent 少于两个时不渲染悬浮切换 UI
- 为左侧隐藏占位和垂直图标组创建 DOM；占位不再承担 hover 触发
- 优先从 `lobehubIconManifest.ts` 为 OpenCode、Claude Code、Codex、Copilot 和 Pi 渲染静态 LobeHub 图标，并分别写入 light/dark 图片资源
- 当 LobeHub manifest 缺少可用静态资源时，回退到 Obsidian `setIcon()` 的 Lucide 图标
- 将图标组 portal 到 `document.body`，并根据设置页容器 `getBoundingClientRect().left` 写入 `--opencodian-agent-switcher-fixed-left`，让图标组固定在当前设置 pane 左边缘，不随正文滚动
- 为 entry/click 动画添加短生命周期 CSS class，持久 idle/hover/selected 效果交给 CSS
- 点击图标后把选中的 agent 回传给 `SettingsTabbedRenderer` 统一持久化与刷新

## 集成

- `SettingsTabbedRenderer`: 在 tabbed settings 容器内创建悬浮 overlay
- `src/utils/icons/lobehubIconManifest.ts`: 提供 LobeHub 图标分级、格式和明暗资源 URL
- `src/style/components/agent-switcher.css`: 定义 hover reveal、staggered entry、idle float、hover、click bounce、selected 样式和 light/dark 图标切换

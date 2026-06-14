# AgentSwitcherFloatingIcons

> **源码**: `src/features/settings/AgentSwitcherFloatingIcons.ts`
> **状态**: [REVIEW]

## 概述

`AgentSwitcherFloatingIcons` 集中维护 settings backend switcher 的图标渲染。它保留旧的左侧悬浮图标组 renderer，同时提供标题行内的 icon-only backend switcher。

## 职责

- 当 enabled agent 少于两个时不渲染悬浮切换 UI
- 为左侧隐藏占位和垂直图标组创建 DOM；占位不再承担 hover 触发
- `renderAgentSwitcherHeaderIcons()` 在传入容器内渲染 `.opencodian-agent-switcher-header-icons`，每个 enabled backend 使用一个 `.opencodian-agent-switcher-header-icon` button，并写入 `aria-label`、`aria-pressed` 和 `title`
- 优先从 `lobehubIconManifest.ts` 为 OpenCode、Claude Code、Codex、Copilot 和 Pi 渲染静态 LobeHub 图标，并分别写入 light/dark 图片资源
- 当 LobeHub manifest 缺少可用静态资源时，回退到 Obsidian `setIcon()` 的 Lucide 图标
- 将图标组 portal 到 `document.body`，并根据设置页容器 `getBoundingClientRect().left` 写入 `--opencodian-agent-switcher-fixed-left`，让图标组固定在当前设置 pane 左边缘，不随正文滚动
- 为 entry/click 动画添加短生命周期 CSS class，持久 idle/hover/selected 效果交给 CSS
- 点击图标后把选中的 agent 回传给 `SettingsTabbedRenderer` 统一持久化与刷新

## 集成

- `SettingsTabbedRenderer`: 在 `.opencodian-settings-panel-title-actions` 内挂载 header icon switcher，同时保留左侧可收缩 floating icon rail；两个入口共享同一套 backend 切换回调
- `src/utils/icons/lobehubIconManifest.ts`: 提供 LobeHub 图标分级、格式和明暗资源 URL
- `src/style/components/agent-switcher.css`: 定义 header icons、legacy hover reveal、click feedback、selected 样式和 light/dark 图标切换

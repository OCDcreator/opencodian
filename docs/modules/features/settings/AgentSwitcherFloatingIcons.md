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
- `renderAgentSwitcherBackendIcon()` 为其他 settings surfaces 提供同源 backend 图标渲染入口，例如 ACP preset buttons 可以复用标题行/后端选择器的 LobeHub 图标身份，而不是重新指定一套 provider SVG 资产
- 当 LobeHub manifest 缺少可用静态资源时，回退到 Obsidian `setIcon()` 的 Lucide 图标
- 将图标组 portal 到 `document.body`，并根据设置页容器 `getBoundingClientRect().left` 写入 `--opencodian-agent-switcher-fixed-left`，让图标组固定在当前设置 pane 左边缘，不随正文滚动
- editor-area 设置页可能先在 detached DOM 中完成渲染、随后才接入 workspace；floating rail 会等待锚点第一次真正连接后再启用断开销毁判定，并在首次连接时重新同步左边缘位置，避免初始化阶段被 MutationObserver 误清理
- 当设置页运行在 Obsidian 原生 `.modal.mod-settings` 内时，不渲染 legacy floating rail；该场景只使用标题行 backend switcher，避免 body-level fixed rail 压到 Obsidian 设置左侧插件列表
- 图标组使用 `z-index: 50` 对齐 Obsidian modal layer；当用户从 settings 打开帮助 modal、详情 modal、其他非 `.mod-settings` 子对话框，或调试/Obsidian 原生设置打开了与当前 editor-area settings 无关的 `.mod-settings` 前景窗口时，rail 会写入 `aria-hidden="true"` / `.is-hidden-behind-modal` 并隐藏，避免 body-level rail 穿到前景窗口上方
- 为 entry/click 动画添加短生命周期 CSS class，持久 idle/hover/selected 效果交给 CSS
- 点击图标后把选中的 agent 回传给 `SettingsTabbedRenderer` 统一持久化与刷新

## 集成

- `SettingsTabbedRenderer`: 在 `.opencodian-settings-panel-title-actions` 内挂载 header icon switcher，同时保留左侧可收缩 floating icon rail；两个入口共享同一套 backend 切换回调
- `SettingsAcpSection`: 对 OpenCode、Codex、Claude Code 预设按钮调用 `renderAgentSwitcherBackendIcon()`，保证 ACP create card 与设置页 backend selector 使用同一套 backend 图标身份
- `src/utils/icons/lobehubIconManifest.ts`: 提供 LobeHub 图标分级、格式和明暗资源 URL
- `src/style/components/agent-switcher.css`: 定义 header icons、legacy hover reveal、click feedback、selected 样式和 light/dark 图标切换

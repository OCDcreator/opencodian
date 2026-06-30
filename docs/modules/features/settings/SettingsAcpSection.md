# SettingsAcpSection

> **源码**: `src/features/settings/SettingsAcpSection.ts`
> **状态**: [REVIEW]

## 概述

`SettingsAcpSection` 是设置页 `ACP Agents` 一级标签的 section owner。它负责管理保存在插件设置中的 ACP agent 配置列表，并提供 OpenCode、Codex、Claude Code 三个常用预设。

本轮 UI 收敛后，ACP Agents 不再渲染 legacy `opencodian-settings-block` 外层卡片，而是使用 `opencodian-settings-extension-shell opencodian-acp-settings-shell` 作为布局 shell。顶部创建区使用 shadcn-style `CardHeader / CardContent` 结构，列表使用 row-card、badge、scroll-list、field-group 视觉语言，但不改变 ACP agent 保存格式或 CRUD 逻辑。

## 核心逻辑

### Agent CRUD

- `Custom agent` 按钮创建空白 agent 配置。
- 预设按钮（OpenCode、Codex、Claude Code）创建对应 command / args 的 agent 配置，排列在 `opencodian-acp-create-card` 内。该 create card 固定为 header + actions content：header 左侧显示标题/说明，右侧显示 `opencodian-acp-create-count-badge`；actions 使用 `opencodian-acp-create-actions` 的 primary action + preset rail 结构，避免把四个入口铺成等权重按钮宫格。
- 预设按钮图标通过 `renderAgentSwitcherBackendIcon()` 复用设置页后端选择器的 LobeHub 图标身份（OpenCode=`opencode`、Codex=`codex`、Claude Code=`claudecode`）。自定义代理使用同尺寸 fallback glyph，保持按钮 rhythm 一致。
- 每张 agent row-card 支持 enabled toggle、name、command、args、cwd 编辑和 remove 操作。
- Agent 列表使用共享 ScrollArea root / viewport / content 结构。`opencodian-acp-agent-list` 保留 `role="list"` 并对齐顶部 create card 外宽；agent row-cards 渲染在 content track 内，滚动条 gutter 不再压缩 card 宽度。
- Agent row 使用 `opencodian-acp-agent-row-card` CSS 类，并设置 `role="listitem"`、`data-acp-agent-id` 和 `data-acp-agent-enabled`。顶部 `opencodian-acp-agent-card-header` 展示名称、enabled/disabled badge、命令摘要、启用开关和移除动作，字段区使用 `opencodian-acp-field-group` 的 label-above-input field grid。
- Enabled toggle 更新后会同步更新 `data-acp-agent-enabled` 与 `opencodian-acp-agent-status-badge`，不需要重建整张 row。
- 新增、预设新增和移除 agent 都会局部重建 ACP body。`rerender()` 会在重建前捕获外层设置滚动容器，并在下一帧恢复 `scrollTop`，避免点击 preset 按钮后设置页向上跳。

### 保存路径

所有修改直接更新 `plugin.settings.acpAgents`，并通过公开的 `plugin.saveSettings()` 持久化，保持与其他设置 section 一致。

## 与其他模块的交互

- `src/features/settings/SettingsTabbedRenderer.ts`: 路由 `acp` 一级标签并调用 `attachTabbed()`。
- `src/core/types/settings.ts`: 提供 `AcpAgentConfig` 类型和 `acpAgents` 设置槽位。
- `src/i18n/locales/en.ts` / `src/i18n/locales/zh.ts`: 提供 section label、字段名和空状态文案。

## 注意事项

- 该 section 只管理配置，不启动 ACP 进程，也不维护连接状态。
- `args` 目前按空白分割，适合简单命令参数；复杂 shell quoting 应由后续专门 editor 处理。
- ACP 视觉层借鉴 shadcn Card、Badge、Button、Switch、ScrollArea 和 Alert 结构，但仍使用 Obsidian `Setting`、原生 DOM 与 `settings-layout-contract.css`，不引入新依赖。

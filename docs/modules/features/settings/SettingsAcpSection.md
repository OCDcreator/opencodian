# SettingsAcpSection

> **源码**: `src/features/settings/SettingsAcpSection.ts`
> **状态**: [REVIEW]

## 概述

`SettingsAcpSection` 是设置页 `ACP Agents` 一级标签的 section owner。它负责管理保存在插件设置中的 ACP agent 配置列表，并提供 OpenCode、Codex、Claude Code 三个常用预设。

## 核心逻辑

### Agent CRUD

- `Custom agent` 按钮创建空白 agent 配置。
- 预设按钮（OpenCode、Codex、Claude Code）创建对应 command / args 的 agent 配置，排列在 `opencodian-acp-preset-rail` 内，并带有简短说明。
- 每张 agent card 支持 enabled toggle、name、command、args、cwd 编辑和 remove 操作。
- Agent card 使用 `opencodian-acp-agent-card` CSS 类，顶部 `opencodian-acp-agent-card-header` 展示名称、命令摘要、启用开关和移除动作，字段区继续用 label-above-input 的 stacked form 布局。
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

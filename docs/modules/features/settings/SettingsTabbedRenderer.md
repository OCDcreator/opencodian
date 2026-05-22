# SettingsTabbedRenderer

> **源码**: `src/features/settings/SettingsTabbedRenderer.ts`
> **状态**: [REVIEW]

## 概述

`SettingsTabbedRenderer.ts` 负责标签布局模式下的标签栏渲染与内容路由。它从 `OpenCodianSettings.ts` 中提取，以控制主文件的代码行数。

## 职责

- 渲染标题下方的 agent switcher chips、一级标签栏和更轻量的二级标签栏
- 根据当前 `activeBackend` 过滤声明了 `backendRequired` 的一级/二级标签，避免启用多个 backend 时互相暴露专属设置
- 根据当前激活标签路由到对应的 section content panel
- 处理一级/二级标签切换并持久化停留位置
- 处理 agent switcher 的 `activeBackend`、`AgentServiceRegistry.setActive()` 同步与对应 backend 标签入口持久化
- 为每个 section 创建对应的 section owner 实例并调用 `attachTabbed()`

## 依赖注入

通过 `TabRendererDependencies` 接口接收所有外部依赖，避免直接依赖 `OpenCodianSettingTab`。依赖包括：

- 创建 heading、settings block、帮助按钮等共享 UI 回调
- settings block 回调透传 `descriptionPlacement`，让具体 section 可以选择把 collapsible block 的说明放在 summary 或底部 footer
- 模型/服务器状态回调
- section owner 实例注册回调
- 用户设置 content panel 渲染回调（单一 seam，具体 profile/prompt/tags 路由留给 `SettingsUserSection`）
- `General` 合并面板里的布局模式渲染回调
- `General` 合并面板里的语言切换渲染回调
- `General` 合并面板里的 editor-area settings 开关渲染回调，实际保存逻辑留在 settings shell

## 标签导航

- `renderDisplay(containerEl)`: 完整渲染标签布局（agent switcher overlay/chips + 一级栏 + 二级栏 + 内容面板）
- `switchToPrimaryTab(primaryTabId, secondaryTabId?)`: 切换一级标签并持久化
- 内部 `switchSecondaryTab()`: 切换二级标签并持久化

## 内容路由

`renderContent()` 根据 `primaryTabId` 分发到对应 section 的 tabbed 渲染。`server` 现在只保留 `connection` / `auth` / `status` 三个二级标签；`claude-code` 路由到 `SettingsClaudeCodeSection`，提供 Claude Code adapter 配置基础和 runtime diagnostics，但只有 Claude Code 是当前 active backend 时才显示。`debug` 的 `capability-lab` 二级标签路由到 `SettingsCapabilityLabSection`，提供 SDK 能力矩阵、JSONL 历史浏览器、子代理浏览器、回退 dry-run 预览、结构化输出实验场和发现状态面板（全部为 diagnostic/experimental）。`MCP` 已提升为独立一级标签，并单独路由到 `SettingsMcpSection`。`skills` 标签路由到 `SettingsSkillSection`，负责技能目录与 `skill` 权限入口；`tools` 标签路由到 `SettingsToolSection`，根据 `secondaryTabId` 选择 `builtin` 或 `custom` 模式渲染；`acp` 标签路由到 `SettingsAcpSection`，负责 ACP agent 配置 CRUD。`formatter` 标签路由到 `SettingsFormatterSection`，该 section 自行处理 overview/config 两个二级面板的渲染。`user` 标签通过 `renderUserContent(containerEl, secondaryTabId)` 委托回 `SettingsUserSection`，renderer 不直接了解 profile/prompt/tags 的具体字段渲染。`general` 是一个特殊主类目：`basic` 二级标签直接在一张合并卡片里同时渲染 `settingsLayoutMode`、语言切换与 editor-area settings 开关；`backend` 二级标签委托给 `SettingsBackendSection` 管理 backend enablement；`MCP` 现在也不再显示单独的二级标签条，而是直接展示自己的内容面板。

`backendRequired` 在 tabbed layout 中表达的是“active-backend 所属设置面”，不是“enabled-backends 中任一启用即可显示”。因此 OpenCode active 时会显示 OpenCode 专属的 server/model/agents/commands/MCP 等设置并隐藏 Claude Code；Claude Code active 时会显示 Claude Code 设置并隐藏 OpenCode 专属设置。agent switcher 切换时必须同时写入 `settings.activeBackend` 和 registry active backend，让聊天 view 的 active-backend change 监听能够切换会话表面。

Debug 的 `capability-lab` 二级标签路由到 `SettingsCapabilityLabSection`，提供诊断/实验性 SDK 能力检查界面（能力矩阵、JSONL 历史浏览器、子代理浏览器、rewind dry-run 预览、结构化输出实验场、发现状态），全部标记为 DIAGNOSTIC / EXPERIMENTAL / NOT STABLE，不连接稳定设置持久化。当 `secondaryTabId === 'capability-lab'` 时，`renderDebugContent` 直接创建 `SettingsCapabilityLabSection` 实例并调用 `attachTabbed()`，不经过 `SettingsDebugSection`。

标签内容始终渲染进 `.opencodian-settings-content-shell`。这个 shell 只承担结构职责，并通过 `data-primary-tab` / `data-secondary-tab` 暴露当前路由给样式和测试使用；它不能被设计成重型卡片。可见的内容层级应由 `SettingsPanelChrome.createSettingsBlock()` 生成的共享 settings section block，或兼容的 section-local block 承担。agent switcher 的 floating icons 是容器级绝对定位 overlay，不进入 content shell，也不应影响标签和内容布局流。

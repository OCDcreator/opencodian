# SettingsTabbedRenderer

> **源码**: `src/features/settings/SettingsTabbedRenderer.ts`
> **状态**: [REVIEW]
> **Updated**: 2026-06-14 — moved active backend switching into the settings title row

## 概述

`SettingsTabbedRenderer.ts` 负责标签布局模式下的标签栏渲染与内容路由。它从 `OpenCodianSettings.ts` 中提取，以控制主文件的代码行数。

## 职责

- 渲染标题行里的 agent icon switcher、一级标签栏和更轻量的二级标签栏
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
- 独立版本管理卡片的渲染回调；它位于 General > Basic 合并基础卡片之后，而不是卡片内部

## 标签导航

- `renderDisplay(containerEl)`: 完整渲染标签布局（保留 `.opencodian-settings-panel-title`，刷新标题行内 backend icon switcher + 一级栏 + 二级栏 + 内容面板）。每次渲染前只移除 tabbed renderer 自己创建的正文 DOM，并清理旧 `.opencodian-settings-panel-title-actions`，避免 tab 切换时旧 section DOM 残留，同时保留 `SettingsPanelChrome` 生成的 OpenCodian logo / wordmark。
- `switchToPrimaryTab(primaryTabId, secondaryTabId?)`: 切换一级标签并持久化
- `syncToActiveBackend(activeBackend)`: 定位到该 backend 的专属一级标签并恢复已保存的二级标签；只更新内存态，供统一重绘前调用
- 内部 `switchSecondaryTab()`: 切换二级标签并持久化

## 内容路由

`renderContent()` 根据 `primaryTabId` 分发到对应 section 的 tabbed 渲染。`server` 现在只保留 `connection` / `auth` / `status` 三个二级标签；`claude-code` 路由到 `SettingsClaudeCodeSection`，提供 Claude Code adapter 配置基础和 runtime diagnostics，但只有 Claude Code 是当前 active backend 时才显示。`debug` 的 `capability-lab` 二级标签路由到 `SettingsCapabilityLabSection`；该 section 内部再提供 Claude Code / OpenCode / Codex manual-activation backend tabs。Claude Code 拥有深诊断，OpenCode 只展示安全 capability snapshot/refresh/export，Codex 只展示自身矩阵；未访问 panel 惰性挂载。`MCP` 已提升为独立一级标签，并单独路由到 `SettingsMcpSection`。`skills` 标签路由到 `SettingsSkillSection`，负责技能目录与 `skill` 权限入口；`tools` 标签路由到 `SettingsToolSection`，根据 `secondaryTabId` 选择 `builtin` 或 `custom` 模式渲染；`acp` 标签路由到 `SettingsAcpSection`，负责 ACP agent 配置 CRUD。`formatter` 标签路由到 `SettingsFormatterSection`，该 section 自行处理 overview/config 两个二级面板的渲染。`user` 标签通过 `renderUserContent(containerEl, secondaryTabId)` 委托回 `SettingsUserSection`，renderer 不直接了解 profile/prompt/tags 的具体字段渲染。`general` 是一个特殊主类目：`basic` 二级标签在一张合并基础卡片里渲染 `settingsLayoutMode`、语言切换与 editor-area settings 开关，并将 `SettingsPluginUpdateSection` 作为紧随其后的独立 sibling card；`backend` 二级标签委托给 `SettingsBackendSection` 管理 backend enablement；`MCP` 现在也不再显示单独的二级标签条，而是直接展示自己的内容面板。

Tabbed plugin 内容创建 `SettingsPluginSection` 后，必须通过 `setPluginSection()` 把 owner 注册回标准 settings tab 或 editor-area settings view。这样下一次一级/二级标签重绘会先调用旧 owner 的 `dispose()`，释放唯一的 SDK plugin evidence observer；不能只替换 DOM，否则再次进入 Overview 会触发重复 observer 拒绝。Codex Account 内容同样会通过 `setCodexSection()` 注册 owner，确保每次重绘或关闭前取消账号卡片的 Codex `connected` 监听。

`backendRequired` 在 tabbed layout 中表达的是“active-backend 所属设置面”，不是“enabled-backends 中任一启用即可显示”。因此 OpenCode active 时会显示 OpenCode 专属的 server/model/agents/commands/MCP 等设置并隐藏 Claude Code；Claude Code active 时会显示 Claude Code 设置并隐藏 OpenCode 专属设置。agent switcher 切换时必须同时写入 `settings.activeBackend` 和 registry active backend，让聊天 view 的 active-backend change 监听能够切换会话表面。

同一个 registry 事件也会刷新已打开的 editor-area settings view：每个 leaf 在重绘前调用 `syncToActiveBackend()`，因此 Claude Code 的 `tools` 页面切到 Codex 时会进入 Codex 已保存的二级页（或 `connection` 默认页），不会因旧页不可见而退回 General。

## 2026-07-28 General version-management seam

`TabRendererDependencies.renderPluginUpdateSection()` is called from the tabbed `general/basic` content after the merged base-settings card has been created. It appends the existing `SettingsPluginUpdateSection` root directly to the content shell, so the version-management card is a sibling of `.opencodian-settings-general-merged-block`, never its descendant or a nested `opencodian-settings-block`. The renderer keeps this as a shell seam: `SettingsPluginUpdateSection` owns remote release history, local backups, confirmations, and operation state, while standard and editor-area settings shells each provide their own full redraw callback.

当 `secondaryTabId === 'capability-lab'` 时，`renderDebugContent` 直接创建 `SettingsCapabilityLabSection` 实例并调用 `attachTabbed()`，不经过 `SettingsDebugSection`。实验内容继续标记为 DIAGNOSTIC / EXPERIMENTAL / NOT STABLE；backend tab 选择会作为独立 UI preference 持久化，但不会改变 `activeBackend`、enabled backends 或实验 gate。

标签内容始终渲染进 `.opencodian-settings-content-shell`。这个 shell 只承担结构职责，并通过 `data-primary-tab` / `data-secondary-tab` 暴露当前路由给样式和测试使用；它不能被设计成重型卡片。可见的内容层级应由 `SettingsPanelChrome.createSettingsBlock()` 生成的共享 settings section block，或兼容的 section-local block 承担。active backend switcher 现在同时挂在 `.opencodian-settings-panel-title-actions` 内的 header icon buttons 与左侧可收缩 floating icon rail；两者共享同一套 `switchAgent()` 持久化、registry 同步与刷新逻辑。不再在标题下方插入 text chips。

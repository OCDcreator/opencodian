# SettingsTabbedRenderer

> **源码**: `src/features/settings/SettingsTabbedRenderer.ts`
> **状态**: [REVIEW]

## 概述

`SettingsTabbedRenderer.ts` 负责标签布局模式下的标签栏渲染与内容路由。它从 `OpenCodianSettings.ts` 中提取，以控制主文件的代码行数。

## 职责

- 渲染标题下方的一级标签栏和更轻量的二级标签栏
- 根据当前激活标签路由到对应的 section content panel
- 处理一级/二级标签切换并持久化停留位置
- 为每个 section 创建对应的 section owner 实例并调用 `attachTabbed()`

## 依赖注入

通过 `TabRendererDependencies` 接口接收所有外部依赖，避免直接依赖 `OpenCodianSettingTab`。依赖包括：

- 创建 heading、settings block、帮助按钮等共享 UI 回调
- 模型/服务器状态回调
- section owner 实例注册回调
- 用户设置 content panel 渲染回调（单一 seam，具体 profile/prompt/tags 路由留给 `SettingsUserSection`）
- `General` 合并面板里的布局模式渲染回调
- `General` 合并面板里的语言切换渲染回调

## 标签导航

- `renderDisplay(containerEl)`: 完整渲染标签布局（一级栏 + 二级栏 + 内容面板）
- `switchToPrimaryTab(primaryTabId, secondaryTabId?)`: 切换一级标签并持久化
- 内部 `switchSecondaryTab()`: 切换二级标签并持久化

## 内容路由

`renderContent()` 根据 `primaryTabId` 分发到对应 section 的 tabbed 渲染。`server` 现在只保留 `connection` / `auth` / `status` 三个二级标签；`MCP` 已提升为独立一级标签，并单独路由到 `SettingsMcpSection`。`formatter` 标签路由到 `SettingsFormatterSection`，该 section 自行处理 overview/config 两个二级面板的渲染。`user` 标签通过 `renderUserContent(containerEl, secondaryTabId)` 委托回 `SettingsUserSection`，renderer 不直接了解 profile/prompt/tags 的具体字段渲染。`general` 是一个特殊主类目：它不创建独立 section owner，也不再展示 `Basic / Language` 二级标签，而是直接在一张合并卡片里同时渲染 `settingsLayoutMode` 与语言切换；`MCP` 现在也不再显示单独的二级标签条，而是直接展示自己的内容面板。`general` 继续和 `style` / `plugins` / `model` / `formatter` 一样，不再套 `.opencodian-settings-tab-panel` 外层壳，避免出现额外边框与不对称留白。

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
- 用户设置渲染回调
- `General` 合并面板里的布局模式渲染回调
- `General` 合并面板里的语言切换渲染回调

## 标签导航

- `renderDisplay(containerEl)`: 完整渲染标签布局（一级栏 + 二级栏 + 内容面板）
- `switchToPrimaryTab(primaryTabId, secondaryTabId?)`: 切换一级标签并持久化
- 内部 `switchSecondaryTab()`: 切换二级标签并持久化

## 内容路由

`renderContent()` 根据 `primaryTabId` 分发到对应 section 的 tabbed 渲染。`general` 是一个特殊主类目：它不创建独立 section owner，也不再展示 `Basic / Language` 二级标签，而是直接在一张合并卡片里同时渲染 `settingsLayoutMode` 与语言切换；现在它和 `style` / `plugins` / `model` 一样，不再套 `.opencodian-settings-tab-panel` 外层壳，避免出现额外边框与不对称留白。`style`、`plugins`、`model` 仍是另外几个特殊分支：为了和 classic 页面保持一致，它们在 tabbed 模式下不会再套统一的 `.opencodian-settings-tab-panel` 外层壳，而是直接把对应 section 渲染到内容区。其中特别是 `model`，tabbed 只显示当前二级分组时必须隐藏整个 `.opencodian-settings-block` 外层，而不是只隐藏内部 body/details，否则未激活的 collapsible blocks 会留下底部空壳横线。其他 section 仍通过 `attachTabbed(containerEl, secondaryTabId)` 渲染对应内容。

# OpenCodianSettings

> **源码**: `src/features/settings/OpenCodianSettings.ts`
> **状态**: [REVIEW]

## 概述

`OpenCodianSettings.ts` 是插件的主设置面板。它继承 `PluginSettingTab`，负责把大量设置项组织成可导航、可恢复滚动位置、可实时刷新的 Obsidian UI。

当前文件的重点不只是“渲染设置项”，还包括：

- 设置分区导航与重建
- 设置面板滚动位置恢复
- 模型目录和可用性状态展示
- 主题预设与样式控件联动
- 服务器状态轮询
- 对多个 modal 与辅助服务的编排

## 主要分区

`display()` 会重建整个设置面板，并依次挂载这些分区：

- Language
- Server
- Model
- Conversation
- Plugins
- Security
- UI
- Style
- Debug
- User

其中最近变化较大的几块是：

- **Model**
  - 重构成“常用 / 可用范围与目录 / 配置与缓存”三段式模型中心
  - 默认聊天模型不再拆成 provider/model 两个普通下拉，而是走可搜索 picker
  - provider 级可用性开关写回 `.opencode`
  - model 级可用性开关写回插件设置 `disabledModelRefs`
  - provider 列表支持折叠、搜索、`仅看已禁用` 过滤与图标/来源 badge
  - provider icon cache / custom icon library 管理被移到高级工具区
- **Conversation**
  - `questionDisplayMode`
  - `questionCardPosition`
  - `showAnsweredQuestionCards`
  - `aiTitleModel` 的 availability-aware 选项解析与可搜索 picker
- **Style**
  - theme preset + custom overrides
  - 聊天背景图上传/调参
  - assistant metadata / time / provider-model 独立样式控制
  - 输入面板 glass refraction / liquid glass 参数

## 核心逻辑

### 面板重建

`display()` 不是局部 patch，而是清空容器后整体重建。这让语言切换、主题预设同步和复杂控件刷新更容易保持一致，但也意味着：

- DOM 引用会失效
- 滚动位置需要显式恢复
- 所有 section anchor 都要重新注册

### 模型目录与可用性控制

模型分区现在显式区分：

- 服务端是否存在某 provider/model
- 当前 source mode 下是否进入 `baseEffective`
- 插件侧是否被 `disabledModelRefs` 过滤掉

因此设置页能展示“存在但被禁用”的模型，而不只是“当前下拉可选项”。

新的结构把模型任务拆开了：

- **常用**：默认聊天模型、来源模式、刷新摘要
- **可用范围与目录**：provider accordion + 模型级开关 + local/server/effective 目录对照，三张目录摘要卡同时充当切换器；搜索框支持清空按钮与最近搜索历史
- **可用范围与目录**：provider accordion + 模型级开关 + local/server/effective/disabled 四张目录摘要卡；其中 disabled 卡会把“整 provider 被禁用”和“provider 仅禁用部分模型”区分展示
- **配置与缓存**：本地配置编辑、icon cache
- “可用范围与目录”和“配置与缓存”都是默认展开的 `details` block，用户折叠状态会写回插件设置并在下次打开时恢复

### 设置面板滚动恢复

这个文件维护了一套较完整的恢复链路：

- `settingsPanelScrollTop` 持久化到插件设置
- `prepareRestoreScrollOnNextOpen()` / `prepareScrollToServerOnNextOpen()` / `prepareScrollToModelOnNextOpen()` 在下次打开前注册意图
- `MutationObserver` + 多次延迟重试用于等待 DOM 稳定

这是最近文档里最容易漏掉的行为之一，因为它已经不只是简单的“记住 scrollTop”。

### 实时状态与节流刷新

- 服务器状态通过固定轮询刷新
- 模型加载后的 UI 刷新走 `requestAnimationFrame`
- 样式控件通过 `styleControlBindings` 统一同步，避免 theme preset 切换后控件显示滞后

## 关键方法

| 方法 | 说明 |
|------|------|
| `display()` | 重建完整设置面板 |
| `hide()` | 记录滚动位置并清理轮询/恢复任务 |
| `onModelsLoaded()` | 模型目录刷新后合并 UI 更新 |
| `scrollToServerSection()` / `scrollToModelSection()` | 跳转到指定分区 |
| `prepareRestoreScrollOnNextOpen()` | 记录下次打开时的滚动恢复目标 |
| `addModelSettings()` | 渲染模型中心，包括默认模型 picker、可用范围与目录对照，以及高级工具区 |
| `addConversationSettings()` | 渲染标题、question 和回答回顾相关设置 |
| `addStyleSettings()` | 渲染 theme preset、chat appearance、glass/liquid glass 控件 |

## 与其他模块的交互

- `ModelConfigService`: 读取 `local/server/baseEffective/effective` 目录
- `OpencodeConfigManager`: 读写 `.opencode` 配置
- `PluginManagementService`: 构建插件环境快照
- `ProviderIconService` / `ProviderIconCacheModal`: provider icon 缓存与自定义图标管理
- `ModelPickerModal`: 默认模型和 AI 标题模型共用的搜索式 picker
- `ModelConfigModal` / `ModelConfigJsonModal` / `OpencodeConfigModal`: 配置编辑入口
- `ServerSettingHelpModal` / `LiquidGlassSettingHelpModal`: 帮助说明入口
- `main.ts`: 通过 `addSettingTab()` 注册，并调用 `onModelsLoaded()` / `refreshServerStatusDisplay()`

## 注意事项

- `display()` 每次都会重建 DOM，因此不要长期持有 section 内部元素引用。
- 样式分组和默认值最终都以 `core/types/settings.ts` 的归一化逻辑为准。
- 这个文件同时处理“运行时 UI 状态”和“持久化设置”，两者不要混淆。
- 任何新增设置如果涉及 i18n、默认值、迁移或视图刷新，通常都不只改这一处。

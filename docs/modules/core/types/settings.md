# Settings Types and Defaults

> **源码**: `src/core/types/settings.ts`
> **状态**: [REVIEW]

## 概述

OpenCodian 的中央设置模式定义，包含 `OpenCodianSettings`、`DEFAULT_SETTINGS`，以及一组负责清洗历史配置和运行时输入的 `normalize*()` 辅助函数。它既是设置 UI 的数据底座，也是插件启动时的迁移和兜底入口。

源码约 1396 行，是项目最大的类型定义文件。

## 导入关系

上游: 无外部依赖（纯类型 + 工具函数）
下游:
- 几乎所有模块（通过 `src/core/types/index.ts` 重导出）
- `src/main.ts`（加载/保存设置、主题迁移）
- `src/features/settings/OpenCodianSettings.ts`（设置 UI）
- `src/core/theme/index.ts`（主题解析）
- `src/features/chat/OpenCodianView.ts`（读取运行时设置）

## 核心类型 / 接口

### 顶层设置

| 类型 | 说明 |
|------|------|
| `OpenCodianSettings` | 完整设置接口（约 40 个字段） |
| `DEFAULT_SETTINGS` | 默认设置常量对象 |

### 服务器与安全

| 类型 | 说明 |
|------|------|
| `ServerMode` | `'local' \| 'remote'` |
| `ServerAuthType` | `'none' \| 'basic' \| 'bearer'` |
| `ServerConfig` | 服务器配置（`mode`, `local`, `remote`, `auth`） |
| `LocalServerConfig` | 本地服务器（`host`, `port`, `autoStart`） |
| `RemoteServerConfig` | 远程服务器（`baseUrl`） |
| `ServerAuthConfig` | 认证配置（`type`, `username`, `password`, `token`） |
| `PermissionMode` | `'yolo' \| 'plan' \| 'normal'` |
| `PlatformBlockedCommands` | 平台分组黑名单（`unix`, `windows`） |
| `ApprovalDecision` | `'allow' \| 'allow-always' \| 'deny' \| 'cancel'` |

### 模型与对话

| 类型 | 说明 |
|------|------|
| `ModelSourceMode` | `'merge' \| 'local' \| 'server'` |
| `ModelProviderConfig` | 提供商配置（`id`, `name`, `apiKey?`, `baseUrl?`, `enabled`） |
| `TitleMode` | `'default' \| 'ai'` |
| `EffortLevel` | `'minimal' \| 'low' \| 'medium' \| 'high' \| 'xhigh'` |
| `ThinkingBudget` | `0 \| 1024 \| 4096 \| 8192 \| 16384` |
| `QuestionDisplayMode` | `'all' \| 'single'` |
| `QuestionCardPosition` | `'inline' \| 'above_input'` |
| `PluginIsolationMode` | `'default' \| 'pure'` |

### UI 与主题

| 类型 | 说明 |
|------|------|
| `TabBarPosition` | `'input' \| 'header' \| 'below-header'` |
| `BelowHeaderTabBarLayout` | `'grid' \| 'vertical'` |
| `ChatScrollMode` | `'natural' \| 'sticky-basic' \| 'sticky-mask'` |
| `InputPanelThemeId` | 输入面板主题 ID（`preset`, `glass-refraction-*`, `liquid-glass-*`） |
| `LiquidGlassAdapterId` | `'shuding' \| 'nikdelvin' \| 'shudingDiamond'` |
| `InputPanelActionButtonStyleId` | `'default' \| 'etched'` |
| `ChatAppearanceSettings` | 完整外观设置（8 个子对象） |
| `PartialChatAppearanceSettings` | 外观设置的部分覆盖类型 |
| `ThemeSettings` | `{ activePresetId, customAppearanceOverrides }` |
| `ThemePresetId` | 12 个预设 ID 的联合类型 |
| `ThemePresetDefinition` | 预设完整定义 |
| `ThemeStyleId` | `'glass' \| 'flat' \| 'soft' \| 'sharp'` |

### 外观子设置

| 类型 | 说明 |
|------|------|
| `ChatAppearanceLayoutSettings` | 布局（`messagesPaddingTop`, `messagesPaddingX`） |
| `ChatAppearanceStickySettings` | 吸顶区（`headerGap`, `maskHeight`, `maskBlur`） |
| `ChatAppearanceBackgroundSettings` | 背景图（`imagePath`, `fitMode`, `opacity`, `blur`, `depth`, `dim`, `edgeFade`, `saturation`, `brightness`, `focusX`, `focusY`） |
| `ChatAppearanceUserSettings` | 用户消息气泡，现含时间样式（`timeFontSize`, `timeFontWeight`, `timeColor`） |
| `ChatAppearanceAssistantSettings` | 助手消息气泡，现含 meta/time/modelId 样式（字号、字重、颜色） |
| `ChatAppearanceInputSettings` | 输入面板（`radius`, `backgroundOpacity`, `blur`, `shadowBlur`, `actionButtonStyle`） |
| `ChatAppearanceScrollbarSettings` | 滚动条（`width`, `radius`, `trackOpacity`, `thumbOpacity`, `thumbHoverOpacity`, `edgePadding`, `shadowOpacity`） |
| `ChatAppearanceAdvancedSettings` | 高级（`customCssDeclarations`） |

### 玻璃效果

| 类型 | 说明 |
|------|------|
| `InputPanelGlassRefractionVariantId` | `'glass' \| 'card' \| 'pill'` |
| `InputPanelGlassRefractionVariantSettings` | 单变体（`backgroundOpacity`, `blur`, `saturation`, `brightness`） |
| `InputPanelGlassRefractionSettings` | 玻璃折射效果（`glass`/`card`/`pill` 三种变体） |
| `InputPanelGlassRefractionSvgFilterPresetId` | `'none' \| 'subtle' \| 'strong'` |
| `InputPanelGlassRefractionSvgFilterSettings` | SVG 滤镜预设（`preset`, `subtleScale`, `strongScale`） |
| `InputPanelLiquidGlassSettings` | 液态玻璃效果（`shuding`/`nikdelvin`/`shudingDiamond` 三套参数） |

### 标签页持久化

| 类型 | 说明 |
|------|------|
| `PersistedTabState` | `{ tabs: PersistedTabEntry[], activeTabIndex }` |
| `PersistedTabEntry` | `{ conversationId, title, modelOverride }` |
| `PersistedTabModelOverride` | `{ provider, model }` |

### Provider 图标

| 类型 | 说明 |
|------|------|
| `ProviderIconEntryType` | `'mapped' \| 'url' \| 'file'` |
| `ProviderIconEntry` | 图标条目（`id`, `type`, `source`, `mimeType?`, `cacheFileName?`, `addedAt`, `updatedAt?`） |
| `ProviderIconLibrary` | `Record<string, ProviderIconEntry[]>` |

## 关键方法

### 归一化函数

| 方法 | 说明 |
|------|------|
| `normalizeEffortLevel(value)` | 归一化努力级别，`'max'` → `'xhigh'`，默认 `'high'` |
| `normalizeThinkingBudget(value)` | 归一化思考预算，支持字符串/数字输入 |
| `normalizeTabBarPosition(value)` | 归一化标签栏位置 |
| `normalizeBelowHeaderTabBarLayout(value)` | 归一化下方标签布局 |
| `normalizeTitleMode(value)` | 归一化标题模式 |
| `normalizeQuestionDisplayMode(value)` | 归一化问题显示模式 |
| `normalizeQuestionCardPosition(value)` | 归一化问题卡片位置 |
| `normalizeInputPanelThemeId(value)` | 归一化输入面板主题（含废弃 ID 迁移） |
| `normalizeInputPanelActionButtonStyleId(value)` | 归一化按钮样式 |
| `normalizeChatAppearanceBackgroundFitMode(value)` | 归一化背景填充模式 |
| `normalizePluginIsolationMode(value)` | 归一化插件隔离模式 |
| `normalizeDisabledModelRefs(value)` | 清洗 `provider/model` 列表，去重并剔除非法引用 |
| `normalizeChatAppearanceSettings(appearance?)` | 归一化完整外观设置 |
| `normalizePartialChatAppearanceSettings(appearance?)` | 归一化部分外观覆盖 |
| `normalizeThemeSettings(value?)` | 归一化主题设置 |
| `normalizePersistedTabState(state?)` | 归一化标签页持久化状态 |
| `normalizeProviderIconLibrary(value)` | 归一化图标库 |
| `normalizeInputPanelGlassRefractionSettings(value?)` | 归一化玻璃折射设置 |
| `normalizeInputPanelGlassRefractionSvgFilterSettings(value?)` | 归一化 SVG 滤镜设置 |
| `normalizeInputPanelLiquidGlassSettings(value?)` | 归一化液态玻璃设置 |

### 默认值函数

| 方法 | 说明 |
|------|------|
| `getDefaultChatAppearanceSettings()` | 默认外观设置 |
| `getDefaultThemeSettings()` | 默认主题设置（`glass-classic`） |
| `getDefaultInputPanelGlassRefractionSettings()` | 默认玻璃折射参数 |
| `getDefaultInputPanelGlassRefractionSvgFilterSettings()` | 默认 SVG 滤镜参数 |
| `getDefaultInputPanelLiquidGlassSettings()` | 默认液态玻璃参数 |
| `getDefaultBlockedCommands()` | 默认黑名单命令 |
| `getDefaultDebugLogPaths()` | 默认调试日志路径 |
| `getDefaultPersistedTabState()` | 默认标签页状态 |

### 工具函数

| 方法 | 说明 |
|------|------|
| `getServerBaseUrl(server)` | 根据模式构建服务器 URL |
| `isLocalServerMode(server)` | 判断是否为本地服务器模式 |
| `isThemePresetId(value)` | 类型守卫：是否为有效预设 ID |
| `isValidChatAppearanceCustomCssDeclarations(value)` | 验证自定义 CSS 声明安全性 |
| `getCurrentPlatformKey()` | 返回当前平台 key（`'unix' \| 'windows'`） |
| `getCurrentPlatformBlockedCommands(commands)` | 获取当前平台黑名单 |
| `getBashToolBlockedCommands(commands)` | 获取 Bash 工具黑名单（Windows 合并两套） |
| `normalizeBaseUrl(value)` | 去除 URL 尾部斜杠 |

## 最近值得注意的变化

### 模型禁用引用

`OpenCodianSettings` 现在新增了：

- `disabledModelRefs: string[]`

这个字段存储插件侧的模型级禁用列表，格式固定为 `provider/model`。`normalizeDisabledModelRefs()` 会：

- 只保留字符串项
- `trim()` 清理空白
- 过滤掉没有 provider 或 model 的脏值
- 去重，保证最终列表稳定

这让设置页可以把“provider 级开关”和“model 级禁用”分开表达。

### 聊天气泡元数据样式

`ChatAppearanceSettings` 最近扩展了两类样式字段：

- `user.time*`
- `assistant.meta*` / `assistant.time*` / `assistant.modelId*`

对应的归一化逻辑也新增了：

- `normalizeCssColorValue(...)`
- `normalizeFontWeightValue(...)`

因此这份文件现在不仅定义“有没有这个字段”，还负责把颜色、字号和字重收敛到安全范围。

## OpenCodianSettings 字段参考

| 字段 | 类型 | 默认值 | 说明 |
|------|------|--------|------|
| `userName` | `string` | `''` | 用户名称 |
| `server` | `ServerConfig` | 本地模式 | 服务器配置 |
| `enableBlocklist` | `boolean` | `true` | 启用命令黑名单 |
| `allowExternalAccess` | `boolean` | `false` | 允许外部文件访问 |
| `blockedCommands` | `PlatformBlockedCommands` | 预定义 | 平台黑名单 |
| `permissionMode` | `PermissionMode` | `'yolo'` | 权限模式 |
| `autoRestartOnPermissionChange` | `boolean` | `false` | 权限变更自动重启 |
| `modelSourceMode` | `ModelSourceMode` | `'merge'` | 模型来源模式 |
| `defaultProvider` | `string` | `'anthropic'` | 默认提供商 |
| `defaultModel` | `string` | `'claude-3-5-sonnet-20241022'` | 默认模型 |
| `titleMode` | `TitleMode` | `'default'` | 标题生成模式 |
| `questionDisplayMode` | `QuestionDisplayMode` | `'all'` | 问题显示模式 |
| `questionCardPosition` | `QuestionCardPosition` | `'inline'` | 问题卡片位置 |
| `showAnsweredQuestionCards` | `boolean` | `true` | 显示已回答问题卡片 |
| `aiTitleModel` | `string` | `''` | AI 标题专用模型 |
| `disabledModelRefs` | `string[]` | `[]` | 插件侧禁用的 `provider/model` 列表 |
| `renderUserMarkupAsCodeBlocks` | `boolean` | `true` | 用户标记渲染为代码块 |
| `pluginIsolationMode` | `PluginIsolationMode` | `'default'` | 插件隔离模式 |
| `providers` | `ModelProviderConfig[]` | Anthropic | 提供商列表 |
| `providerIconLibrary` | `ProviderIconLibrary` | `{}` | 图标库 |
| `effortLevel` | `EffortLevel` | `'high'` | 努力级别 |
| `thinkingBudget` | `ThinkingBudget` | `4096` | 思考预算 |
| `excludedTags` | `string[]` | `[]` | 排除标签 |
| `mediaFolder` | `string` | `''` | 媒体文件夹 |
| `systemPrompt` | `string` | `''` | 系统提示词 |
| `allowedExportPaths` | `string[]` | `['~/Desktop', '~/Downloads']` | 允许导出路径 |
| `maxTabs` | `number` | `3` | 最大标签数 |
| `tabBarPosition` | `TabBarPosition` | `'below-header'` | 标签栏位置 |
| `belowHeaderTabBarLayout` | `BelowHeaderTabBarLayout` | `'grid'` | 下方标签布局 |
| `enableAutoScroll` | `boolean` | `true` | 启用自动滚动 |
| `chatScrollMode` | `ChatScrollMode` | `'sticky-mask'` | 滚动模式 |
| `inputPanelTheme` | `InputPanelThemeId` | `'preset'` | 输入面板主题 |
| `inputPanelGlassRefraction` | `InputPanelGlassRefractionSettings` | 默认 | 玻璃折射设置 |
| `inputPanelGlassRefractionSvgFilter` | `InputPanelGlassRefractionSvgFilterSettings` | 默认 | SVG 滤镜设置 |
| `inputPanelGlassRefractionGlassDefaultsVersion` | `number` | `2` | 玻璃默认值版本 |
| `inputPanelLiquidGlass` | `InputPanelLiquidGlassSettings` | 默认 | 液态玻璃设置 |
| `chatAppearance` | `ChatAppearanceSettings` | 默认 | 聊天外观 |
| `settingsPanelScrollTop` | `number` | `0` | 设置面板滚动位置 |
| `enableDebugLogging` | `boolean` | `false` | 启用调试日志 |
| `debugLogPaths` | `PlatformDebugLogPaths` | 默认 | 调试日志路径 |
| `openInMainTab` | `boolean` | `false` | 在主标签页打开 |
| `tabState` | `PersistedTabState` | 默认 | 标签页状态 |
| `theme` | `ThemeSettings` | 默认 | 主题设置 |
| `locale` | `string` | `'en'` | 界面语言 |
| `hiddenSlashCommands` | `string[]` | `[]` | 隐藏的斜杠命令 |

## 数据流

1. 插件加载 → `loadSettings()` 读取存储 → 各字段经 `normalize*()` 验证
2. 用户修改设置 → UI 调用 `normalize*()` → `saveSettings()` 持久化
3. 运行时读取设置 → 直接触发对应行为（服务器启停、主题切换等）

## 与其他模块的交互

- **几乎全部模块**: 通过重导出的类型和函数使用
- **StorageService**: 序列化/反序列化 `OpenCodianSettings`
- **Theme module**: 使用 `ChatAppearanceSettings`, `ThemeSettings`, `ThemePresetId` 等
- **ServerManager**: 使用 `ServerConfig`, `getServerBaseUrl()`
- **BlocklistChecker**: 使用 `PlatformBlockedCommands`, `enableBlocklist`

## 配置项

此模块本身是配置模式定义，不引入额外配置。

## 注意事项

- `normalizeInputPanelThemeId()` 包含废弃 ID 迁移逻辑：
  - `'liquid-glass-rdev'` → `'liquid-glass-shuding'`
  - `'liquid-diamond-shuding'` → `'preset'`
- `isValidChatAppearanceCustomCssDeclarations()` 禁止花括号和 `<style>` 标签，防止 CSS 注入
- `normalizeFiniteNumberInRange()` 用于将数值夹紧到合法范围
- 颜色和字重现在也会被单独校验，不再只是“数字能过就行”
- `inputPanelGlassRefractionGlassDefaultsVersion` 用于版本化默认值迁移
- Windows 上 `getBashToolBlockedCommands()` 合并 unix + windows 两套黑名单
- `hiddenSlashCommands` 存储用户隐藏的斜杠命令 ID
- 归一化函数设计原则：未知值回退到默认值，而非报错

## 版本迁移

- `inputPanelGlassRefractionGlassDefaultsVersion: 2` 表示当前玻璃默认值版本
- 未来版本升级时可通过比较版本号触发默认值迁移

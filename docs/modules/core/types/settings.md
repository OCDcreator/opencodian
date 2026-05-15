# Settings Types and Defaults

> **源码**: `src/core/types/settings.ts`
> **状态**: [REVIEW]

## 概述

OpenCodian 的中央设置模式定义，包含 `OpenCodianSettings`、`DEFAULT_SETTINGS`，以及一组负责清洗历史配置和运行时输入的 `normalize*()` 辅助函数。它是设置 UI 与启动 bootstrap 的数据底座；具体的启动期 snapshot merge / migration orchestration 已收束到 `src/core/types/settingsLoadNormalization.ts`。

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
| `LocalServerConfig` | 本地服务器（`host`, `port`, `autoStart`, `executablePath`） |
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
| `ChatAppearanceInputSettings` | 输入面板（`radius`, `backgroundOpacity`, `blur`, `shadowBlur`, `actionButtonStyle`, `contextRingStyle`, `enFontFamily`, `cnFontFamily`） |
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
| `PersistedTabEntry` | `{ id?, parentTabId?, conversationId, title, modelOverride }` |
| `PersistedTabModelOverride` | `{ provider, model }` |

### Provider 图标

| 类型 | 说明 |
|------|------|
| `ProviderIconEntryType` | `'mapped' \| 'builtin' \| 'url' \| 'file'` |
| `LobehubIconVariant` | `'auto' \| 'mono' \| 'color' \| 'brand' \| 'brand-color' \| 'text' \| 'text-cn' \| 'text-color' \| 'combine' \| 'avatar'` |
| `StaticLobehubIconVariant` | 去掉 `auto/combine` 后可直接映射静态资源的 variant |
| `ProviderIconResolvedFormat` | `'svg' \| 'png' \| 'webp' \| 'avatar'` |
| `ProviderIconEntry` | 图标条目（`id`, `type`, `source`, `variant?`, `resolvedVariant?`, `resolvedFormat?`, `mimeType?`, `cacheFileName?`, `addedAt`, `updatedAt?`） |
| `ProviderIconLibrary` | `Record<string, ProviderIconEntry[]>` |

## 关键方法

### 归一化函数

### 本地 OpenCode 可执行文件路径

`LocalServerConfig.executablePath` 是可选的本地 sidecar 启动覆盖项，默认空字符串。留空时 `LocalSidecarLauncher` 会继续使用平台内置候选路径和 `PATH`；填写后，该路径会优先于 macOS / Windows 默认候选。

| 方法 | 说明 |
|------|------|
| `normalizeEffortLevel(value)` | 归一化努力级别，`'max'` → `'xhigh'`，默认 `'high'` |
| `normalizeThinkingBudget(value)` | 归一化思考预算，支持字符串/数字输入 |
| `normalizeTabsEnabled(value)` | 归一化会话标签启用状态；只有明确 `false` 才禁用，未知值默认启用 |
| `normalizeTabBarPosition(value)` | 归一化标签栏位置 |
| `normalizeBelowHeaderTabBarLayout(value)` | 归一化下方标签布局 |
| `normalizeTitleMode(value)` | 归一化标题模式 |
| `normalizeQuestionDisplayMode(value)` | 归一化问题显示模式 |
| `normalizeQuestionCardPosition(value)` | 归一化问题卡片位置 |
| `normalizeInputPanelThemeId(value)` | 归一化输入面板主题（含废弃 ID 迁移） |
| `normalizeInputPanelActionButtonStyleId(value)` | 归一化按钮样式 |
| `normalizeContextRingStyleId(value)` | 归一化上下文圆环样式 |
| `normalizeFontFamilyValue(value)` | 归一化输入区英文字体 / 中文字体选择，未知或空值回退默认字体 |
| `normalizeChatAppearanceBackgroundFitMode(value)` | 归一化背景填充模式 |
| `normalizePluginIsolationMode(value)` | 归一化插件隔离模式 |
| `normalizeDisabledModelRefs(value)` | 清洗 `provider/model` 列表，去重并剔除非法引用 |
| `normalizeChatAppearanceSettings(appearance?)` | 归一化完整外观设置 |
| `normalizePartialChatAppearanceSettings(appearance?)` | 归一化部分外观覆盖 |
| `normalizeThemeSettings(value?)` | 归一化主题设置 |
| `normalizePersistedTabState(state?)` | 归一化标签页持久化状态 |
| `normalizeLobehubIconVariant(value)` | 归一化 LobeHub icon variant，未知值回退到 `auto` |
| `normalizeProviderIconLibrary(value)` | 归一化图标库 |
| `normalizeProviderIconResolvedFormat(value)` | 归一化 provider 图标命中格式 |
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
| `getDefaultDebugModuleSettings()` | 默认模块级调试开关 |
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

### 安全设置的心智模型

当前安全相关字段里有一组需要特别注意的“插件侧 helper”语义：

- `permissionMode` 代表 **OpenCodian shorthand template**，用于把 3 套常见权限模板写入 `.opencode/opencode.json`
- `allowExternalAccess` 不会直接放行 `external_directory`；真正的 OpenCode 外部目录权限仍由 `.opencode` 规则决定
- `allowedExportPaths` 也不是运行时 allowlist，而是供 debug/export 与手动编辑规则时复用的路径列表

因此在设置 UI 中，真正的运行时权限真相源仍然是项目级 `.opencode/opencode.json`，而不是这些插件字段本身。

## OpenCodianSettings 字段参考

| 字段 | 类型 | 默认值 | 说明 |
|------|------|--------|------|
| `userName` | `string` | `''` | 用户名称 |
| `server` | `ServerConfig` | 本地模式 | 服务器配置 |
| `enableBlocklist` | `boolean` | `true` | 启用命令黑名单 |
| `allowExternalAccess` | `boolean` | `false` | 插件侧的外部访问偏好记录；不直接改写 OpenCode 运行时权限 |
| `blockedCommands` | `PlatformBlockedCommands` | 预定义 | 平台黑名单 |
| `permissionMode` | `PermissionMode` | `'yolo'` | OpenCodian 的权限模板选择（YOLO / ask-by-default / review） |
| `autoRestartOnPermissionChange` | `boolean` | `false` | 权限变更自动重启 |
| `modelSourceMode` | `ModelSourceMode` | `'merge'` | 模型来源模式 |
| `defaultProvider` | `string` | `'anthropic'` | 默认提供商 |
| `defaultModel` | `string` | `'claude-3-5-sonnet-20241022'` | 默认模型 |
| `titleMode` | `TitleMode` | `'default'` | 标题生成模式：首条消息标题，或优先等待 OpenCode 自动命名并在失败时使用备用模型的智能标题生成 |
| `questionDisplayMode` | `QuestionDisplayMode` | `'all'` | 问题显示模式 |
| `questionCardPosition` | `QuestionCardPosition` | `'inline'` | 问题卡片位置 |
| `showAnsweredQuestionCards` | `boolean` | `true` | 显示已回答问题卡片 |
| `aiTitleModel` | `string` | `''` | 智能标题无法从 OpenCode 获取标题时使用的备用标题模型 |
| `disabledModelRefs` | `string[]` | `[]` | 插件侧禁用的 `provider/model` 列表 |
| `renderUserMarkupAsCodeBlocks` | `boolean` | `true` | 用户标记渲染为代码块 |
| `pluginIsolationMode` | `PluginIsolationMode` | `'default'` | 插件隔离模式 |
| `providers` | `ModelProviderConfig[]` | Anthropic | 提供商列表 |
| `providerIconLibrary` | `ProviderIconLibrary` | `{}` | 图标库 |
| `providerIconColorMode` | `ProviderIconColorMode` | `'system'` | provider 图标颜色策略 |
| `providerIconDefaultVariant` | `LobehubIconVariant` | `'auto'` | LobeHub provider 图标默认 variant |
| `effortLevel` | `EffortLevel` | `'high'` | 努力级别 |
| `thinkingBudget` | `ThinkingBudget` | `4096` | 思考预算 |
| `excludedTags` | `string[]` | `[]` | 排除标签 |
| `mediaFolder` | `string` | `''` | 媒体文件夹 |
| `systemPrompt` | `string` | `''` | 系统提示词 |
| `allowedExportPaths` | `string[]` | `['~/Desktop', '~/Downloads']` | 保存的外部路径列表，供调试导出与手动规则编辑复用 |
| `enableTabs` | `boolean` | `true` | 是否显示会话标签控件并允许新标签打开子会话；禁用时保留 `tabState` 和会话数据 |
| `maxTabs` | `number` | `3` | 最大标签数 |
| `tabBarPosition` | `TabBarPosition` | `'below-header'` | 标签栏位置 |
| `belowHeaderTabBarLayout` | `BelowHeaderTabBarLayout` | `'grid'` | 下方标签布局 |
| `enableAutoScroll` | `boolean` | `true` | 启用自动滚动 |
| `chatFontSizePx` | `number` | `13` | 聊天正文的默认字体大小 |
| `chatScrollMode` | `ChatScrollMode` | `'sticky-mask'` | 滚动模式 |
| `inputPanelTheme` | `InputPanelThemeId` | `'preset'` | 输入面板主题 |
| `inputPanelGlassRefraction` | `InputPanelGlassRefractionSettings` | 默认 | 玻璃折射设置 |
| `inputPanelGlassRefractionSvgFilter` | `InputPanelGlassRefractionSvgFilterSettings` | 默认 | SVG 滤镜设置 |
| `inputPanelGlassRefractionGlassDefaultsVersion` | `number` | `2` | 玻璃默认值版本 |
| `inputPanelLiquidGlass` | `InputPanelLiquidGlassSettings` | 默认 | 液态玻璃设置 |
| `chatAppearance` | `ChatAppearanceSettings` | 默认 | 聊天外观 |
| `settingsPanelScrollTop` | `number` | `0` | 设置面板滚动位置 |
| `modelAvailabilitySectionOpen` | `boolean` | `true` | 模型“可用范围与目录”分区是否展开 |
| `modelToolsSectionOpen` | `boolean` | `true` | 模型“配置与缓存”分区是否展开 |
| `enableDebugLogging` | `boolean` | `false` | 启用调试日志 |
| `inlineSerializedDebugLogArgs` | `boolean` | `false` | 是否把 debug 的非字符串参数内联序列化到日志文本 |
| `debugModuleSettings` | `DebugModuleSettings` | 默认 | 模块级调试开关 |
| `debugRefreshIntervalMs` | `number` | `3000` | 相同高频日志 payload 的最小重复输出间隔 |
| `debugLogPaths` | `PlatformDebugLogPaths` | 默认 | 调试日志路径 |
| `openInMainTab` | `boolean` | `false` | 在主标签页打开 |
| `tabState` | `PersistedTabState` | 默认 | 标签页状态 |
| `theme` | `ThemeSettings` | 默认 | 主题设置 |
| `locale` | `string` | `'en'` | 界面语言 |
| `hiddenSlashCommands` | `string[]` | `[]` | 隐藏的斜杠命令 |
| `slashCommandSkillMode` | `SlashCommandSkillMode` | `'direct'` | OpenCode skills 的斜杠命令调用模式 |

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

## 调试日志设置簇

调试相关字段现在成组工作，而不是只有单个 `enableDebugLogging`：

- `enableDebugLogging`
- `debugModuleSettings`
- `debugRefreshIntervalMs`
- `inlineSerializedDebugLogArgs`
- `debugLogPaths`

`normalizeModelProviderPluginDebugSettings()` 会统一负责这些字段的兼容与归一化，包括：

- 把模块开关补齐为完整布尔表
- 把高频日志刷新间隔限制到稳定范围
- 把 legacy `debugLogPath` 吸收到新的 `debugLogPaths`

## 注意事项

- `normalizeInputPanelThemeId()` 包含废弃 ID 迁移逻辑：
  - `'liquid-glass-rdev'` → `'liquid-glass-shuding'`
  - `'liquid-diamond-shuding'` → `'preset'`
- `isValidChatAppearanceCustomCssDeclarations()` 禁止花括号和 `<style>` 标签，防止 CSS 注入
- `normalizeFiniteNumberInRange()` 用于将数值夹紧到合法范围
- 颜色和字重现在也会被单独校验，不再只是“数字能过就行”
- `inputPanelGlassRefractionGlassDefaultsVersion` 用于版本化默认值迁移
- Windows 上 `getBashToolBlockedCommands()` 合并 unix + windows 两套黑名单
- `normalizeCompactionReservedTokens()` still exists as a reusable positive-integer normalizer, but compaction config defaults are no longer stored in `OpenCodianSettings`; compaction config is now project-scoped via `.opencode/opencode.json`
- `normalizeChatFontSizePx()` 会把值归一化到受支持的整数范围；无效输入回退到默认 `13`
- `hiddenSlashCommands` 存储用户隐藏的斜杠命令 ID
- `normalizeSlashCommandSkillMode()` 只接受 `'direct'` 或 `'skills-command'`，未知值回退到默认直显模式
- `modelAvailabilitySectionOpen` / `modelToolsSectionOpen` 属于设置页 UI 状态，和 `settingsPanelScrollTop` 一样会被持久化
- 归一化函数设计原则：未知值回退到默认值，而非报错
- `enableTabs` 是显示/入口开关，不是会话存储迁移开关；禁用时不能清空 `tabState`，以便重新启用后恢复原标签上下文

## 2026-04-23 Compaction config alignment

Compaction config is now project-scoped (`.opencode/opencode.json`). Ownership facts:
1. Compaction config source of truth is `.opencode/opencode.json`, not `OpenCodianSettings`.
2. `autoCompactionEnabled` and `compactionReservedTokens` were removed from `OpenCodianSettings` and its load normalization; `normalizeCompactionReservedTokens()` is retained as a reusable normalizer helper.
3. Manual `session.summarize()` remains a per-session action available through `OpenCodeService` session control, not managed by plugin settings.

## 版本迁移

- `inputPanelGlassRefractionGlassDefaultsVersion: 2` 表示当前玻璃默认值版本
- 未来版本升级时可通过比较版本号触发默认值迁移

## 2026-04-24 Dual-layout settings fields

New fields added to `OpenCodianSettings` for the dual-layout settings UI:

| 字段 | 类型 | 默认值 | 说明 |
|------|------|--------|------|
| `settingsLayoutMode` | `'classic' \| 'tabbed'` | `'tabbed'` | 设置页面布局模式 |
| `settingsTabbedPrimaryTab` | `string` | `'server'` | 标签模式下当前激活的一级标签 |
| `settingsTabbedSecondaryTabByPrimary` | `Record<string, string>` | `{}` | 每个一级标签上次选择的二级标签 |

New normalize functions added:

- `normalizeSettingsLayoutMode(value)` — validates and defaults to `'tabbed'`
- `normalizeSettingsTabbedPrimaryTab(value, fallback)` — validates string, falls back to given value, and migrates legacy `'language'` primary ids to `'general'`
- `normalizeSettingsTabbedSecondaryTabByPrimary(value)` — filters to `Record<string, string>` of trimmed non-empty entries, remaps legacy `{ language: 'general' }` memory to `{ general: 'language' }`, and downgrades stale `{ general: 'general' }` to `{ general: 'basic' }`

`DEFAULT_SETTINGS` defaults to `settingsLayoutMode: 'tabbed'` for new installs. Existing users are migrated to `'classic'` in `settingsLoadNormalization.ts` via `resolveInitialLayoutMode()`.

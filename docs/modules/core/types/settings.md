# Settings Types and Defaults

> **源码**: `src/core/types/settings.ts`
> **状态**: [DRAFT]

## 概述

OpenCodian 的中央设置模式定义，包含 `OpenCodianSettings` 接口、`DEFAULT_SETTINGS` 常量、以及约 30 个归一化/验证/默认值辅助函数。涵盖服务器连接、模型配置、安全策略、UI/UX、主题、输入面板玻璃效果、标签页状态等全部可配置维度。所有设置变更都需要经过对应的 `normalize*()` 函数验证后才能持久化。

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
| `ServerConfig` | 服务器配置（mode, local, remote, auth） |
| `LocalServerConfig` | 本地服务器（host, port, autoStart） |
| `RemoteServerConfig` | 远程服务器（baseUrl） |
| `ServerAuthConfig` | 认证配置（type, username, password, token） |
| `PermissionMode` | `'yolo' \| 'plan' \| 'normal'` |
| `PlatformBlockedCommands` | 平台分组黑名单（unix/windows） |
| `ApprovalDecision` | `'allow' \| 'allow-always' \| 'deny' \| 'cancel'` |

### 模型与对话

| 类型 | 说明 |
|------|------|
| `ModelSourceMode` | `'merge' \| 'local' \| 'server'` |
| `ModelProviderConfig` | 提供商配置（id, name, apiKey?, baseUrl?, enabled） |
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
| `InputPanelThemeId` | 输入面板主题 ID（preset, glass-refraction-*, liquid-glass-*） |
| `LiquidGlassAdapterId` | `'shuding' \| 'nikdelvin' \| 'shudingDiamond'` |
| `ChatAppearanceSettings` | 完整外观设置（8 个子对象） |
| `PartialChatAppearanceSettings` | 外观设置的部分覆盖类型 |
| `ThemeSettings` | `{ activePresetId, customAppearanceOverrides }` |
| `ThemePresetId` | 12 个预设 ID 的联合类型 |
| `ThemePresetDefinition` | 预设完整定义 |
| `ThemeStyleId` | `'glass' \| 'flat' \| 'soft' \| 'sharp'` |

### 外观子设置

| 类型 | 说明 |
|------|------|
| `ChatAppearanceLayoutSettings` | 布局（messagesPaddingTop, messagesPaddingX） |
| `ChatAppearanceStickySettings` | 吸顶区（headerGap, maskHeight, maskBlur） |
| `ChatAppearanceBackgroundSettings` | 背景图（path, fitMode, opacity, blur, depth, dim, edgeFade, saturation, brightness, focusX, focusY） |
| `ChatAppearanceUserSettings` | 用户消息气泡（radius, tailRadius, blur, shadowBlur） |
| `ChatAppearanceAssistantSettings` | 助手消息气泡（radius, backgroundOpacity, blur, shadowBlur） |
| `ChatAppearanceInputSettings` | 输入面板（radius, backgroundOpacity, blur, shadowBlur, actionButtonStyle） |
| `ChatAppearanceScrollbarSettings` | 滚动条（width, radius, trackOpacity, thumbOpacity, thumbHoverOpacity, edgePadding, shadowOpacity） |
| `ChatAppearanceAdvancedSettings` | 高级（customCssDeclarations） |

### 玻璃效果

| 类型 | 说明 |
|------|------|
| `InputPanelGlassRefractionSettings` | 玻璃折射效果（glass/card/pill 三种变体） |
| `InputPanelGlassRefractionVariantSettings` | 单变体（backgroundOpacity, blur, saturation, brightness） |
| `InputPanelGlassRefractionSvgFilterSettings` | SVG 滤镜预设（none/subtle/strong + scale 参数） |
| `InputPanelLiquidGlassSettings` | 液态玻璃效果（shuding/nikdelvin/shudingDiamond 三套参数） |

### 标签页持久化

| 类型 | 说明 |
|------|------|
| `PersistedTabState` | `{ tabs: PersistedTabEntry[], activeTabIndex }` |
| `PersistedTabEntry` | `{ conversationId, title, modelOverride }` |
| `PersistedTabModelOverride` | `{ provider, model }` |

### Provider 图标

| 类型 | 说明 |
|------|------|
| `ProviderIconEntry` | 图标条目（id, type, source, mimeType, cacheFileName, timestamps） |
| `ProviderIconLibrary` | `Record<providerId, ProviderIconEntry[]>` |

## 关键方法

### 归一化函数

| 方法 | 说明 |
|------|------|
| `normalizeEffortLevel(value)` | 归一化努力级别，`'max'` → `'xhigh'`，默认 `'high'` |
| `normalizeThinkingBudget(value)` | 归一化思考预算，支持字符串/数字输入 |
| `normalizeTabBarPosition(value)` | 归一化标签栏位置 |
| `normalizeTitleMode(value)` | 归一化标题模式 |
| `normalizeQuestionDisplayMode(value)` | 归一化问题显示模式 |
| `normalizeQuestionCardPosition(value)` | 归一化问题卡片位置 |
| `normalizeInputPanelThemeId(value)` | 归一化输入面板主题（含废弃 ID 迁移） |
| `normalizePluginIsolationMode(value)` | 归一化插件隔离模式 |
| `normalizeChatAppearanceSettings(appearance?)` | 归一化完整外观设置 |
| `normalizePartialChatAppearanceSettings(appearance?)` | 归一化部分外观覆盖 |
| `normalizeThemeSettings(value?)` | 归一化主题设置 |
| `normalizePersistedTabState(state?)` | 归一化标签页持久化状态 |
| `normalizeProviderIconLibrary(value)` | 归一化图标库 |

### 默认值函数

| 方法 | 说明 |
|------|------|
| `getDefaultChatAppearanceSettings()` | 默认外观设置 |
| `getDefaultThemeSettings()` | 默认主题设置（`glass-classic`） |
| `getDefaultInputPanelGlassRefractionSettings()` | 默认玻璃折射参数 |
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
| `getCurrentPlatformKey()` | 返回当前平台 key |
| `getCurrentPlatformBlockedCommands(commands)` | 获取当前平台黑名单 |
| `getBashToolBlockedCommands(commands)` | 获取 Bash 工具黑名单（Windows 合并两套） |
| `normalizeBaseUrl(value)` | 去除尾部斜杠 |

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

- `normalizeInputPanelThemeId()` 包含废弃 ID 迁移逻辑（`'liquid-glass-rdev'` → `'liquid-glass-shuding'`，`'liquid-diamond-shuding'` → `'preset'`）
- `isValidChatAppearanceCustomCssDeclarations()` 禁止花括号和 `<style>` 标签，防止 CSS 注入
- `normalizeFiniteNumberInRange()` 用于将数值夹紧到合法范围
- `inputPanelGlassRefractionGlassDefaultsVersion` 用于版本化默认值迁移
- Windows 上 `getBashToolBlockedCommands()` 合并 unix + windows 两套黑名单

## 待补充
- [ ] 补充 `DEFAULT_SETTINGS` 中每个字段的含义和推荐值范围
- [ ] 记录设置版本迁移策略
- [ ] 补充 `allowedExportPaths` 的安全模型说明
- [ ] 记录 `inputPanelGlassRefractionGlassDefaultsVersion` 的迁移历史

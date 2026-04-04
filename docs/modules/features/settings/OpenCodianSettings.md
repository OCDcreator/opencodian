# OpenCodianSettings

> **源码**: `src/features/settings/OpenCodianSettings.ts`
> **状态**: [REVIEW]

## 概述

OpenCodian 插件的主设置面板，继承 Obsidian 的 `PluginSettingTab`。提供双语（en/zh）设置 UI，涵盖 10 个分区：Language、Server、Model、Conversation、Plugins、Security、UI、Style（含 Theme presets）、Debug、User。支持快速导航栏、滚动位置恢复、实时服务器状态监控、模型目录切换、chat appearance 精细调节（背景/用户/助手/输入/滚动条/高级分组）、liquid glass 折射参数、provider icon 缓存管理等功能。

## 导入关系
上游: `obsidian`（App、PluginSettingTab、Setting、Notice 等）、`fs`/`os`/`path`、`core/config`（OpencodeConfigManager、PluginManagementService）、`core/theme`（getBuiltinThemePresets、hasThemeAppearanceOverrides）、`core/types`（大量类型）、`i18n`、`main`（OpenCodianPlugin）、`shared`（logger、getVaultBasePath）、`utils/glass`（getAllGlassAdapters）、`utils/icons`（ProviderIconService）、各子 Modal
下游: 被 `main.ts` 中 `addSettingTab()` 注册

## 核心类型 / 接口

```typescript
interface NumericStyleControlConfig {
  group: ChatAppearanceStyleGroup;
  name: string; desc: string;
  min: number; max: number; step: number; unit: string;
  value: () => number;
  resetValue: () => number;
  setValue: (appearance: ChatAppearanceSettings, value: number) => void;
}

type ChatAppearanceStyleGroup = 'layout' | 'background' | 'user' | 'assistant' | 'input' | 'scrollbar' | 'advanced';
```

## 核心逻辑

### 分区架构

`display()` 方法构建完整设置面板，调用 10 个 `add*Settings()` 方法：
- `addLanguageSettings`: 语言下拉（en/zh），切换后刷新整个面板
- `addServerSettings`: 模式切换（local/remote）、host/port、认证、状态监控（2s 轮询）
- `addModelSettings`: provider/model 下拉、source mode、refresh、config 编辑器入口、icon 缓存管理
- `addConversationSettings`: 标题模式、AI 标题模型、问题显示模式、问题卡片位置、已回答卡片显示
- `addPluginSettings`: 插件环境快照、项目配置编辑器、隔离模式、项目目录管理、OMO 配置
- `addSecuritySettings`: 权限模式、config 状态指示器、自动重启、blocklist、命令屏蔽、导出路径
- `addUISettings`: 最大标签数、标签栏位置、自动滚动、聊天滚动模式、主标签打开
- `addStyleSettings`: 主题预设、背景/布局/用户/助手/输入/滚动条/高级精细调节
- `addDebugSettings`: 调试日志、平台日志路径、诊断导出
- `addUserSettings`: 用户名、系统提示、排除标签

### 滚动位置恢复

`prepareRestoreScrollOnNextOpen()` / `prepareScrollToServerOnNextOpen()` 支持在设置面板重新打开时恢复滚动位置或跳转到指定分区。

### 实时状态

服务器状态通过 `setInterval(2000)` 轮询 `checkHealth()` 更新，面板关闭时清理。

## 关键方法

| 方法 | 说明 |
|------|------|
| `display()` | 构建完整设置面板（清空 + 重建所有分区） |
| `hide()` | 捕获滚动位置、清理 interval 和 rAF |
| `onModelsLoaded()` | 模型加载后刷新下拉框（rAF 节流） |
| `scrollToServerSection()` / `scrollToModelSection()` | 滚动到指定分区 |
| `addServerSettings()` | 服务器配置 + 实时健康状态 |
| `addModelSettings()` | provider/model 目录 + 配置编辑器入口 |
| `addStyleSettings()` | chat appearance 全部精细调节 |

## 数据流

```
plugin.settings → Setting UI 控件
        ↓ onChange
plugin.saveSettings() → StorageService 持久化
        ↓
可选: server restart / UI refresh / config sync
```

## 与其他模块的交互

- **ModelConfigModal / ModelConfigJsonModal**: 模型配置编辑器入口
- **OpencodeConfigModal**: 通用配置编辑器入口
- **ProviderIconCacheModal**: 图标缓存管理入口
- **ServerSettingHelpModal**: 各服务器设置的帮助按钮
- **LiquidGlassSettingHelpModal**: 输入面板玻璃效果帮助
- **ModelConfigService**: 模型目录加载
- **PluginManagementService**: 插件环境快照
- **OpencodeConfigManager**: 配置文件读写
- **ProviderIconService**: 图标缓存状态

## 配置项

所有 `OpenCodianSettings` 接口字段（见 `core/types/settings.ts`）。

## 注意事项

- `display()` 每次调用完全重建 DOM，语言切换时尤为明显
- `styleControlBindings` 追踪样式控件的同步回调，用于主题预设切换后刷新控件值
- Electron dialog 通过 `@electron/remote` 或 `electron.remote` 动态获取
- `visibility: hidden` 用于滚动恢复前的闪烁预防

## 补充说明

- `addStyleSettings()` 内样式分组字段：layout（maxWidth, messageSpacing, borderRadius）、background（相关背景图片设置）、user（userBubbleColor, userTextColor, userFont, userCodeFont, userMessageMaxWidth）、assistant（assistantBubbleColor, assistantTextColor, assistantFont, assistantCodeFont, assistantMessageMaxWidth）、input（inputBackgroundColor, inputTextColor, inputFont, inputCodeFont, inputMaxHeight, inputPlaceholderColor, glass refraction 参数）、scrollbar（scrollbarWidth, scrollbarTrackColor, scrollbarThumbColor, scrollbarThumbHoverColor）、advanced（customCssDeclarations）
- 滚动恢复机制：`SETTINGS_SCROLL_RESTORE_RETRY_DELAYS = [24, 80, 160, 320]` 定义重试延迟，`SETTINGS_SCROLL_RESTORE_OBSERVER_WINDOW_MS = 1200` 为观察窗口，`SETTINGS_SCROLL_RESTORE_MIN_STABLE_MS = 180` 为最小稳定时间，使用 `MutationObserver` 监听 DOM 变化后逐帧检查 scrollTop 是否到达目标位置
- `renderBackgroundStyleGroup()` 处理背景图片上传/预览/移除（通过 Electron `showOpenDialog`）、blur/depth/edge blending 参数调节；`renderInputStyleGroup()` 处理 glass refraction variant 选择、SVG filter preset、折射参数（blur/offset/scale/opacity）的数值控件

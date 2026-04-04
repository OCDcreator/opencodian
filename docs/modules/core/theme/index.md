# Theme Presets and Resolver

> **源码**: `src/core/theme/index.ts`
> **状态**: [DRAFT]

## 概述

定义内置聊天主题预设（12 种）并提供外观设置解析、比较和合并工具函数。主题系统采用 "预设 + 覆盖" 模型：选择预设提供基础外观值，用户可在预设基础上微调，差异部分存储为 `customAppearanceOverrides`。4 种风格（glass / flat / soft / sharp）× 多种配色方案。

## 导入关系

上游: `src/core/types/settings.ts`（`ChatAppearanceSettings`, `ThemePresetDefinition`, `ThemePresetId`, `ThemeSettings`, 归一化函数）
下游: `src/main.ts`（主题迁移）、`src/features/chat/OpenCodianView.ts`（运行时外观应用）、`src/features/settings/OpenCodianSettings.ts`（预设选择 UI）

## 核心类型 / 接口

使用 `src/core/types/settings.ts` 中定义的类型：

| 类型 | 说明 |
|------|------|
| `ThemePresetId` | 预设 ID 联合类型（12 个值） |
| `ThemePresetDefinition` | 预设完整定义（id, name, styleId, schemeName, containerClass, cssVariables, appearance） |
| `ThemeSettings` | `{ activePresetId, customAppearanceOverrides }` |
| `ChatAppearanceSettings` | 完整外观设置（layout, sticky, background, user, assistant, input, scrollbar, advanced） |

## 核心逻辑

### 内置预设

| 预设 ID | 风格 | 配色 | 容器 CSS 类 |
|---------|------|------|-------------|
| `glass-classic` | glass | Classic | `opencodian-theme-glass` |
| `glass-warm` | glass | Warm | `opencodian-theme-glass` |
| `glass-mint` | glass | Mint | `opencodian-theme-glass` |
| `flat-slate` | flat | Slate | `opencodian-theme-flat` |
| `flat-ocean` | flat | Ocean | `opencodian-theme-flat` |
| `flat-rose` | flat | Rose | `opencodian-theme-flat` |
| `soft-neutral` | soft | Neutral | `opencodian-theme-soft` |
| `soft-lavender` | soft | Lavender | `opencodian-theme-soft` |
| `soft-latte` | soft | Latte | `opencodian-theme-soft` |
| `sharp-graphite` | sharp | Graphite | `opencodian-theme-sharp` |
| `sharp-neon` | sharp | Neon | `opencodian-theme-sharp` |
| `sharp-amber` | sharp | Amber | `opencodian-theme-sharp` |

### 预设 + 覆盖解析模型
1. 用户选择预设 → 获取预设的基础 `appearance`
2. 将 `customAppearanceOverrides` 合并到基础值上
3. 通过 `normalizeChatAppearanceSettings()` 确保值完整且合法
4. `background` 部分不参与覆盖 diff 计算

### 差异计算
`getThemeAppearanceOverridesFromBase()` 对比基础外观与当前外观，提取仅包含差异数据的 `PartialChatAppearanceSettings`，用于持久化用户微调。

## 关键方法

| 方法 | 说明 |
|------|------|
| `getBuiltinThemePresets()` | 返回所有内置预设定义（深拷贝） |
| `getThemePresetDefinition(presetId)` | 按 ID 获取单个预设定义 |
| `resolveThemeChatAppearance(theme)` | 解析最终外观 = 预设基础 + 用户覆盖 |
| `mergePartialChatAppearanceSettings(base, overrides)` | 将部分覆盖合并到完整基础值上 |
| `getThemeAppearanceOverridesFromBase(base, current)` | 计算当前值相对于基础值的差异 |
| `areChatAppearanceSettingsEqual(left, right)` | JSON 序列化比较两个外观设置 |
| `hasThemeAppearanceOverrides(theme)` | 检查是否存在非 background 的用户覆盖 |
| `diffObject(base, current)` | （内部）对比两个对象的属性差异 |

## 数据流

1. 用户在设置面板选择预设 → `theme.activePresetId` 更新
2. 用户微调外观 → `getThemeAppearanceOverridesFromBase()` 计算差异 → `theme.customAppearanceOverrides` 更新
3. 运行时 → `resolveThemeChatAppearance(theme)` 解析最终外观 → `chatAppearance.ts` 生成 CSS 变量 → 应用到 DOM

## 与其他模块的交互

- **settings.ts**: 类型定义和归一化函数
- **main.ts**: 主题迁移（版本升级时重置无效预设）
- **OpenCodianView.ts**: 运行时解析和应用外观
- **OpenCodianSettings.ts**: 预设选择器 UI、外观微调滑块
- **chatAppearance.ts**: 将解析后的外观设置转为 CSS 自定义属性

## 配置项

| 设置 | 说明 |
|------|------|
| `settings.theme.activePresetId` | 当前激活的预设 ID |
| `settings.theme.customAppearanceOverrides` | 相对于预设的用户微调 |

## 注意事项

- `background` 不参与 `hasThemeAppearanceOverrides()` 判断和 diff 计算（背景有独立的上传/存储路径）
- `THEME_STYLE_CONTAINER_CLASSES` 和 `THEME_PRESET_CSS_VARIABLE_NAMES` 为去重后的常量列表，供外部使用
- `getBuiltinThemePresets()` 返回深拷贝，防止外部修改预设定义
- glass 风格有两套外观：`GLASS_CLASSIC_APPEARANCE`（默认值）和 `GLASS_APPEARANCE`（warm/mint 使用）

## 待补充
- [ ] 记录每个风格类型的视觉特征差异
- [ ] 补充预设重置时的行为说明
- [ ] 记录 CSS 变量映射表

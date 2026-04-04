# Theme Presets and Resolver

> **源码**: `src/core/theme/index.ts`
> **状态**: [REVIEW]

## 概述

`src/core/theme/index.ts` 定义了内置聊天主题 preset，并提供一组围绕 preset 的解析、比较和差异提取函数。它服务的不是完整设置系统，而是“preset 作为基础，局部样式覆盖作为增量”的那一层逻辑。

源码当前内置 12 个 preset，分成 4 种 style：

- `glass`
- `flat`
- `soft`
- `sharp`

## 导入关系

```text
上游: src/core/types/index.ts
下游: src/main.ts, src/features/settings/OpenCodianSettings.ts, src/features/chat/OpenCodianView.ts
```

## 核心类型 / 接口

```typescript
export const THEME_STYLE_CONTAINER_CLASSES: string[];
export const THEME_PRESET_CSS_VARIABLE_NAMES: string[];

export function getBuiltinThemePresets(): ThemePresetDefinition[];
export function getThemePresetDefinition(presetId: ThemePresetId | null | undefined): ThemePresetDefinition | null;
export function resolveThemeChatAppearance(theme: ThemeSettings): ChatAppearanceSettings;
export function mergePartialChatAppearanceSettings(
  base: ChatAppearanceSettings,
  overrides?: PartialChatAppearanceSettings | null,
): ChatAppearanceSettings;
export function getThemeAppearanceOverridesFromBase(
  base: ChatAppearanceSettings,
  current: ChatAppearanceSettings,
): PartialChatAppearanceSettings;
export function areChatAppearanceSettingsEqual(
  left: ChatAppearanceSettings,
  right: ChatAppearanceSettings,
): boolean;
export function hasThemeAppearanceOverrides(theme: ThemeSettings): boolean;
```

## 核心逻辑

### 内置 preset 列表

源码里的 12 个 preset 如下：

| Style | Preset |
|------|------|
| `glass` | `glass-classic`, `glass-warm`, `glass-mint` |
| `flat` | `flat-slate`, `flat-ocean`, `flat-rose` |
| `soft` | `soft-neutral`, `soft-lavender`, `soft-latte` |
| `sharp` | `sharp-graphite`, `sharp-neon`, `sharp-amber` |

每个 preset 都包含：

- `id`
- `name`
- `styleId`
- `schemeName`
- `containerClass`
- `cssVariables`
- `appearance`

其中 `appearance` 来自 4 组基础外观对象之一：

- `GLASS_CLASSIC_APPEARANCE`
- `GLASS_APPEARANCE`
- `FLAT_APPEARANCE`
- `SOFT_APPEARANCE`
- `SHARP_APPEARANCE`

### 运行时查找表与样式清单

模块额外构建了两份派生常量：

- `THEME_STYLE_CONTAINER_CLASSES`
  - 来自所有 preset 的 `containerClass` 去重结果
  - 当前值对应 `opencodian-theme-glass/flat/soft/sharp`
- `THEME_PRESET_CSS_VARIABLE_NAMES`
  - 来自所有 preset 的 `cssVariables` key 去重结果

以及一份内部 `THEME_PRESET_MAP`，用于按 `ThemePresetId` 查找 preset。

### 读取 preset 时的拷贝策略

`getBuiltinThemePresets()` 和 `getThemePresetDefinition()` 都不会把内部对象直接返回给调用方，而是返回拷贝版本：

- `cssVariables` 会被浅拷贝
- `appearance` 会重新走一次 `normalizeChatAppearanceSettings()`

这样可以避免外部修改内部常量对象。

### preset + overrides 解析

`resolveThemeChatAppearance(theme)` 的行为是：

1. 先按 `activePresetId` 找到 preset
2. 找不到时直接返回 `getDefaultChatAppearanceSettings()`
3. 找到时用 `mergePartialChatAppearanceSettings(preset.appearance, theme.customAppearanceOverrides)` 叠加覆盖值
4. 最终再做一次 `normalizeChatAppearanceSettings()`

### 主题覆盖值的边界

这里有一个很重要的源码事实：主题覆盖值并不覆盖 `background`。

`mergePartialChatAppearanceSettings()` 明确只对以下分组应用 overrides：

- `layout`
- `sticky`
- `user`
- `assistant`
- `input`
- `scrollbar`
- `advanced`

`background` 只复制 `base.background`，不会读取 `overrides?.background`。

与此对应：

- `getThemeAppearanceOverridesFromBase()` 不会比较 `background`
- `hasThemeAppearanceOverrides()` 也显式忽略 `background`

这说明主题 preset 系统当前只负责消息壳与输入区等外观，不把背景图相关设置视为主题覆盖的一部分。

### 差异提取与比较

`getThemeAppearanceOverridesFromBase(base, current)` 会逐组做浅层字段 diff，把“和 base 不同”的字段收集成 `PartialChatAppearanceSettings`。

`areChatAppearanceSettingsEqual(left, right)` 则把两边都先标准化，再用 `JSON.stringify()` 比较。

`hasThemeAppearanceOverrides(theme)` 会把 `theme.customAppearanceOverrides` 归一化后，判断除 `background` 以外的分组是否有非空字段。

## 数据流

```text
src/main.ts
  -> getThemePresetDefinition()
  -> resolveThemeChatAppearance()
  -> 主题迁移 / 设置归一化

src/features/settings/OpenCodianSettings.ts
  -> getBuiltinThemePresets()
  -> hasThemeAppearanceOverrides()
  -> preset 选择与“是否有覆盖”提示

src/features/chat/OpenCodianView.ts
  -> getThemePresetDefinition()
  -> THEME_STYLE_CONTAINER_CLASSES / THEME_PRESET_CSS_VARIABLE_NAMES
  -> 应用 CSS class 与 preset CSS 变量
```

## 与其他模块的交互

- `src/main.ts` 使用 `getThemePresetDefinition()`、`resolveThemeChatAppearance()`、`getThemeAppearanceOverridesFromBase()` 和 `areChatAppearanceSettingsEqual()` 做主题迁移与设置同步。
- `src/features/settings/OpenCodianSettings.ts` 用 `getBuiltinThemePresets()` 列出可选 preset，并用 `hasThemeAppearanceOverrides()` 提示用户是否做过样式微调。
- `src/features/chat/OpenCodianView.ts` 用 `THEME_STYLE_CONTAINER_CLASSES` 和 `THEME_PRESET_CSS_VARIABLE_NAMES` 清理旧主题痕迹，再按当前 preset 应用 class 与 CSS 变量。

## 注意事项

- 如果 `activePresetId` 为空或无效，`resolveThemeChatAppearance()` 会直接回到默认聊天外观，而不是“继续套用 overrides”。
- `background` 不属于主题 override 的差异范围；修改这部分逻辑时，必须同步检查 `main.ts`、`OpenCodianView.ts`、设置页和相关文档。
- 新增 preset 时，`ThemePresetId`、`ThemePresetDefinition`、设置页选项和本模块文档需要一起同步。

# SettingsStylePresetSection

> **源码**: `src/features/settings/SettingsStylePresetSection.ts`
> **状态**: [REVIEW]

## 概述

`SettingsStylePresetSection` 是 style 分区里专门负责 theme preset UI/state 的 owner。它把 style family 卡片、scheme chips、当前 preset / customized 状态行，以及“重置 preset 外观覆盖”按钮从 `SettingsStyleSection` 主 owner 中抽离出来，同时保留原有 preset 切换与 reset 语义。

## 核心逻辑

### 挂载与重绘

- `attach()` 创建独立 host，并立刻按当前 `plugin.settings.theme` 渲染 preset 区
- `refresh()` 每次都会整体重建 preset DOM，因此 style family 卡片、scheme chips、status copy 与 reset CTA 始终来自当前权威 theme 状态
- `renderSessionId` 用于在异步 preset 应用 / reset 返回后屏蔽已经销毁的 settings 实例

### Preset 选择与回调

- 点击 style family 卡片时，会选择该 family 的第一个内置 preset；若该 family 没有 preset，则只刷新当前 UI
- 点击 scheme chip 时直接调用 `selectThemePresetAndSave()` 切换具体 preset
- 应用或重置完成后，会先调用 `onThemeAppearanceChanged()`，再重绘当前 preset owner，让主 style owner 同步数值控件与 background subsection

## 关键方法

| 方法 | 说明 |
|------|------|
| `attach()` | 在 style 分区挂载 preset subsection host |
| `refresh()` | 按当前 theme 状态完整重绘 preset UI |
| `applyThemePresetSelection()` | 选择具体 preset 并同步父 owner |
| `resetThemePresetAppearance()` | 清空 preset appearance overrides 并刷新 UI |

## 与其他模块的交互

- `SettingsStyleSection.ts`: 负责创建该 owner，并在 preset 变化后刷新通用 style control 与 background subsection
- `core/theme/index.ts`: 提供内置 preset 列表与“是否有 appearance override”判断
- `OpenCodianPlugin`: 提供当前 active preset、preset 选择保存与 preset-override reset 能力

## 注意事项

- 保持 `glass / flat / soft / sharp` 的 style family 顺序，不要把 preset family / scheme 语义散回主 owner
- 异步 preset apply/reset 必须继续保留 session guard，避免旧 settings 面板回写到新实例
- 这里负责的是 preset 专属状态 UI，不要把通用 numeric/color/reset 控件逻辑重新塞进本文件

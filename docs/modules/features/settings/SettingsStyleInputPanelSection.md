# SettingsStyleInputPanelSection

> **源码**: `src/features/settings/SettingsStyleInputPanelSection.ts`
> **状态**: [REVIEW]

## 概述

`SettingsStyleInputPanelSection` 是 `SettingsStyleSection` 下的 input-panel 子区块 owner。它负责 input theme family/variant dropdown、input radius 与 preset/glass-refraction 参数区、局部 rerender guard，以及 input-theme 保存后的 subsection 重建。

这个 owner 的目标是把 input appearance lifecycle 从 style section 主 owner 里抽成一块相邻厚 seam，同时继续保留“只重绘 input subsection、不重建整页 settings”的行为。

## 核心逻辑

### 子区块挂载与重绘

- `attach()` 创建 input subsection host，并立即按当前 `inputPanelTheme` 渲染
- `refresh()` 每次都会清空 input-group host，并重新装配 dropdown、numeric control、glass/liquid-glass 参数区
- `dispose()` 通过 `renderSessionId` 让异步保存后的 stale rerender 自动失效

### Theme family 切换

- `applyInputPanelThemeChange()` 只写回 `plugin.settings.inputPanelTheme` 并调用 `saveSettings({ applyUi: true })`
- 保存完成后只在 owner 仍然存活时执行 `refresh()`，避免旧 settings 面板把 rerender 带回新实例
- `glass-refraction` 与 `liquid-glass` family 仍沿用原来的 variant 归一化规则

### 参数区拆分

- preset input 参数继续复用 `addNumericStyleControl()`，保持 baseline/reset 语义一致
- glass refraction 参数与 SVG filter reset 仍在本 owner 内处理，因为它们与 theme-family 切换耦合
- liquid glass 参数列表委托给 `SettingsStyleLiquidGlassInputControls`

## 关键方法

| 方法 | 说明 |
|------|------|
| `attach()` | 创建 input subsection host 并挂载当前 input appearance |
| `refresh()` | 只重建 input subsection，不触碰整页 settings |
| `applyInputPanelThemeChange()` | 保存新的 input theme，并在当前 owner 仍激活时局部重绘 |
| `addGlassRefractionInputControls()` | 装配 glass-refraction 数值控制、SVG filter 与 reset |

## 与其他模块的交互

- `SettingsStyleSection.ts`: 持有 style section 的整体 lifecycle，并把 input subsection 装配委托给本 owner
- `SettingsStyleLiquidGlassInputControls.ts`: 负责 liquid glass adapter 参数表单与帮助按钮入口
- `core/types/settings.ts`: 提供 input theme family/variant 与 glass-refraction 默认值、归一化规则
- `utils/glass/index.ts`: 提供当前可用的 liquid glass adapters 目录

## 注意事项

- input subsection 必须继续保持局部重绘；不要因为新增参数而把整页 settings 重建重新引回 `SettingsStyleSection`
- `renderSessionId` stale guard 是当前 owner 的关键回归边界，切换 theme 后不能让已销毁的 settings 面板重新渲染
- liquid glass 参数解释与 adapter-specific setting 写回已经下沉到相邻 owner；不要再把这部分逻辑重新并回本文件

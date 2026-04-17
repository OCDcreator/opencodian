# SettingsStyleLiquidGlassInputControls

> **源码**: `src/features/settings/SettingsStyleLiquidGlassInputControls.ts`
> **状态**: [REVIEW]

## 概述

`SettingsStyleLiquidGlassInputControls` 是 input-panel style 子区块下专门负责 liquid glass adapter 参数表单的 owner。它集中处理 adapter paramDefs 的 toggle/select/text/numeric 渲染、plain-language help 文案入口，以及对应 settings 写回。

## 核心逻辑

- `attach()` 根据当前 adapter 的 `paramDefs` 渲染参数表单，并保留 section label 分组标题
- 所有写回都沿用 `saveSettings({ applyUi: true, reloadModels: false, syncConfig: false, syncService: false })`
- `getLiquidGlassSettingHelpButtonConfig()` 继续只为 `shuding` 提供“大白话解释”帮助入口，其他 adapter 不暴露该按钮

## 关键方法

| 方法 | 说明 |
|------|------|
| `attach()` | 根据 adapter paramDefs 渲染 liquid glass 参数控制 |
| `getLiquidGlassSettingHelpButtonConfig()` | 解析帮助文案并创建 help-button 配置 |
| `updateLiquidGlassAdapterSetting()` | 写回当前 adapter 的单个参数值 |
| `saveLiquidGlassInputSettings()` | 统一执行 liquid glass 参数保存 |

## 与其他模块的交互

- `SettingsStyleInputPanelSection.ts`: 决定当前 liquid glass adapter，并把具体参数表单委托给本 owner
- `settingsStyleControls.ts`: 提供 shared numeric-control / help-button 合约，供 numeric liquid-glass 参数复用
- `LiquidGlassSettingHelpModal.ts`: 显示 adapter 参数的 plain-language help 文案
- `utils/glass/index.ts`: 提供 adapter 元数据和 paramDefs

## 注意事项

- 不要改变 liquid glass adapter 参数的保存选项；它们必须继续避免 sync-service/reload-models 级别的额外副作用
- 帮助按钮只是一层 UI 入口，不应在这里扩展 adapter fallback 或参数默认值语义

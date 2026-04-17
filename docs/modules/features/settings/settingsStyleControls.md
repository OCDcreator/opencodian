# settingsStyleControls

> **源码**: `src/features/settings/settingsStyleControls.ts`
> **状态**: [REVIEW]

## 概述

`settingsStyleControls.ts` 是 settings/style 分区的通用控件 owner。它集中承接 numeric slider + number input、color picker + follow-theme、group reset，以及 style binding 注册 / 同步逻辑，让 `SettingsStyleSection` 回到 subsection orchestration shell，而不是继续内联维护控件细节。

## 核心逻辑

### Numeric control 语义

- `addNumericControl()` 同时装配 step button、range slider、自由 number input 与单项 reset
- slider 拖拽期间只更新草稿显示，不立刻提交；`change` 时才提交最终值
- number input 允许自由输入小数，只在草稿稳定后提交，并保留未完成的 `8.` / `-` / `1e` 这类编辑状态

### Color control 语义

- `addColorStyleControl()` 统一提供预览按钮、Pick、Follow theme 与隐藏 `input[type=color]`
- 颜色只在 picker `change` 时提交，不会在 `input` 阶段提前写回 settings
- `resolveCssColorToHex()` 会临时挂载 probe element，把 CSS 变量 / 主题色解析成 color input 可用的十六进制值

### Binding 与 reset

- `registerStyleControlBinding()` / `refreshStyleControlValues()` 维护 preset / reset 后的统一控件同步
- `createStyleResetSetting()` 继续沿用 `resetChatAppearanceGroup()` + apply/save + binding refresh 这条既有链路
- `clampStyleNumber()` 保留 min/max/step 的统一夹取与步进归一化规则

## 关键方法

| 方法 | 说明 |
|------|------|
| `addNumericControl()` | 渲染通用数值控件并处理 draft / slider commit 语义 |
| `addNumericStyleControl()` | 把数值控件接到 `chatAppearance` 写回与 binding 注册 |
| `addColorStyleControl()` | 渲染颜色选择控件并统一 follow-theme 行为 |
| `createStyleResetSetting()` | 创建样式分组 reset 行，并同步控件值 |
| `refreshStyleControlValues()` | 在 preset/reset 后统一刷新已注册控件 |

## 与其他模块的交互

- `SettingsStyleSection.ts`: 持有该 owner，并把其能力分发给 layout/user/assistant/scrollbar/advanced 以及相邻 subsection owners
- `SettingsStyleBackgroundSection.ts`: 复用 numeric style control 合约渲染 background sliders
- `SettingsStyleInputPanelSection.ts` / `SettingsStyleLiquidGlassInputControls.ts`: 复用 numeric control / help-button 合约渲染 input-panel 数值参数
- `OpenCodianPlugin`: 提供 `updateChatAppearance()`、group reset、apply/save 等设置写回能力

## 注意事项

- 保持这是一个粗粒度控件 owner；不要把 numeric/color/reset 再拆成一堆单控件 helper 文件
- binding 列表是 preset/reset 后控件同步的关键边界，新增控件时优先走现有注册机制
- 颜色解析逻辑依赖 DOM 计算样式，修改时要保留对 CSS 变量与跟随主题值的兼容

# SettingsStyleSection

> **源码**: `src/features/settings/SettingsStyleSection.ts`
> **状态**: [REVIEW]

## 概述

`SettingsStyleSection` 是 settings/style 分区的厚 owner。它从 `OpenCodianSettings.ts` 接管 style section 的完整 lifecycle：theme preset 状态与 reset、layout/user/assistant/scrollbar/input/advanced 样式分组、background owner 装配、input panel theme family 切换、glass refraction / liquid glass 参数，以及 custom CSS 校验与 apply/save 编排。

目标不是把样式逻辑拆成零碎 helper，而是把一整块 style DOM/state/theme wiring 收口到单一 owner，让 `OpenCodianSettings` 回到“owner 装配”的角色。

## 核心逻辑

### Section 装配

- `attach()` 负责创建 style heading、theme preset 区、全局 reset、background subsection host，以及其余各 style 分组
- `dispose()` 清理 style binding、preset UI refresh 回调、background owner 与 input host 引用，保证 settings 重建后不会把旧 DOM 状态带回新面板

### Theme preset 与同步

- preset 区按 `glass / flat / soft / sharp` 四个 style family 组织，并用 scheme chips 在同一 family 内切换具体 preset
- 应用或重置 preset 后，会统一触发 `refreshStyleControlValues()`、background owner refresh，以及 preset 状态行重绘
- `styleControlBindings` 现在由本 owner 持有，theme preset / reset 后不再依赖 `OpenCodianSettings` 主类同步控件

### Input panel appearance

- `renderInputStyleGroup()` 只重建 input subsection，自身决定 `preset / glass-refraction / liquid-glass` 三个 theme family 的下拉、变体选择与参数区
- 切换 input theme 时只保存设置并重渲染 input subsection，不重建整个 settings 页
- liquid glass 参数的 help 文案入口也在这里统一装配

## 关键方法

| 方法 | 说明 |
|------|------|
| `attach()` | 挂载完整 style section，并装配 background owner |
| `dispose()` | 释放 binding、preset refresh 回调与 subsection 引用 |
| `addThemePresetSection()` | 渲染 style family 卡片、scheme chips 与 preset reset |
| `renderInputStyleGroup()` | 按当前 input theme family 重建输入面板样式 subsection |
| `applyInputPanelThemeChange()` | 保存 input theme 后仅重渲染 input subsection |
| `resetAllChatStyles()` | 重置全部 chat appearance，并同步 preset/background/control UI |

## 与其他模块的交互

- `OpenCodianSettings.ts`: 创建并复用该 owner，只保留 owner 装配与 help-button bridge
- `SettingsStyleBackgroundSection.ts`: 负责 style/background 子区块的上传、预览、拖拽与 reset lifecycle
- `LiquidGlassSettingHelpModal.ts`: 作为 liquid glass 参数解释入口，由本 owner 传入标题与正文
- `core/theme/index.ts`: 提供 builtin theme preset 列表与 appearance override 判断
- `core/types/settings.ts`: 定义 style/chat appearance、input panel theme、glass refraction 与 custom CSS 校验边界

## 注意事项

- 如果只调整 style section 的 preset、input appearance、custom CSS 或 glass/liquid glass 参数，优先扩展这个 owner，不要再把 DOM/state/theme wiring 塞回 `OpenCodianSettings`
- input subsection 的局部重绘必须继续保留，避免切换 input theme 时触发整页 settings 重建
- background subsection 仍是独立 owner；不要把 preview / upload / drag / reset 逻辑重新并回这里


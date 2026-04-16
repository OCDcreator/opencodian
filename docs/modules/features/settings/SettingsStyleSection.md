# SettingsStyleSection

> **源码**: `src/features/settings/SettingsStyleSection.ts`
> **状态**: [REVIEW]

## 概述

`SettingsStyleSection` 是 settings/style 分区的厚 owner。它从 `OpenCodianSettings.ts` 接管 style section 的完整 lifecycle：theme preset 状态与 reset、layout/user/assistant/scrollbar/advanced 样式分组、background owner 装配、通用 style binding/control 同步，以及 custom CSS 校验与 apply/save 编排。

目标不是把样式逻辑拆成零碎 helper，而是把一整块 style DOM/state/theme wiring 收口到单一 owner，并把 input panel 与 liquid glass 参数压回相邻子 owner，让 `OpenCodianSettings` 回到“owner 装配”的角色。

## 核心逻辑

### Section 装配

- `attach()` 负责创建 style heading、theme preset 区、全局 reset、background owner，以及 layout/user/assistant/scrollbar/advanced + input 子区块
- `dispose()` 清理 style binding、preset UI refresh 回调，并释放 background/input 子 owner，保证 settings 重建后不会把旧 DOM 状态带回新面板

### Theme preset 与同步

- preset 区按 `glass / flat / soft / sharp` 四个 style family 组织，并用 scheme chips 在同一 family 内切换具体 preset
- 应用或重置 preset 后，会统一触发 `refreshStyleControlValues()`、background owner refresh，以及 preset 状态行重绘
- `styleControlBindings` 现在由本 owner 持有，theme preset / reset 后不再依赖 `OpenCodianSettings` 主类同步控件

### 子 owner 装配

- `SettingsStyleBackgroundSection` 继续负责 background preview/upload/fit-mode/reset lifecycle
- `SettingsStyleInputPanelSection` 现在负责 input theme family/variant 切换、glass-refraction 控制和局部 rerender guard
- `styleControlBindings` 仍由本 owner 统一持有，因此 theme preset/reset 后仍能一次性同步 layout/user/assistant/scrollbar/advanced 控件

## 关键方法

| 方法 | 说明 |
|------|------|
| `attach()` | 挂载完整 style section，并装配 background owner |
| `dispose()` | 释放 binding、preset refresh 回调与子 owner 引用 |
| `addThemePresetSection()` | 渲染 style family 卡片、scheme chips 与 preset reset |
| `createInputPanelSection()` | 创建 input subsection owner，并注入通用 style control callback |
| `resetAllChatStyles()` | 重置全部 chat appearance，并同步 preset/background/control UI |

## 与其他模块的交互

- `OpenCodianSettings.ts`: 创建并复用该 owner，只保留 owner 装配与 help-button bridge
- `SettingsStyleBackgroundSection.ts`: 负责 style/background 子区块的上传、预览、拖拽与 reset lifecycle
- `SettingsStyleInputPanelSection.ts`: 负责 input theme 切换、glass-refraction 参数与 subsection 局部重绘
- `SettingsStyleLiquidGlassInputControls.ts`: 负责 liquid glass adapter 参数表单与帮助按钮入口
- `core/theme/index.ts`: 提供 builtin theme preset 列表与 appearance override 判断
- `core/types/settings.ts`: 定义 style/chat appearance、input panel theme、glass refraction 与 custom CSS 校验边界

## 注意事项

- 如果只调整 style section 的 preset、input appearance、custom CSS 或 glass/liquid glass 参数，优先扩展这个 owner，不要再把 DOM/state/theme wiring 塞回 `OpenCodianSettings`
- input subsection 的局部重绘必须继续由 `SettingsStyleInputPanelSection` 保留，避免切换 input theme 时触发整页 settings 重建
- background subsection 与 liquid glass 参数区都已经是相邻 owner；不要把 preview/upload/drag/reset 或 adapter param form 逻辑重新并回这里

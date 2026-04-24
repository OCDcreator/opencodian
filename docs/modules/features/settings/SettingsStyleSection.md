# SettingsStyleSection

> **源码**: `src/features/settings/SettingsStyleSection.ts`
> **状态**: [REVIEW]

## 概述

`SettingsStyleSection` 现在是 settings/style 分区的 orchestration shell。它从 `OpenCodianSettings.ts` 接管 style section 的完整 lifecycle，但把 theme preset UI/state 下沉到 `SettingsStylePresetSection`，把 numeric/color/reset primitives 与 binding 同步下沉到 `settingsStyleControls.ts`，自己只保留分组装配、subsection owner 编排，以及 custom CSS / reset-all 的顶层协调。

目标不是把样式逻辑拆成零碎 helper，而是把 style section 切成少数几个稳定 owner：主 shell、preset owner、shared controls owner、background owner、input owner。这样 `OpenCodianSettings` 继续只做 owner 装配，而 `SettingsStyleSection` 也不再同时持有 preset DOM 与每种控件实现细节。

## 核心逻辑

### Section 装配

- `attach()` 负责创建 style heading、theme preset 区、全局 reset、background owner，以及 layout/user/assistant/scrollbar/advanced + input 子区块
- `dispose()` 清理 shared controls binding，并释放 preset/background/input 子 owner，保证 settings 重建后不会把旧 DOM 状态带回新面板

### Owner 协调

- `SettingsStylePresetSection` 负责 `glass / flat / soft / sharp` family 卡片、scheme chips、preset reset CTA 与 customized 状态行
- `settingsStyleControls.ts` 负责 numeric/color/reset primitives、binding 注册，以及 preset/reset 后的控件同步
- 预设切换或 reset-all 后，主 owner 统一刷新 shared controls、background owner 与 preset owner，保持 style section 的单一调度入口

### 子 owner 装配

- `SettingsStyleBackgroundSection` 继续负责 background preview/upload/fit-mode/reset lifecycle
- `SettingsStyleInputPanelSection` 现在负责 input theme family/variant 切换、glass-refraction 控制和局部 rerender guard
- `SettingsStylePresetSection` 与 `settingsStyleControls.ts` 成为新的相邻厚 owner；`SettingsStyleSection` 通过 factory seam 把它们注入 background/input 子区块

## 关键方法

| 方法 | 说明 |
|------|------|
| `attach()` | 挂载完整 style section，并装配 background owner |
| `dispose()` | 释放 shared-control binding 与 preset/background/input 子 owner |
| `createPresetSection()` | 创建 preset owner，并桥接 preset 变化后的控件 / background refresh |
| `createInputPanelSection()` | 创建 input subsection owner，并注入通用 style control callback |
| `resetAllChatStyles()` | 重置全部 chat appearance，并同步 preset/background/control UI |

## 与其他模块的交互

- `OpenCodianSettings.ts`: 创建并复用该 owner，只保留 owner 装配与 help-button bridge
- `settingsStyleControls.ts`: 提供 numeric/color/reset primitives 与 binding 同步 owner
- `SettingsStylePresetSection.ts`: 提供 theme preset UI/state owner
- `SettingsStyleBackgroundSection.ts`: 负责 style/background 子区块的上传、预览、拖拽与 reset lifecycle
- `SettingsStyleInputPanelSection.ts`: 负责 input theme 切换、glass-refraction 参数与 subsection 局部重绘
- `SettingsStyleLiquidGlassInputControls.ts`: 负责 liquid glass adapter 参数表单与帮助按钮入口
- `core/theme/index.ts`: 提供 builtin theme preset 列表与 appearance override 判断
- `core/types/settings.ts`: 定义 style/chat appearance、input panel theme、glass refraction 与 custom CSS 校验边界

## 注意事项

- 如果只调整 style section orchestration、custom CSS 或 reset-all 流程，优先改这里；preset 专属 UI/state 与通用 numeric/color/reset 不要重新堆回本文件
- input subsection 的局部重绘必须继续由 `SettingsStyleInputPanelSection` 保留，避免切换 input theme 时触发整页 settings 重建
- background subsection、preset subsection 与 shared control primitives 都已经是相邻 owner；不要把 preview/upload/drag/reset、preset chips/status，或单控件实现逻辑重新并回这里

## 2026-04-24 Tabbed layout support

Added `attachTabbed(containerEl, secondaryTabId)` method for the tabbed settings layout. It routes content by secondary tab:

- `presets` — renders theme preset cards + scheme chips
- `background` — renders background upload/preview/fit controls
- `layout` — renders layout settings
- `user` — renders user message bubble appearance
- `assistant` — renders assistant message bubble appearance
- `input` — renders input panel theme + glass refraction settings
- `scrollbar` — renders scrollbar appearance
- `advanced` — renders custom CSS editor

The classic `attach()` method remains unchanged.

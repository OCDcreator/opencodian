# InlineEditOverlayPrimitives

> **源码**: `src/features/inline-edit/InlineEditOverlayPrimitives.ts`
> **状态**: [REVIEW]

## 概述

悬浮指令条的**小而纯的辅助函数合集**：菜单项映射、努力级别字形、面板上下翻转定位，以及定位用的两个布局常量。全部从 `InlineEditInputOverlay` 抽出（该文件有硬性的 max-lines 预算，注释不计行；本模块是同一预算规则下继 `InlineEditContextUi`、`InlineEditPresetMenu` 之后的第三次抽取）。三者都是无编辑器单测覆盖的纯函数。

## 职责

- `INLINE_EDIT_PANEL_GAP` / `INLINE_EDIT_PANEL_INSET`：锚线到底部面板的间隙（6px）与面板在编辑器 DOM 内的水平内边距（8px）；与 CSS 同步依赖人工维护（原注释要求）
- `InlineEditOverlayMenuItem` / `choicesToMenuItems(choices, activeId)`：host 选项 → 下拉菜单项（`id === null` 是"清除覆盖"行；`activeId` 高亮）
- `effortMenuIcon(id)`：努力级别行的 lucide 字形（signal-low/medium/high 信号格，清除行 rotate-ccw）
- `resolvePanelTop(input)`：面板相对锚线行的纵向放置（有单测）。默认放锚点下方；下方放不下且上方放得下时翻到上方；两边都放不下时保持下方并裁切（维持光标侧阅读顺序）

## 依赖

- 仅 `./InlineEditTypes`（`InlineEditChoice` 类型）

## 维护约束

- 本模块只允许**纯函数**：不得触碰 DOM、CM6 view 或 obsidian API（接收元素填充/数字换算以外的副作用一律拒绝）
- 翻转数学改动必须同步 `InlineEditInputOverlay.test.ts` 的 `resolvePanelTop` 用例

# settings-claude-code.css

> **源码**: `src/style/components/settings-claude-code.css`
> **状态**: [REVIEW]

## 概述

Claude Code 设置面板的专用样式，目前主要提供 stable settings proof-status notice 的视觉样式。

## 样式规则

### `.opencodian-settings-proof-status`

Compact inline notice，用于在 Claude Code 设置标签中显示运行时验证状态。

- 使用 flex 布局，垂直居中
- padding: 8px 12px，圆角 6px
- 默认背景色为 `color-mix(in srgb, var(--text-success, var(--color-green)) 6%, var(--opencodian-settings-row-bg))`
- 默认边框色为 `color-mix(in srgb, var(--text-success, var(--color-green)) 18%, var(--opencodian-settings-row-border))`
- 字体大小 12px，颜色 `var(--text-muted)`

### `[data-proof-state="pass"]`

使用默认绿色/成功色系（base `.opencodian-settings-proof-status` 样式），表示该设置已通过运行时行为验证。当前用于 Turn/Budget Limits proof-status notice（maxTurns 和 maxBudgetUsd enforcement 已确认）。

### `[data-proof-state="readback"]`

Readback 验证状态使用绿色/成功色系，表示该设置已被运行时回读验证。

### `[data-proof-state="wiring"]`

Wiring 状态使用黄色/警告色系，表示选项已连接但行为尚未验证。当前未在 stable settings 中使用（Fallback Model 已从 `wiring` 晋升为 `readback`），保留给未来需要区分 wiring/readback 的字段。

## 维护约束

- 新增 Claude Code 设置相关样式时优先放入此文件
- 保持与 `settings-layout-contract.css` 的变量命名一致
- proof-status notice 应保持 compact，不要与 boundary notice 或 capability lab chip 的视觉层级冲突

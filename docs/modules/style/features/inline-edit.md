# inline-edit.css

> **源码**: `src/style/features/inline-edit.css`
> **状态**: [REVIEW]

## 概述

inline edit 内嵌 UI 的样式：编辑器内的指令输入框与 diff 预览。DOM 契约见 `src/features/inline-edit/InlineEditWidgets.ts`。

## 职责

- `.opencodian-inline-edit-input` / `-field`：指令输入框（含 busy 禁用态）
- `.opencodian-inline-edit-reply` / `-error`：澄清回复与错误提示条
- `.opencodian-inline-edit-preview` / `-body` / `-fallback`：diff 预览容器与超限降级视图
- `.opencodian-inline-edit-insert` / `-delete`：词级 diff 的插入/删除配色
- `.opencodian-inline-edit-actions` / `-action`：接受与拒绝按钮

## 依赖

- Obsidian 主题变量（`--background-*`、`--text-*`、`--interactive-*`、`--radius-s`、`--font-ui-*`）

## 维护约束

- 该样式渲染在笔记编辑器内部，优先使用 Obsidian 主题变量，避免硬编码颜色破坏主题一致性
- 通过 `src/style/index.css` 的 `@import` 参与 `npm run build:css` 合并；新增文件必须同时登记到 index
- 改类名需同步 `InlineEditWidgets.ts` 中的常量

# relevant-notes.css

> **源码**: `src/style/components/relevant-notes.css`
> **状态**: [REVIEW]

## 概述

R-E3（advantage-parity）相关笔记侧栏面板的样式：标题/副标题（省略号截断）、双通道分区（标题 + 描述 + 列表）、条目行（标题 + meta + 24×24 附加按钮，hover 高亮）、提示行与空态。全部取 Obsidian 主题变量（`--font-ui-*`、`--text-*`、`--background-*`、`--radius-s`），随宿主明暗主题。

## 关键类

- `.opencodian-relevant-notes`：面板根（padding 12×10）。
- `.opencodian-relevant-notes-item`：条目行（flex、hover 背景、点击打开笔记）；内含 `.opencodian-relevant-notes-item-attach` 附加按钮。
- `.opencodian-relevant-notes-hint`：降级/空态提示块（次级背景）。

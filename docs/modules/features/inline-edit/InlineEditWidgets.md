# InlineEditWidgets

> **源码**: `src/features/inline-edit/InlineEditWidgets.ts`
> **状态**: [REVIEW]

## 概述

inline edit 的 CodeMirror 6 装饰层，只负责**预览**：一个 `StateField<DecorationSet>` 加两个 `StateEffect`（`showInlineEditPreview`/`clearInlineEdit`）。指令输入已移至悬浮面板 `InlineEditInputOverlay`（`docs/requirements/inline-edit.md` §7.4）。

## 职责

- 定义 effect：`showInlineEditPreview`（词级 diff 或插入预览）、`clearInlineEdit`
- `ensureInlineEditField()`：首次使用时用 `StateEffect.appendConfig` 注入 field；`applyInlineEditEffect()` 在未注入时静默跳过
- `readInlineEditRange()`：读取装饰**当前**范围。装饰集随每笔事务 `map(tr.changes)`，因此这就是接受时需要写入的偏移
- `InlineEditPreviewWidget`：`Decoration.replace` 覆盖选区（插入形态为零长度 block widget），DOM 内渲染 diff span 与接受/拒绝按钮
- `eq()` 以 `token` 比对，避免无关事务重建预览 DOM

## 依赖

- `@codemirror/state`、`@codemirror/view`
- `./InlineEditDiff`（`renderDiffInto`）、`./InlineEditTypes`

## 维护约束

- 装饰只在 effect 中重建；`update()` 内除 effect 分支外只做 `decorations.map(transaction.changes)`
- 预览 widget 的 `ignoreEvent()` 必须返回 `false`，让接受/拒绝按钮自己处理事件，编辑器不抢键
- 预览用 `Decoration.replace` 覆盖选区是刻意的：接受前的原位预览；脏检查负责发现用户对同一范围的修改
- 新增交互前先确认 `readInlineEditRange()` 仍返回可用于 `editor.replaceRange` 的范围

# InlineEditWidgets

> **源码**: `src/features/inline-edit/InlineEditWidgets.ts`
> **状态**: [REVIEW]

## 概述

inline edit 的 CodeMirror 6 装饰层，只负责**预览**：一个 `StateField<DecorationSet>` 加两个 `StateEffect`（`showInlineEditPreview`/`clearInlineEdit`）。指令输入已移至悬浮面板 `InlineEditInputOverlay`（`docs/requirements/inline-edit.md` §7.4）。

## 职责

- 定义 effect：`showInlineEditPreview`（词级 diff 或插入预览）、`clearInlineEdit`
- `ensureInlineEditField()`：首次使用时用 `StateEffect.appendConfig` 注入 field；`applyInlineEditEffect()` 在未注入时静默跳过
- `readInlineEditRange()`：读取装饰**当前**范围。装饰集随每笔事务 `map(tr.changes)`，因此这就是接受时需要写入的偏移
- `InlineEditPreviewWidget`：`Decoration.replace` 覆盖选区（插入形态为零长度 block widget），DOM 内渲染 diff span 与页脚。页脚左侧为身份标签（品牌标记 `OPENCODIAN_APP_ICON_ID` + 功能名 `inlineEdit.command.name`），右侧按钮顺序固定为**拒绝在前（`is-reject` 幽灵）、接受在后（`is-accept` 实心）**——主操作居右；测试与自动化按类名选择，不要按下标。预览 body 继承编辑器字体字号（展示的是正文内容）
- `eq()` 以 `token` + `busy` + 累计文本（`after`/`before`）比对，避免无关事务与重复帧重建预览 DOM：R-A3 流式期间 controller 为同一编辑复用稳定 `previewToken`，文本不变时 `eq` 为真跳过重建
- `busy: true`（生成中流式帧）在根元素挂 `is-busy`，页脚加 `inlineEdit.preview.generating` 标记（转圈图标 + 文案），并接受/拒绝按钮禁用——中间态必须可识别为"生成中"，不得被误认为最终结果

## 依赖

- `@codemirror/state`、`@codemirror/view`
- `./InlineEditDiff`（`renderDiffInto`）、`./InlineEditTypes`

## 维护约束

- 装饰只在 effect 中重建；`update()` 内除 effect 分支外只做 `decorations.map(transaction.changes)`
- 预览 widget 的 `ignoreEvent()` 必须返回 `false`，让接受/拒绝按钮自己处理事件，编辑器不抢键
- 预览用 `Decoration.replace` 覆盖选区是刻意的：接受前的原位预览；脏检查负责发现用户对同一范围的修改
- 新增交互前先确认 `readInlineEditRange()` 仍返回可用于 `editor.replaceRange` 的范围

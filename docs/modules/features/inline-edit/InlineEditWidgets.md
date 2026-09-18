# InlineEditWidgets

> **源码**: `src/features/inline-edit/InlineEditWidgets.ts`
> **状态**: [REVIEW]

## 概述

inline edit 的 CodeMirror 6 装饰层，只负责**预览**。R-A5 起状态从"单个 payload"改为**按 `editId` 键控的集合**：一个 `StateField`（`decorations: DecorationSet` + `entries: Map<editId, {payload, from, to}>`）加三个 `StateEffect`——`upsertInlineEditPreview(payload)`（插入或替换某一个编辑的预览）、`removeInlineEditPreview(editId)`（只清一个）、`clearAllInlineEditPreviews`（编辑器卸载/全量关闭）。指令输入已移至悬浮面板 `InlineEditInputOverlay`（`docs/requirements/inline-edit.md` §7.4）。

## 职责

- 定义三个 effect（见上）；payload 携带 `editId`，`token` 仍服务流式 `eq()` 比对
- `ensureInlineEditField()`：首次使用时用 `StateEffect.appendConfig` 注入 field；`applyInlineEditEffect()` 在未注入时静默跳过
- `readInlineEditRange(state, editId)`：按 id 读该编辑装饰的**当前**范围。装饰与条目偏移都随每笔事务映射（replacement：`from` assoc +1 / `to` assoc -1，对齐 `EditorSelection.range`；insertion widget：side 1），因此这就是接受时需要写入的偏移；兄弟编辑的写入只经 `map(tr.changes)` 移动本编辑的锚点，不触碰其快照比对
- 集合重建时按 `from` + `startSide` 排序后再 `Decoration.set`（CodeMirror 要求有序输入）；replace 条目坍缩（锚定文本被删）时渲染为空——脏检查随后拒绝写入，fail safe
- R-A6：整篇编辑必然超词级 LCS 预算 → `renderDiffInto` 走整段 before/after 降级视图并渲染「内容过大」标注；`busy` 且降级时只渲染轻量进度行（已生成 N 字符），避免每帧重建两块巨型 DOM
- `inlineEditPreviewField` 导出给契约测试做状态级断言（upsert/remove/clear、交叉接受锚点映射、脏检查互不误伤）
- `InlineEditPreviewWidget`：`Decoration.replace` 覆盖选区（插入形态为 `block: true, side: 1` 的零宽度 widget——**两条语义是脏检查与写入范围正确性的承重墙**：block replace 会被 CM 扩展到整行，破坏部分行选区的快照比对），DOM 内渲染 diff span 与页脚。页脚左侧为身份标签（品牌标记 `OPENCODIAN_APP_ICON_ID` + 功能名 `inlineEdit.command.name`），右侧按钮顺序固定为**拒绝在前（`is-reject` 幽灵）、接受在后（`is-accept` 实心）**——主操作居右；测试与自动化按类名选择，不要按下标。预览 body 继承编辑器字体字号（展示的是正文内容）
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

## R-C2 扩展

2026-09-18 预览装饰的分发入口从 `InlineEditController` 迁入本模块（`dispatchInlineEditPreview` / `clearInlineEditPreview` / `dispatchInlineEditStreamingPreview` + `InlineEditPreviewDispatchEdit` / `InlineEditPreviewDispatchHost`）：controller 通过注入的 host 桥（token 计数、焦点归属、accept/reject、isLive）调用，行为与原实现逐行等价（offset 钳制、token 复用、focus 归属均在）。迁移原因是 controller 的 max-lines 预算；随 R-C2 图像生成提交一并落地，非行为变更。

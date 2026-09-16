# InlineEditSelectionAffordance

> **源码**: `src/features/inline-edit/InlineEditSelectionAffordance.ts`
> **状态**: [REVIEW]

## 概述

选区悬浮按钮：非空选区出现时，在选区末端附近渲染一个铅笔图标按钮，点击即以该选区唤起 inline edit。作为 CodeMirror 6 `ViewPlugin` 由 `main.ts` 通过 `registerEditorExtension` 全局注册一次。

## 职责

- `inlineEditSelectionAffordanceExtension(deps)`：构造 ViewPlugin。deps 注入 `canShow`（命令可用 + 设置开关）、`isEditing`（controller 是否有活动编辑）、`openForView`（找到所属 MarkdownView 后调 `controller.open`）
- 选区变化、滚动、设置切换时经 `requestAnimationFrame` 延迟同步：`coordsAtPos` 等测量必须发生在 update 循环之外
- `sync()`：选区为空、行内编辑进行中、只读编辑器或依赖未就绪时隐藏；坐标为 null（选区在可视区外）时也隐藏，位置钳制在编辑器 DOM 内
- 按钮为 `view.dom` 内的绝对定位子元素；`mousedown` 阻止默认行为以防选区在 click 前塌陷，`click` 才触发打开
- `findMarkdownViewForView(app, editorView)`：反向解析 EditorView 所属的 Obsidian `MarkdownView`（遍历 `workspace.getLeavesOfType('markdown')` 比对 `editor.cm`），供 `openForView` 使用

## 依赖

- `@codemirror/view`（`ViewPlugin`、`EditorView`）、`obsidian`（`MarkdownView`、`setIcon`）、`../i18n`、`./InlineEditController`（`getEditorView`）

## 维护约束

- 测量（`coordsAtPos`、`getBoundingClientRect`）只允许在 rAF 回调里做，禁止在 `update()` 内直接调用
- 交互守卫顺序不可变：先判 `isEditing` 再显示——编辑进行中悬浮按钮必须消失，否则会盖住输入框
- 按钮始终 append 到 `view.dom` 末尾并由本插件管理生命周期（`destroy` 移除监听与 DOM）；不要把它做成 widget，widget 会参与事务映射
- 打开路径必须复用命令同一条链（`controller.open(editor, view)`），不要在此处复制锚点构建逻辑

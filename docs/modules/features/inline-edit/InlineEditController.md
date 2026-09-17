# InlineEditController

> **源码**: `src/features/inline-edit/InlineEditController.ts`
> **状态**: [REVIEW]

## 概述

inline edit 的 CM6 状态机与编辑器胶合层。由 `editorCallback` / `editor-menu` 触发，是"选区或光标 → 内嵌输入框 → diff 预览 → 接受/拒绝"的唯一编排者。

状态机见 `docs/requirements/inline-edit.md` §7.3：`idle → input → generating → preview → applied/rejected → idle`，另有 clarification 与 error 两个回到 `input` 的分支。

## 职责

- 解析编辑器锚点：`getEditorView(editor)` 取 Obsidian 内部 `editor.cm`，失败即停用并提示；用 `state.doc.sliceString(from, to)` 取快照（**不用** `editor.getSelection()`，其会归一化行尾导致脏检查失真）
- 判定三种形态：selection / cursor-inline（行内有文本）/ cursor-inbetween（空行）
- 通过 `InlineEditHost` 解析 backend 与模型；无 adapter 或无 AuxQuery 能力时提示并中止
- 渲染：输入阶段走悬浮面板 `InlineEditInputOverlay`（`renderInput` 创建/增量更新，含模型与努力程度 chip）；预览阶段仍走 CM6 装饰（`ensureInlineEditField` 注入 field）。`showSelectionHighlight` 复用既有选区高亮
- 悬浮条选择器：`loadModelChoices` 异步拉模型列表；`pickModel`/`pickEffort` 写回 host 覆盖设置；会话已启动（`hasSession`）后 chip 禁用，改动只影响下一次会话
- 提供商图标：`modelChipState` 经 `inferInlineEditModelProvider`（`provider/model` 前缀，claude-code→anthropic、codex→openai）给 chip 与菜单项注入 `iconProvider`；overlay 的 `createProviderIcon` 回调透传 `host.createProviderIcon`（与主输入窗口同一 `ProviderIconService` 管线），解析失败由 overlay 回退 lucide 字形
- 接受路径：读取装饰**映射后**的当前范围 → 脏检查（当前文本与快照全等）→ 关闭会话 → 单次 `editor.replaceRange`（Obsidian 原生 undo 一步可撤）
- 拒绝：悬浮条三条取消路径（任意焦点 Esc / 面板外点击 / 焦点移出面板）与 ✕ 按钮都汇入 `reject()`；取消并 dispose 会话
- 预览态键盘：Enter 接受、Esc 拒绝，监听挂在 `editorView.dom.ownerDocument`，所有判定带 `!event.isComposing` 保护中文输入法
- 单例语义：同一时刻只允许一个 inline edit，唤起新的先拒绝旧的

## 依赖

- `./InlineEditHost`、`./InlineEditService`、`./InlineEditPrompt`、`./InlineEditTypes`、`./InlineEditWidgets`
- `src/utils/editorSelectionHighlight.ts`、`src/i18n`
- `@codemirror/view`、`obsidian`

- 附加上下文：`ActiveEdit.contextFiles`（至多 `INLINE_EDIT_MAX_ATTACHED_NOTES`，超限 `notify` 拒绝）随编辑存活，因此澄清轮次保留；`openContextPicker` 按需向 host 取候选，`toggleContextFile` 增删后重渲染并刷新选择器 ✓ 标记；`buildRequest(anchor, instruction, contextFiles)` 把路径透传给提示词（只传路径，不读文件内容）。

## 维护约束

- 写回只能有一次 `editor.replaceRange`；不要改成多次编辑或直接改 CM6 文档
- 接受前必须走脏检查；用户或其它事务改动了选区文本时拒绝落盘并提示，而不是按旧偏移写入
- 所有键盘判定都要保留 `isComposing` 检查
- 不要在 CM6 `update()` 内 dispatch；状态通过 `InlineEditWidgets` 的 effect 驱动
- `open()` 的参数是窄化的 `InlineEditEditorContext`，为了同时兼容 `MarkdownView` 与 `MarkdownFileInfo`

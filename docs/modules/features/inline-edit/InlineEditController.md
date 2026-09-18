# InlineEditController
> 2026-09-18 (R-B1/R-B2): `applyOutcome` runs the strictly-parsed result through `applyInlineEditAutoLinks` before the preview payload is built (links visible/rejectable in the diff; byte-identical when the seam is absent or off); all attachment orchestration (picker/toggle/drop/group/image) moved to `InlineEditAttachmentCoordinator` in InlineEditAttachments so this file stays under the file-size gate.

> **源码**: `src/features/inline-edit/InlineEditController.ts`
> **状态**: [REVIEW]

## 概述

inline edit 的 CM6 状态机与编辑器胶合层。由 `editorCallback` / `editor-menu` 触发，是"选区或光标 → 内嵌输入框 → diff 预览 → 接受/拒绝"的唯一编排者。

状态机见 `docs/requirements/inline-edit.md` §7.3：`idle → input → generating → preview → applied/rejected → idle`，另有 clarification 与 error 两个回到 `input` 的分支。

## 职责

- 解析编辑器锚点（`InlineEditAnchor.ts`）：`getEditorView(editor)` 取 Obsidian 内部 `editor.cm`，失败即停用并提示；用 `state.doc.sliceString(from, to)` 取快照（**不用** `editor.getSelection()`，其会归一化行尾导致脏检查失真）
- 判定四种形态：selection / cursor-inline（行内有文本）/ cursor-inbetween（空行）/ document（整篇）
- 通过 `InlineEditHost` 解析 backend 与模型；无 adapter 或无 AuxQuery 能力时提示并中止
- 渲染：输入阶段走悬浮面板 `InlineEditInputOverlay`（`renderInput` 创建/增量更新，含模型与努力程度 chip 与 `#` 预设列表 `presets: host.listPresetPrompts()`）；预览阶段仍走 CM6 装饰（`ensureInlineEditField` 注入 field）。`showSelectionHighlight` 复用既有选区高亮
- 悬浮条选择器：`loadModelChoices` 异步拉模型列表；`pickModel`/`pickEffort` 写回 host 覆盖设置；会话已启动（`hasSession`）后 chip 禁用，改动只影响下一次会话
- 提供商图标：`modelChipState` 经 `inferInlineEditModelProvider`（`provider/model` 前缀，claude-code→anthropic、codex→openai）给 chip 与菜单项注入 `iconProvider`；overlay 的 `createProviderIcon` 回调透传 `host.createProviderIcon`（与主输入窗口同一 `ProviderIconService` 管线），解析失败由 overlay 回退 lucide 字形
- 接受路径：读取装饰**映射后**的当前范围 → 脏检查（当前文本与快照全等）→ 关闭会话 → 单次 `editor.replaceRange`（Obsidian 原生 undo 一步可撤）
- 拒绝：悬浮条三条取消路径（任意焦点 Esc / 面板外点击 / 焦点移出面板）与 ✕ 按钮都汇入 `reject()`；取消并 dispose 会话
- 预览态键盘：Enter 接受、Esc 拒绝，监听挂在 `editorView.dom.ownerDocument`，所有判定带 `!event.isComposing` 保护中文输入法
- R-A5 多片段并行：编辑按 `EditorView` 分桶（`Map<EditorView, Map<editId, ActiveEdit>>`），同一笔记可并存多个编辑（选区改写 + 光标插入等），互相独立：接受/拒绝只影响自己；打开新编辑**不再**拒绝旧编辑。单编辑器并发上限取 `host.getMaxConcurrentEdits()`（默认 3），超限提示且**不销毁已有编辑**。每个编辑的 Enter/Esc 只作用于「当前编辑」——面板 focusin 与预览渲染时向控制器登记焦点（`focusEdit`），键盘分派见 `InlineEditKeyboard`（每 document 单监听，防一次 Enter 双接受）。`close()` 无参 = 全部 dispose（编辑器卸载/vault 切换），`close(editId)` 只关一个；装饰/高亮均按键控清理，无残留。`pruneDetachedEdits()` 由 main.ts 挂在 `active-leaf-change`/`layout-change` 上：编辑视图离开 DOM（关标签页、切文件）时批量 dispose 该视图的全部编辑与会话（R-A5 验收 5）
- R-A6 整篇形态：`open(editor, view, { mode: 'document' })`（命令 `inline-edit-document` 与面板形态切换共用）；锚点为全文快照（脏检查覆盖整篇）；接受前二次确认（`confirmDocumentReplace`，取消无写入）；仍为单次 `editor.replaceRange` 覆盖整篇，Ctrl+Z 一步恢复。开关 `inlineEditDocumentModeEnabled` 关闭时拒绝打开；笔记超过 `INLINE_EDIT_MAX_DOCUMENT_CHARS`（200k）在打开前即拒绝提示，**不做分块**
- R-A7 上下文扩展：附加上下文支持文件夹条目（每条目计 1、同路径校验）；面板支持从文件树**拖入** vault 文本文件/文件夹成 chip（拖拽解析经宿主 `resolveContextFile` → `getAbstractFileByPath` + instanceof 校验）；上限超限提示不截断（逻辑在 `InlineEditAttachments`）
- R-A3 流式 diff 预览：`submit()` 为每轮创建 `InlineEditStreamSession`（`InlineEditStreamPreview.ts`），`onTextChunk` 重解析累计文本；开标签到达前澄清文本逐帧流入输入框上方回复区（`renderStreamingReply`），识别到标签即切预览通道（`renderStreamingPreview`，`busy: true` + 稳定 `previewToken`，经 rAF 合批每帧至多一次装饰 dispatch）；渐进解析报 violation 时冻结最后一帧好画面，回合收尾以 `parseInlineEditResponse()` 严格解析为准——不一致则 `clearStreamingPreview` 清预览 + 报错，绝不部分应用。Esc 取消走 `close()`：先 `stream.dispose()` 丢 pending 帧再 `clearInlineEdit`，无残留装饰
- R-A4 图片附件：`attachImage`（粘贴/拖拽，经 `InlineEditImageChip` 校验——类型白名单 / ≤4MB / 至多 1 张，拒绝均带提示）挂在 edit 上仅首轮随 `submit({images})` 下发，澄清轮复用已见图会话；`supportsImages === false` 的后端提交时显式报 `inlineEdit.error.imagesUnsupported`，不静默降级
- chip 状态与选择持久化已移至 `InlineEditOverlayChips.ts`（`inlineEditModelChipState` / `inlineEditEffortChipState` / `runInlineEditModelPick` / `runInlineEditEffortPick` / `loadInlineEditModelChoices`），本文件只做委托
- 接受路径本体在 `InlineEditAccept.ts`（脏检查、整篇二次确认、单次写入）；锚点构造在 `InlineEditAnchor.ts`；键盘分派在 `InlineEditKeyboard.ts`；`getEditorView` 在 `InlineEditEditorView.ts`；形态切换 UI 在 `InlineEditModeSwitch.ts`；附件管理在 `InlineEditAttachments.ts`

## 依赖

- `./InlineEditHost`、`./InlineEditService`、`./InlineEditPrompt`、`./InlineEditTypes`、`./InlineEditWidgets`、`./InlineEditOverlayPrimitives`（`choicesToMenuItems`）
- `src/utils/editorSelectionHighlight.ts`、`src/i18n`
- `@codemirror/view`、`obsidian`

- 附加上下文：`ActiveEdit.contextFiles`（至多 `INLINE_EDIT_MAX_ATTACHED_NOTES`，超限 `notify` 拒绝）随编辑存活，因此澄清轮次保留；`openContextPicker` 按需向 host 取候选，`toggleContextFile` 增删后重渲染并刷新选择器 ✓ 标记；`buildRequest(anchor, instruction, contextFiles)` 把路径透传给提示词（只传路径，不读文件内容）。

## 维护约束

- 写回只能有一次 `editor.replaceRange`；不要改成多次编辑或直接改 CM6 文档
- 接受前必须走脏检查；用户或其它事务改动了选区文本时拒绝落盘并提示，而不是按旧偏移写入
- 所有键盘判定都要保留 `isComposing` 检查
- 不要在 CM6 `update()` 内 dispatch；状态通过 `InlineEditWidgets` 的 effect 驱动
- `open()` 的参数是窄化的 `InlineEditEditorContext`，为了同时兼容 `MarkdownView` 与 `MarkdownFileInfo`

## R-C2 扩展

2026-09-18 新增图像生成分支：ActiveEdit 增加 `imageGenForm`（off→line→inline chip 循环，仅 input 相位可切）、`imageGenAbort`（生成中 Esc → abort）、`pendingImageAssetPath`。`submit()` 在 chip 非关时改走 `submitImageGeneration`（generate → W-asset → 登记 → 以 insertion preview 进入既有接受流）；生成/保存失败回 input 相位并显示原因；编辑中途销毁（disposeEdit）时 abort 在途生成并按 `imageGenerationAssetCleanup` 清理孤儿资产；`reject()` 对带资产预览执行同一清理策略。唯一 `editor.replaceRange` 写原语不变。

## R-C2 后续调整：预览分发迁出

2026-09-18（同一提交）`renderPreview` / `clearStreamingPreview` / `renderStreamingPreview` 的装饰分发体迁至 `InlineEditWidgets`（`dispatchInlineEditPreview` 等，经 `previewDispatch` host 桥调用），`renderStreamingReply` 留在 controller。行为不变（controller 单测全绿），仅为 max-lines 预算的结构性迁移。

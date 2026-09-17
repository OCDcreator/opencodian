# InlineEditInputOverlay

> **源码**: `src/features/inline-edit/InlineEditInputOverlay.ts`
> **状态**: [REVIEW]

## 概述

行内编辑的**悬浮指令条**：取代早期嵌在正文文字流里的 CM6 block widget 输入框。面板绝对定位于 `view.dom` 内、锚在编辑锚点下方，不挤开正文；滚动跟随、文档变更时锚点偏移经事务重映射。

## 职责

- `InlineEditInputOverlay`：面板生命周期。`show(pos)` 建面板并定位；`update(state)` 增量刷新（保留输入框焦点与值，只改 reply/error/busy/占位符/chip 标签）；`hide()` 移除 DOM 并解绑全部监听
- 三条取消路径：文档捕获态 Escape（先关菜单再拒绝）、面板外 pointerdown 拒绝（点面板内但在菜单外=只关菜单）、focusout 且 relatedTarget 在面板外拒绝（relatedTarget 为 null 的窗口切换不取消）；另有面板上的 ✕ 按钮
- chip 下拉：模型/努力程度两个 chip；`toggleMenu` 渲染 `.opencodian-inline-edit-menu`（第一项恒为"跟随聊天模型/默认"即清除覆盖，其余来自 host 的选择列表）
- DOM 布局契约（Cursor cmd-K 指令条骨架，详见 `docs/modules/style/features/inline-edit.md`）：澄清/错误块（图标 + 文本）置顶 → `inputrow`（品牌标记 `OPENCODIAN_APP_ICON_ID` **在字段框外**作条子头像并钉在首行 + `inputfield` 字段框体 + 贴底的实心提交/幽灵关闭按钮）→ `chipbar` 页脚（模型 chip = 提供商品牌图标 + 模型名；努力 chip = brain 图标 + 可见文字标签 + 值；无 kbd 提示）。字段框体承担填充、发丝内环与内边距，`textarea` 自身被压成透明无边框（宿主主题会给裸表单控件加边框，见样式模块文档）。chip 前缀图标经 `createProviderIcon` 回调（与主输入窗口同一 `ProviderIconService` 管线）解析，失败回退 lucide 字形；chip 的 `title` 提供完整标签 tooltip。菜单行统一 13px 图标槽（模型行品牌图标、努力行 signal-low/medium/high 信号格、清除行 messages-square/rotate-ccw），保证 label 对齐；busy 时提交按钮图标换 `loader-circle` 并加 `.opencodian-inline-edit-spinning`，品牌标记 pulse
- 指令字段是 **`textarea`**：默认一行，随内容增高到 `FIELD_MAX_HEIGHT`(120px)，再多则内部滚动（`overflow-y: auto`）。增高由 `syncFieldHeight()` 完成，**在 `input` 处理器里同步调用**（浏览器 rAF 在窗口隐藏时会完全暂停，增高不能依赖它；读写自己 textarea 的 `scrollHeight` 在任何处理器里都安全），rAF 的 `sync()` 里再调一次以覆盖程序化赋值（澄清重试）路径。键位：**Enter 提交、Shift+Enter 换行、Escape 仍走文档捕获态关闭**，全部带 `isComposing` 保护
- 纵向定位走导出的纯函数 `resolvePanelTop()`（有单测）：优先放在锚点下方；条子（多行指令会显著变高）在下方放不下、而上方放得下时翻到锚点上方，两边都放不下时保持下方并裁切（维持光标侧阅读顺序）。DOM 测量仍在 overlay 内、仍只在 rAF 里做
- `InlineEditOverlayChipState.iconProvider` / `InlineEditOverlayMenuItem.iconProvider`：controller 按 `provider/model` 前缀或后端映射（claude-code→anthropic、codex→openai）注入；overlay 据此请求图标并按 `dataset.iconKey` 去抖重建
- 定位：`coordsAtPos(anchorPos)` 换算成 `view.dom` 相对坐标（减去 `getBoundingClientRect()` 偏移）后钳制；测量只在 rAF 里做；锚点滚出视口时保持上一位置
- `inlineEditOverlayTrackerExtension()`：全局唯一 `EditorView.updateListener`，经 WeakMap 找到当前 view 的活动面板，把 `anchorPos` 经 `update.changes.mapPos` 重映射；`main.ts` 用 `registerEditorExtension` 注册一次
- `choicesToMenuItems()`：host 选项 → 菜单项（含 activeId 高亮）

## 依赖

- `@codemirror/state`、`@codemirror/view`、`obsidian`（`setIcon`）、`../i18n`、`./InlineEditTypes`（`InlineEditChoice`）

## 维护约束

- 面板内 `update()` 不得重建输入框——澄清循环回来时用户焦点/输入必须保留- 测量（`coordsAtPos`/`getBoundingClientRect`/`offsetWidth`）只允许在 rAF 回调；CM6 update 循环内只做位置重映射记账
- 取消语义集中在 overlay 回调（`onReject`），controller 是唯一状态机；不要在 overlay 里自行判断 phase
- 每个 EditorView 同时最多一个面板（WeakMap 单槽）；`hide()` 必须清理监听，否则文档级捕获监听会泄漏
- 生成中的 busy 态保留面板但禁用输入与 chip；面板外点击在 input/generating 阶段都是取消（preview 阶段由 controller 的文档键处理，面板已隐藏）

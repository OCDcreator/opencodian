# InlineEditAtTrigger

> **源码**: `src/features/inline-edit/InlineEditAtTrigger.ts`
> **状态**: [REVIEW]

## 概述

R-A1「笔记内 `@` 唤起」：CM6 `EditorView.inputHandler` 拦截在**行首或空白后**键入的 `@`，在光标处打开行内编辑面板，`@` 本身不落文档。设置 `inlineEditTriggerAt`（默认 `false`）控制；关闭时 handler 对每个输入立即返回 `false`，行为与未注册完全一致。

为什么用 `inputHandler` 而非 keymap（`docs/requirements/flowtext-parity.md` R-A1）：`@` 在多数键盘布局上是组合键序列产出，keydown keymap 拿到的 key/code 不可靠；`inputHandler` 收到的是解析后的插入文本，返回 `true` 即消费输入——这也是 `@` 不进文档的机制。

## 职责

- `shouldTriggerAtInput(input)`：纯判定（有单测）。触发位 = 行首（`line.from === from`）或前一字符为 `\s`（含全角空格）；`text` 必须恰好是 `'@'`（粘贴多字符不触发）；替换非空选区时不触发（`user@example.com` 中间键入 `@` 的场景因此天然豁免）
- `inlineEditAtTriggerExtension(deps)`：注册一次的 CM6 扩展。守卫顺序先廉价后昂贵：`text !== '@'` → `view.composing`（IME 组合态一律不拦截，与 `InlineEditController` 文档键处理的 `isComposing` 纪律一致）→ `state.readOnly` → `deps.canTrigger()` → 纯判定 → `deps.openForView(view)`
- `InlineEditAtTriggerDeps`：`canTrigger()` = 设置开关 AND 既有行内编辑可用性（主开关 + 只读后端能力），与命令入口同一道门；`openForView(view)` 解析宿主 `MarkdownView`（无文件关联的编辑器返回 `false`，`@` 照常键入），面板真正打开时返回 `true`（消费该输入）

## 依赖

- `@codemirror/state`（`Extension` 类型）、`@codemirror/view`
- 由 `src/main.ts`（`app.composition`）以 `registerEditorExtension` 注册一次

## 维护约束

- Reading mode 天然见不到本扩展（无 CM6 编辑器）；「无文件关联不注册」以 per-keystroke 门控实现（`openForView` 拒绝并放行字符），不引入动态扩展注册
- 消费决策必须来自 `openForView` 的返回值：门通过但面板未真正打开时，`@` 必须落回文档，不得吞字
- 不要把判定挪到 keymap / `beforeinput` DOM hack：布局相关字符走 `inputHandler` 是需求文档的硬性技术约束

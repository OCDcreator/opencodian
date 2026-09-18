# InlineCompletionGhost

> **源码**: `src/features/inline-edit/InlineCompletionGhost.ts`
> **状态**: [REVIEW]

## 概述

R-C3 的 CodeMirror 6 ghost text 层（§3.3）。两条硬性装饰规则：建议只以 `Decoration.widget`（side 1）渲染，**永不** `Decoration.replace`（不进文档、不动 undo 栈）；`EditorView.atomicRanges` 覆盖建议区间让光标跳过——原子 facet 用不可见 `Decoration.mark` 范围（点状 widget 装饰是零宽，永远过不了 CM6 的 `pos > from && pos < to` 跳跃判定），全模块不存在 replace 调用（有静态源码断言钉死）。

## 职责

- `inlineCompletionGhostField`：`{ pos, text, prefixTail } | null`；任何 docChanged 或显式 selection 更新在 state 层清空建议（陈旧建议不可能活得比它依赖的文本更久）；同事务内的 set-effect 仍生效（Tab 接受用它单事务清 ghost）
- `setInlineCompletionGhost` effect；`readInlineCompletionGhost`；`ensureInlineCompletionGhostField`
- 装饰提供：`EditorView.decorations.from`（唯一 widget）+ `EditorView.atomicRanges.from`（`[pos, pos+len)` mark 范围）
- `GhostWidget`：`span.cm-inline-completion-ghost`，`eq()` 按 text 比较，`aria-hidden`
- `inlineCompletionGhostExtension(deps)`：注册一次的扩展束——字段、`Prec.highest` Tab/Esc keymap（有 ghost 才消费；Tab 拒绝组合态）、全键 domEventHandlers 喂 `AltSoloGestureTracker`（任何键都要过 tracker，非 Alt 键打断手势；`canTrigger()` 首个判断即返回）、updateListener 把 docChanged/selection 转 `onEditorActivity`

## 依赖

- `@codemirror/state`、`@codemirror/view`、`./InlineCompletionTrigger`

## 维护约束

- 「关闭时零开销」口径（C3-Q1）：扩展在插件 load 注册一次，关闭时仅剩被门控的空转键处理器 + null 值字段——与已交付的 `@` 触发同构；验收 7 按「无会话、无网络、无装饰」解释
- 不得把 ghost 改成 replace 装饰或把原子范围换成可见替换；静态断言 `no Decoration.replace(` 在本模块测试里
- Tab/Esc 的 keymap 消费必须依赖「ghost 存在」判断，避免吞掉正常的 Tab 缩进 / Esc 行为

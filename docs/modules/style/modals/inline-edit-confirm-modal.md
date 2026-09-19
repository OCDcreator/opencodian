# Inline Edit Confirm Modal Styles

> **源码**: `src/style/modals/inline-edit-confirm-modal.css`
> **状态**: [REVIEW]

## 职责

整篇行内编辑**二次确认弹窗**（R-A6 验收 6）的破坏性按钮对比度契约。该弹窗把守单次 `editor.replaceRange` 整篇写入：按钮经 Obsidian 原生 `setWarning()` 产出（`mod-destructive`/`mod-warning` 破坏性词汇），承载「替换整篇」这一高风险确认，标签对比度不足是真实的可达性缺口而非观感问题。

## 关键类名 / CSS 变量

- 弹窗根：`.opencodian-inline-edit-confirm-modal`（由 `InlineEditConfirmModal.ts` 加在 `modal.modalEl` 上）。确认按钮是 `Setting().addButton(...)` 的产物、与消息 div（`.opencodian-inline-edit-confirm`）互为兄弟，因此规则必须挂在**弹窗级**类上才能命中。
- 破坏性确认按钮对比度契约：宿主主题把近黑标签压在 `rgb(211,47,47)` 上，**实机实测仅 4.22:1**，低于 13px 标签的 4.5:1 下限。本模块复用工具审批弹窗（`obsidian-tooling-confirm-modal.css`「拒绝按钮对比度契约」）的同一配方：DESIGN.md rose 与 ink-graphite 的 72/28 混色作底、标签改 `#fff`——同配方在兄弟模块**实测约 7.3:1**，本混色按 WCAG 相对亮度计算约 **7.36:1**。选择「加深底色 + 浅标签」而非「提亮底色」：提亮只在浅色主题成立、深色主题反向劣化，且违反 DESIGN.md §2 Status Honesty Rule（不得把危险色软化到看不出风险）。加深后的按钮仍明确读作破坏性操作：深危险底、浅标签、原生破坏性词汇未动。同时命中 `.mod-destructive`（1.13.x `setWarning()` 实测产出）与 `.mod-warning`（旧版/显式词汇）两个类名，Obsidian 版本漂移不掉契约。
- 动效：仅 150ms 背景色过渡，`prefers-reduced-motion` 下取消；无布局 token（弹窗其余部分沿用宿主默认样式，本模块刻意不加）。

## 关联 TS 组件

- `src/features/inline-edit/InlineEditConfirmModal.ts`（DOM 合同来源；fail-closed 关闭语义：取消、Esc、关闭窗口都 resolve `false`，只有显式点击确认才写入）

## 修改注意点

- 改动背景/标签两个值时必须保证对比度在两个主题下都 ≥4.5:1；禁止改用「提亮 rose」路线（见上）。
- 契约测试 `tests/unit/uiCssDesignContract.test.ts` 断言本文件的混色、浅标签与 `mod-destructive`/`mod-warning` 双词汇命中；改动需同步断言。真实对比度无法单测，数字来自实机测量（修复前 4.22:1，工具审批弹窗同配方实测 ~7.3:1），由主智能体的 live 验收复核。

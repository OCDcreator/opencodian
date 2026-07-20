# ComposerPopoverFrame

> **源码**: `src/features/chat/ui/ComposerPopoverFrame.ts`
> **状态**: [REVIEW]

## 概述

`ComposerPopoverFrame` 为 Composer 的 Agent、权限和模型下拉卡片提供共享的 header、content、footer DOM 外壳。它只接收展示文案并返回内容挂载点，不拥有任何 selector catalog、风险分类、持久化、后端调用或运行时协调责任。

## 公开接口

- `mountComposerPopoverFrame(dropdownEl, texts)` 在既有 selector-specific dropdown 内追加一个 frame，返回 `contentEl` 和 `refresh()`。
- `refresh()` 只更新标题、Esc keycap 和 footer 文案；它不会清空或替换 `contentEl`。

## DOM 合约

frame 内部顺序固定为 header（title、Esc keycap）、content、footer（本地化的 `↑↓ Navigate`、`Enter Select`、`Esc Close` 提示）。调用方仍是 dropdown/listbox 的所有者：frame 不设置 listbox 角色，也不改变触发器、overlay 布局或 option 选择逻辑。

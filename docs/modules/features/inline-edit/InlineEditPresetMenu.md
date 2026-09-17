# InlineEditPresetMenu

> **源码**: `src/features/inline-edit/InlineEditPresetMenu.ts`
> **状态**: [REVIEW]

## 概述

R-A2「`#` 预设提示词菜单」的机制层：触发判定、过滤、键盘行走、行渲染，以及驱动这一切的 `InlineEditPresetMenuController`。从 `InlineEditInputOverlay` 抽出（同一 max-lines 预算规则，见 `InlineEditOverlayPrimitives` 概述）；overlay 保留共享菜单槽的容器、Escape/pointer-down 顺序，把 `#` 相关一切委托给 controller。

触发契约（`docs/requirements/flowtext-parity.md` R-A2）：`#` 仅在「输入开头或空白后」且「其后紧跟的不是非空字符」时打开菜单（`#标签` 兼容 Obsidian 标签输入）；菜单开启期间输入继续即为过滤（`#扩展` 按 `扩展` 过滤）；选定预设**填入输入框不提交**；Esc 关闭菜单且输入不变；IME 组合态不触发。

## 职责

- `findPresetTokenAtCursor(value, cursor)`（纯）：距光标最近的、位于 0 或空白后的 `#`，且 `#` 与光标间无空白；返回 `{ tokenStart, query }`
- `didTypeStandaloneHash(previousValue, value, cursor)`（纯）：**唯一开菜单时刻**——上一次编辑恰在光标前插入一个 `#`，且光标后字符为输入末尾或空白（与 `findPresetTokenAtCursor` 配合把「刚敲的 `#`」和「既有的 `#` 文本」区分开，这是 `#标签` 关闭态不误触的关键）
- `filterInlineEditPresets(presets, query)`（纯）：label / prompt 正文的大小写不敏感子串过滤，保持目录顺序；空查询返回全部
- `replacePresetTokenAtCursor(current, cursorPos, replacement)`（纯）：把 `#…` token（至下一个空白或输入末尾，含光标后残余）替换为预设正文，保留周边文本
- `movePresetSelection(selectedIndex, itemCount, delta)`（纯）：循环行走
- `renderPresetMenuInto(container, options)`：行重建渲染（列表小、不持焦点态）；prompt 正文放在行 `title` tooltip；hover 上报、click 选定；空结果显示 empty 行
- `InlineEditPresetMenuController`：对 overlay 私有状态的编排器——`bindField(field)` 绑定 click/keyup/组合态监听（每元素一次）；`sync()` 开/关/过滤状态机；`refresh()` 重过滤重渲染（选中项钳制）；`handleKeydown(event)` ↑↓ 行走 + Enter 填入（消费事件，绝不触发提交）；`reset()` 由 overlay 统一 `closeMenu()` 调用，保证 Escape、面板外点击、chip 菜单抢占、面板拆除走同一条清理路径

## 依赖

- `obsidian`（`setIcon`）、`../../core/types`（`InlineEditPresetPrompt` 类型）、`../../i18n`
- overlay 经 `InlineEditPresetMenuHost` 七个小闭包注入（`getField/getPanel/getPresets/isOpen/isMenuSlotTaken/attachMenu/detachMenu/afterFill`），controller 不反向触碰 overlay 私有成员

## 维护约束

- **Enter 不得提交**：`handleKeydown` 消费 Enter 后只调 `applyAt`（填值 + 关菜单 + `afterFill` 增高），overlay 的提交路径在委托返回 `true` 时被跳过——这是需求验收第 3 条
- Escape 不在此消费：文档捕获监听（capture 阶段先于字段）统一关菜单，controller 的 `reset()` 由 overlay `closeMenu()` 调用；不要在这里加第二份 Escape 处理
- 开菜单只在 `didTypeStandaloneHash` 为真时；其余输入（含光标移回 `#` 后）一律视为过滤或关闭，否则 `#标签` 场景必然误触
- IME 组合态（`compositionstart/end` 维护的 `composing` 标志）短路 `sync()`；组合提交的 `#` 不得追溯开菜单

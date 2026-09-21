# ChatVimNavigationCoordinator

> **源码**: `src/features/chat/services/ChatVimNavigationCoordinator.ts`
> **状态**: [REVIEW]

## 概述

`ChatVimNavigationCoordinator` 将聊天根容器中的 Vim 风格导航键转发到结构化 host port。它不读取 settings、不查询全局 document，也不依赖 `OpenCodianView`；因此每个聊天根可以独立挂载和销毁，现有 Obsidian 全局快捷键不会被劫持。

## Host port

`ChatVimNavigationCoordinatorHost` 是唯一依赖边界：

- `isEnabled()` 动态返回设置是否启用；关闭时 coordinator 不消费任何按键。
- `getKeys()` 动态提供 `scrollUp`、`scrollDown`、`focusInput` 三个可配置键。
- `getMessagesContainer()` 返回当前活动消息容器；为空时滚动键保持原始行为。
- `focusComposer()` 聚焦聊天输入框。
- 可选 `hasBlockingOverlay()` 由聊天 runtime 报告当前是否有应优先处理按键的 overlay。

## 行为

- 监听器只挂在传给 `attach(root)` 的 chat root 上；重复 attach 先移除旧 root 的监听器。
- 默认上游将提供 `w` / `s` / `i`，但 coordinator 仅按 host 当前返回的键匹配，且不区分大小写。
- 滚动按当前 `clientHeight` 的 65% 调用 `messagesContainer.scrollBy({ top, behavior: 'smooth' })`；上滚为负数，下滚为正数。
- 只有已经执行滚动或聚焦时才调用 `preventDefault()`。
- 输入、文本域、选择框、可编辑内容、Ctrl/Meta/Alt/**Shift** 组合键、输入法 composing、长按 repeat、已被消费的事件和 host 阻塞 overlay 都保持原始行为。
  - Shift 是修饰键：`Shift+W` 的 `event.key` 是 `'W'`，经大小写不敏感归一化后会命中配置的 `'w'`，从而在用户输入大写字母时滚动聊天并吞掉按键。`shouldHandle()` 因此显式避让 `shiftKey`。CapsLock 或合成事件产生的「大写 key 但 `shiftKey === false`」仍按设计命中绑定（R-F6 质量修复，回归测试覆盖 `Shift+W/S/I`）。

## 生命周期

`destroy()` 移除同一个 root-scoped `keydown` listener 并释放 root 引用。调用方应在聊天视图关闭或替换根容器时调用它，避免 detached 根仍保留 coordinator。

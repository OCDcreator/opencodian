# ComposerPopoverListNavigation

> **源码**: `src/features/chat/ui/ComposerPopoverListNavigation.ts`
> **状态**: [REVIEW]

## 概述

`ComposerPopoverListNavigation` 是 Composer selector 可复用的纯 DOM roving-focus helper。它从调用方提供的 root 和 selector 派生 option，不缓存 catalog、不会读取设置，也不会调用后端或处理 selector 的选择业务。

## 公开接口

- `getPopoverOptions()` 返回匹配 selector 的 DOM option。
- `getSelectedPopoverOptionIndex()` 从 `aria-selected="true"` 取得当前选择位置。
- `focusPopoverOption()` 将请求位置限制在有效范围，设置唯一 `tabindex="0"`，焦点移动时防止浏览器默认滚动，并使活动项进入最近可见区域。
- `movePopoverOptionFocus()` 以模运算在首尾之间循环；没有焦点位置时优先从当前 aria-selected 项继续。

## 维护边界

该模块只管理元素的 `tabIndex`、focus 和 `scrollIntoView()`。Agent 与 Permission 可各自提供键盘事件和选择回调；Model 保留其搜索优先的独立交互运行时。

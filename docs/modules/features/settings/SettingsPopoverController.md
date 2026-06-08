# SettingsPopoverController

> **源码**: `src/features/settings/SettingsPopoverController.ts`
> **状态**: [REVIEW]

## 概述

Settings-local interactive popover owner. Re-parents active suggestion/history popovers to `document.body`, keeps anchored width/placement logic centralized, and prevents sticky toolbars or scroll containers from clipping the content.

## 层级合同

- 无独立 CSS 包装类: popover 元素自身获得 `position: fixed; z-index: 2280`
- z-index: 2280 (高于 quick-nav 2260，低于 tooltip 2300)
- 定位: `bottom-start` 默认，`top-start` 翻转回退
- 钳制边界: 当调用方提供 `boundaryEl` 时，popover 的 left/top/flip/clamp 逻辑限定在该元素的可见 rect 内（而非完整视口）；未提供时回退到视口级钳制
- 滚动/滚轮/键盘滚动意图自动关闭（保留 popover 内部滚动和键盘导航）

## API

- `show(options)`: 将 popover 元素移至 `document.body`，设置 fixed 定位和锚点宽度匹配，计算 placement。`options.boundaryEl` 可选指定钳制边界元素
- `hide(popoverEl?)`: 设置 `hidden` 属性，清除活跃引用和边界元素
- `ensureForDocument(document)`: WeakMap 单例
- `destroy()`: 隐藏活跃 popover，移除 resize/scroll 监听器

## 导入关系

```text
上游: 无外部依赖
下游: searchInputEnhancer, SettingsFormatterSection
```

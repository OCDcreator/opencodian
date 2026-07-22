# SettingsTooltipController

> **源码**: `src/features/settings/SettingsTooltipController.ts`
> **状态**: [REVIEW]

## 概述

Settings-local passive tooltip owner. Listens for `[data-settings-tooltip]` triggers, mounts a body-level fixed overlay, and keeps settings tooltips separate from the chat/shared tooltip layer (`TooltipLayerController`).

## 层级合同

- CSS 类: `.opencodian-settings-tooltip-layer` / `-bubble` / `-arrow`
- z-index: 2300 (高于 quick-nav 2260 和 popover 2280)
- 定位: `position: fixed`，挂载到 `document.body`

## 触发器协议

- 触发器属性: `data-settings-tooltip="<label text>"`
- 空值或缺失属性不会触发 tooltip
- 通过 `mouseover`、`focusin` 显示；`mouseout`、`focusout` 隐藏
- `relatedTarget` 保护: 鼠标/焦点移至同一触发器内部不隐藏
- 显示前会移除触发器上的 `title` 与 `aria-label`，避免 settings 自定义 tooltip 与 Obsidian 原生延迟 hover tooltip 同时出现；已有 `aria-label` 会迁移为指向自动插入 sr-only carrier 的 `aria-labelledby`，显式 `aria-labelledby` 则原样保留
- controller 同时登记到 Document 的 `Symbol.for('opencodian.settingsTooltipController')` 槽位；插件热重载时新 bundle 会销毁旧实例，并在第一次显示时移除遗留 layer，避免多个 module-local WeakMap owner 对同一 hover 重复渲染

## 几何行为

- 默认 placement 根据触发器在视口中的位置自动推导：靠右按钮优先向左、靠左按钮优先向右、靠顶部优先向下、靠底部优先向上
- 空间不足时先翻转到对侧，再在 top / bottom / right / left 之间 fallback
- top / bottom 水平居中于锚点，left / right 垂直居中于锚点，并在视口边距 12px 内钳位
- 箭头偏移通过 `--opencodian-settings-tooltip-arrow-offset` CSS 变量设置，指向锚点中心，上下限钳制保证箭头不超出气泡边界
- `data-placement` 属性驱动箭头位置 CSS（`top` 时箭头在下方，`bottom` 时在上方，`left`/`right` 时箭头在侧边）
- 可见状态通过 `is-visible` CSS 类切换（`opacity: 0` → `1`，`visibility: hidden` → `visible`）

## 生命周期

- `ensureForDocument(document)`: WeakMap 单例模式，同一 Document 只创建一个实例
- `destroy()`: 移除 DOM 层、事件监听器、WeakMap 条目
- tooltip 层在 `show()` 时创建，`hide()` 时移除（不缓存 DOM 节点）

## 导入关系

```text
上游: 无外部依赖
下游: settingsStyleControls, SettingsStyleBackgroundSection, SlashCommandCatalogRenderer, SettingsModelIconCacheManager
```

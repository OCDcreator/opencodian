# TooltipLayerController

> **源码**: `src/shared/TooltipLayerController.ts`
> **状态**: [REVIEW]

## 概述

`TooltipLayerController` 是聊天侧共享 tooltip overlay 的 owner。它把 `.opencodian-tooltip-trigger[data-tooltip]` 从“触发器自身伪元素”迁移为挂到 `document.body` 的固定层，统一处理 hover/focus、视口边缘翻转、水平/垂直 clamp，以及箭头偏移。这样 chat header、composer、tab bar、navigation sidebar、context ring 等触发器不再受按钮自身 `::after`、局部 stacking context 或祖先 `overflow: hidden` 裁切影响。

## 核心职责

- 为每个 `Document` 维护一个 singleton controller（`WeakMap<Document, TooltipLayerController>`）
- 监听 `mouseover` / `mouseout` / `focusin` / `focusout`
- 按 `data-tooltip-position` / `data-tooltip-align` 解析显式首选方位；未指定时根据触发器靠近的视口边缘自动选择方向
- 在 top / bottom / left / right 之间做 fallback / flip，避免 tooltip 压在鼠标和按钮上
- 把 tooltip layer 作为 `.opencodian-tooltip-layer` 挂到 `document.body`
- 在 `resize` / capture `scroll` 时重定位当前激活的 tooltip
- 显示前移除触发器上的 `title` 与 `aria-label`，避免 custom tooltip 与浏览器/Electron/Obsidian 原生延迟 hover tooltip 同时出现；已有 `aria-label` 会迁移为自动插入 sr-only carrier 的 `aria-labelledby`，现有显式 `aria-labelledby` 不会被改写
- controller 通过 Document 上的 `Symbol.for('opencodian.sharedTooltipLayerController')` 跨 bundle 保持唯一；热重载时先销毁旧 controller，并在显示前清理遗留 overlay，避免旧 module 的事件监听器制造重叠气泡

## 关键方法

| 方法 | 说明 |
|------|------|
| `ensureForDocument(document)` | 获取或创建文档级 controller |
| `ensureForElement(element)` | 便捷入口，按 `element.ownerDocument` 注册 controller |
| `show(anchorEl, label, options?)` | 直接显示指定 tooltip |
| `showForTrigger(trigger)` | 从 trigger 的 `data-tooltip` / `data-tooltip-position` / `data-tooltip-align` 读取配置并显示 |
| `hide(trigger?)` | 隐藏当前 tooltip |
| `destroy()` | 销毁 controller、移除全局监听器、清理当前 layer |

## 定位合同

- `VIEWPORT_MARGIN_PX = 12`
- `TOOLTIP_GAP_PX = 12`
- `TOOLTIP_ARROW_SIZE_PX = 8`
- 优先使用 trigger 指定的 placement；没有显式 placement 时，靠右按钮优先向左、靠左按钮优先向右、顶部按钮优先向下、底部按钮优先向上
- 空间不足时先翻转到对侧，再回退到其余方向
- top / bottom 方向按 anchor 中心点居中，并约束到视口内
- left / right 方向按 anchor 垂直中心对齐，并约束到视口内

## 与其他模块的交互

- `ConversationRenderService`: 在共享 tooltip label helper 中确保 controller 已注册
- `TabBar` / `NavigationSidebar` / `ContextRing`: 这些不走 `ConversationRenderService` 的 UI owner 需要自行调用 `ensureForElement()`
- `model-selector.css`: 提供 `.opencodian-tooltip-layer` / `-bubble` / `-arrow` 样式合同

## 注意事项

- 这个 controller 只负责 `.opencodian-tooltip-trigger` 族；settings quick-nav 仍保留自己的一套 overlay owner
- tooltip 内容来自 `data-tooltip`，无障碍标签仍由各 caller 负责（通常是隐藏 label + `aria-labelledby`）
- 使用 shared tooltip 的触发器不要再保留 `title`，否则会产生第二个提示框；controller 会在 hover/focus 显示时清掉这个属性作为兜底
- 若新增新的 tooltip trigger owner，又不走 `ConversationRenderService`，必须显式调用 `ensureForElement()`，否则文档级监听器不会挂载

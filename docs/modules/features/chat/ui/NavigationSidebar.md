# NavigationSidebar

> **源码**: `src/features/chat/ui/NavigationSidebar.ts`
> **状态**: [REVIEW]

## 概述

浮动导航侧栏，定位在消息容器左侧，提供四向快速导航：顶部、上一条用户消息、下一条用户消息、底部。根据消息区域的滚动状态自动显示/隐藏。支持 sticky-scroll 模式（按 turn 而非单条消息定位）。

## 导入关系
上游: `obsidian`（setIcon）、`i18n`
下游: 被 `OpenCodianView` 在消息区域实例化

## 核心类型 / 接口

无独立导出类型，但构造器现在支持一个轻量 options：

```typescript
constructor(
  mountEl: HTMLElement,
  anchorEl: HTMLElement,
  messagesEl: HTMLElement,
  options?: { onScrollToBottom?: () => void },
)
```

## 核心逻辑

### 按钮创建

四个按钮使用 Obsidian 图标：
- `chevrons-up` → 顶部
- `chevron-up` → 上一条用户消息
- `chevron-down` → 下一条用户消息
- `chevrons-down` → 底部

### 可见性控制

`updateVisibility()`：当 `scrollHeight > clientHeight + 50` 时显示，否则隐藏。

### 位置计算

`updatePosition()`：基于 `mountEl` 和 `anchorEl` 的 `getBoundingClientRect()` 差值计算 `container.style.top`，使侧栏与 anchor 元素垂直居中对齐。

### 消息导航

`scrollToMessage(direction)`：
1. 查找所有 `.opencodian-message--user` 元素
2. 计算每个消息的 `visualTop`（原始位置）和 `targetTop`（sticky 模式下为 turn 容器位置）
3. 从当前位置向前/向后搜索，使用 `threshold=30` 像素容差
4. 使用 `smooth` 滚动行为

### 响应式更新

- `ResizeObserver` 监听 mountEl、anchorEl、messagesEl 尺寸变化
- `MutationObserver` 监听 messagesEl 的 childList/subtree/characterData 变化
- scroll 事件被动监听

### 底部滚动委托

底部按钮现在不是只能直接执行：

`messagesEl.scrollTo({ top: messagesEl.scrollHeight, behavior: 'smooth' })`

如果调用方传入 `onScrollToBottom`，会优先委托给外部处理。这让 `OpenCodianView` 可以把“滚到底部”接到自己的自动滚动和 guard 逻辑上，而不是绕开那套状态机。

## 关键方法

| 方法 | 说明 |
|------|------|
| `constructor(mountEl, anchorEl, messagesEl, options?)` | 创建容器、按钮、绑定事件监听 |
| `updateVisibility()` | 根据 scrollHeight 判断是否显示，更新位置 |
| `scrollToMessage(direction)` | 定位上一条/下一条用户消息 |
| `destroy()` | 移除 scroll listener、断开 observer、移除 DOM |

## 数据流

```
messagesEl scroll event / ResizeObserver / MutationObserver
        ↓
updateVisibility() → CSS class toggle
updatePosition()   → container.style.top
        ↓
用户点击 prev/next → scrollToMessage()
        ↓
messagesEl.scrollTo({ top, behavior: 'smooth' })

用户点击 bottom
        ↓
options.onScrollToBottom?.() ?? messagesEl.scrollTo(...)
```

## 与其他模块的交互

- **OpenCodianView**: 提供 `mountEl`、`anchorEl`、`messagesEl` 三个容器引用
- **styles.css**: `opencodian-nav-sidebar`、`opencodian-nav-btn` 等 CSS 类控制浮动定位

## 配置项

无直接配置项。

## 注意事项

- `scrollPadding` 在 sticky 模式下为 0，普通模式为 10px
- `isStickyScrollMode()` 检查 `opencodian-messages--sticky-basic` 和 `opencodian-messages--sticky-mask` 两个类
- `threshold=30` 用于避免在当前位置附近反复跳动
- 如果调用方需要和自动滚动状态机保持一致，应该优先传 `onScrollToBottom`，而不是让侧栏自己直接滚动到底部

## 补充说明

- `anchorEl` 是 OpenCodianView 中的 toolbar/input 区域元素，侧栏通过 `anchorRect.top - mountRect.top + anchorHeight/2` 与其垂直居中对齐
- `chatScrollMode` 设置影响 `isStickyScrollMode()`：当 messagesEl 含 `opencodian-messages--sticky-basic` 或 `opencodian-messages--sticky-mask` 类时启用 sticky 模式，此时导航目标为 `.opencodian-turn` 容器而非单条消息，scrollPadding 为 0

# NavigationSidebar

> **源码**: `src/features/chat/ui/NavigationSidebar.ts`
> **状态**: [DRAFT]

## 概述

浮动导航侧栏，定位在消息容器左侧，提供四向快速导航：顶部、上一条用户消息、下一条用户消息、底部。根据消息区域的滚动状态自动显示/隐藏。支持 sticky-scroll 模式（按 turn 而非单条消息定位）。

## 导入关系
上游: `obsidian`（setIcon）、`i18n`
下游: 被 `OpenCodianView` 在消息区域实例化

## 核心类型 / 接口

无独立导出类型。构造参数：

```typescript
constructor(mountEl: HTMLElement, anchorEl: HTMLElement, messagesEl: HTMLElement)
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

## 关键方法

| 方法 | 说明 |
|------|------|
| `constructor(mountEl, anchorEl, messagesEl)` | 创建容器、按钮、绑定事件监听 |
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

## 待补充
- [ ] anchor 元素的具体含义（toolbar area?）
- [ ] 与 chatScrollMode 的完整交互说明

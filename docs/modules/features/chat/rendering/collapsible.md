# collapsible

> **源码**: `src/features/chat/rendering/collapsible.ts`
> **状态**: [DRAFT]

## 概述

可折叠长内容块的设置工具。为助手消息中超出高度阈值的内容添加自动折叠/展开功能。使用 `ResizeObserver` 监听内容尺寸变化，动态计算是否需要折叠。提供键盘和鼠标交互支持，以及 ARIA 辅助功能属性。

## 导入关系

**上游**: 无外部导入。

**下游**: `OpenCodianView` — 在渲染助手消息后调用 `setupCollapsible()` 设置折叠行为。

## 核心类型 / 接口

```typescript
interface CollapsibleState {
  isExpanded: boolean;
  isCollapsible: boolean;
}

interface CollapsibleOptions {
  collapsedHeight?: number;
  minOverflow?: number;
  showMoreLabel?: string;
  showLessLabel?: string;
}
```

## 核心逻辑

### 折叠判断
`setupCollapsible()` 在初始化和每次内容尺寸变化时（通过 `ResizeObserver`）检查 `contentEl.scrollHeight` 是否超过 `collapsedHeight + minOverflow`。仅当内容溢出足够量（默认 24px）时才启用折叠，避免小量溢出导致无意义的折叠按钮。

### 状态应用
`applyState()` 根据 `isCollapsible` 和 `isExpanded` 组合切换 CSS class：
- `is-collapsible` — 内容可折叠
- `is-expanded` — 已展开
- `is-collapsed` — 已折叠

通过 CSS `--opencodian-collapsible-max-height` 自定义属性控制折叠高度。

### 交互
- 点击 `headerEl`（toggle 按钮）切换展开/折叠
- Enter / Space 键盘操作同样触发切换
- ARIA 属性（`aria-expanded`, `aria-hidden`）随状态更新

### ResizeObserver
若浏览器支持 `ResizeObserver`，自动监听 `contentEl` 尺寸变化并重新计算折叠状态。支持流式传输期间内容逐步增长时的实时折叠判断。

## 关键方法

| 方法 | 说明 |
|------|------|
| `setupCollapsible(wrapperEl, headerEl, contentEl, state, options?)` | 初始化折叠行为 |

## 数据流

```
助手消息渲染完成
  → setupCollapsible(wrapper, toggle, content, state)
    → ResizeObserver 监听 content 尺寸
    → 内容超高 → 显示 toggle 按钮
    → 用户点击 toggle → 切换 isExpanded → CSS class 变更 → 过渡动画
```

## 与其他模块的交互

- **OpenCodianView**: 在 `renderAssistantMessage()` 中创建 DOM 结构后调用
- **styles.css**: 消费 `.opencodian-collapsible`, `.is-collapsible`, `.is-expanded`, `.is-collapsed` 等 class

## 配置项

通过 `CollapsibleOptions` 可配置：
- `collapsedHeight` — 折叠高度（默认 168px）
- `minOverflow` — 最小溢出量才启用折叠（默认 24px）
- `showMoreLabel` / `showLessLabel` — 按钮文本（默认 "Show more"/"Show less"）

## 注意事项

- `state` 对象由调用方持有并传入，折叠状态通过引用修改
- 当 `isCollapsible` 为 false 时，toggle 按钮隐藏（`hidden` 属性 + `aria-hidden`）
- 无 `ResizeObserver` 的环境（理论上 Obsidian 桌面均支持）不会实时响应尺寸变化
- 折叠高度通过 CSS 变量设置，可在主题 CSS 中覆盖

## 待补充

- [ ] 过渡动画的 CSS 实现位置
- [ ] 流式传输期间的折叠行为（内容逐步增长时的实时判断）
- [ ] 多语言标签（showMoreLabel/showLessLabel）的实际传入值

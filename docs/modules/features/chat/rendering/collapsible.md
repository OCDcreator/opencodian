# collapsible

> **源码**: `src/features/chat/rendering/collapsible.ts`
> **状态**: [REVIEW]

## 概述

`setupCollapsible()` 是一个一次性装配函数，用来给现有 DOM 节点加上“超高内容可折叠”的行为。它既被普通长文本复用，也被 OMO 原始提示块复用。

## 核心类型

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

## 函数行为

```typescript
setupCollapsible(
  wrapperEl: HTMLElement,
  headerEl: HTMLElement,
  contentEl: HTMLElement,
  state: CollapsibleState,
  options?: CollapsibleOptions,
): void
```

初始化时会：

- 给 wrapper / content / header 加固定 class
- 设置 `aria-expanded`、`aria-hidden`、`hidden`、`tabIndex`
- 写入 `--opencodian-collapsible-max-height`
- 用 `contentEl.scrollHeight > collapsedHeight + minOverflow` 判定是否真的需要折叠

默认值：

- `collapsedHeight = 168`
- `minOverflow = 24`
- `showMoreLabel = 'Show more'`
- `showLessLabel = 'Show less'`

## 运行机制

### 状态同步

内部 `applyState()` 会同步：

- `state.isCollapsible`
- `state.isExpanded`
- `wrapperEl` 上的 `is-collapsible` / `is-expanded` / `is-collapsed`
- `headerEl` 的可见性、可聚焦性和标签文本

### 交互

`headerEl` 同时监听：

- `click`
- `keydown` 中的 `Enter`
- `keydown` 中的空格

点击或按键后都会切换 `state.isExpanded`，再重新执行 `applyState()`。

### 尺寸变化

当运行环境支持 `ResizeObserver` 时，函数会观察 `contentEl`，让流式追加内容或异步渲染完成后重新计算是否需要折叠。

## 模块关系

- 无上游依赖
- 下游消费者：`OpenCodianView.renderUserMessageContent()`、`OpenCodianView.renderOmoUserInjection()`

## 注意事项

- 这个函数不返回 disposer；观察器生命周期完全依赖 DOM 节点后续一起被释放。
- `headerEl` 类型写成 `HTMLElement`，但实现会给它写 `type="button"` 和键盘交互属性，所以调用方实际传入的是按钮元素。

# collapsible

> **源码**: `src/features/chat/rendering/collapsible.ts`
> **状态**: [REVIEW]

## 概述

`setupCollapsible()` 是一个一次性装配函数，用来给现有 DOM 节点加上“超高内容可折叠”的行为。它既被普通长文本复用，也被 OMO 原始提示块复用。现在它还支持在展开/收起后通知上层，由视图层决定是否执行“布局稳定后滚到底”的补偿。

模块同时提供 `disposeCollapsiblesWithin(rootEl)`：在清空或替换已渲染消息子树之前调用，释放子树内所有 collapsible 的 ResizeObserver 与事件监听，避免 detached 内容节点被未断开的 observer 继续持有（潜在 retention 风险）。

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
setupCollapsible({
  wrapperEl,
  headerEl,
  contentEl,
  state,
  options?,
  onToggle?,
}): () => void
```

初始化时会：

- 给 wrapper / content / header 加固定 class
- 设置 `aria-expanded`、`aria-hidden`、`hidden`、`tabIndex`
- 写入 `--opencodian-collapsible-max-height`
- 用 `contentEl.scrollHeight > collapsedHeight + minOverflow` 判定是否真的需要折叠
- 把幂等的 dispose 句柄按 `wrapperEl` 注册进模块内 WeakMap，并作为返回值交给调用方

dispose 句柄会 disconnect `ResizeObserver`、移除 header 的 click/keydown 监听并从 WeakMap 注销；重复调用不会重复执行。

`disposeCollapsiblesWithin(rootEl)` 遍历 `rootEl` 下所有 `.opencodian-collapsible` wrapper，并同时释放 streaming thinking/tool 卡片的自有 listeners；`rootEl` 为 null 时直接返回。

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

点击或按键后都会切换 `state.isExpanded`，再重新执行 `applyState()`。如果调用方传了 `onToggle(isExpanded)`，这里也会在状态落地后触发，供聊天视图在 auto-scroll 开启时安排一次 settled scroll。

### 尺寸变化

当运行环境支持 `ResizeObserver` 时，函数会观察 `contentEl`，让流式追加内容或异步渲染完成后重新计算是否需要折叠。

## 模块关系

- 无上游依赖
- 下游消费者：`OpenCodianView.renderUserMessageContent()`、`OpenCodianView.renderOmoUserInjection()`、`AssistantNoticeCardRenderer.renderOmoRawSystemReminder()`
- `disposeCollapsiblesWithin()` 消费者：`OpenCodianView` 的两处 `clearMessagesContainer` seam（`.empty()` 前）、`ConversationRenderRuntime` 的 assistant/user 就地重渲（`replaceChildren()` 前）

## 注意事项

- `setupCollapsible()` 现在返回幂等的 dispose 句柄；调用方若不持有它，也可以在移除子树前统一走 `disposeCollapsiblesWithin()`。
- `headerEl` 类型写成 `HTMLElement`，但实现会给它写 `type="button"` 和键盘交互属性，所以调用方实际传入的是按钮元素。

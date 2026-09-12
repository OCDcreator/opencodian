# Chat User Styles

> **源码**: `src/style/features/chat-user.css`
> **状态**: [FINAL]

## 职责

定义用户消息气泡（右对齐）、折叠长文本行为、文本选区高亮以及消息入场动画。气泡有两种渲染模式，通过 `.opencodian-container` 上的 `data-opencodian-user-bubble-style` 选择：`solid`（默认，属性缺失时同样生效）使用主题派生的不透明表面色、无 `backdrop-filter`；`glass` 保留旧的玻璃态渐变 + 模糊背景。

## 关键类名 / CSS 变量

- `.opencodian-message--user`：用户消息容器与右对齐布局。
- `.opencodian-message--user .opencodian-message-content`：气泡本体，默认即 solid 模式（`--opencodian-user-bubble-bg` / `--opencodian-user-bubble-border`，hover 用 `-hover` 变量）。
- `.opencodian-container[data-opencodian-user-bubble-style="glass"] .opencodian-message--user .opencodian-message-content`：玻璃态覆盖层，只在显式选择 glass 时生效。
- `.opencodian-collapsible*`：长内容折叠遮罩与"展开/收起"按钮。
- `.opencodian-selection-highlight` 与 `::highlight(opencodian-selection)`：选区高亮。
- `.opencodian-message--compaction-divider`：全宽居中 compaction 分割线容器，区别于用户气泡与 notice 卡片。
- `.opencodian-compaction-divider-line`：分割线内部的水平线元素。
- `.opencodian-compaction-divider-badge`：显示 compaction 状态（completed / overflow / auto）的徽章元素。
- `.opencodian-compaction-divider--live`：进行中 compaction 的修饰类。
- 动画：`@keyframes messageSlideIn`，并通过 `nth-child` 做轻度错峰；`@media (prefers-reduced-motion: reduce)` 下 `.opencodian-message--user` 与 `.opencodian-message--assistant` 关闭 slide-in 入场动画，消息直接出现。

## 关联 TS 组件

- `src/features/chat/OpenCodianView.ts`
- `src/features/chat/rendering/collapsible.ts`
- `src/features/chat/ui/NavigationSidebar.ts`（定位用户消息锚点）

## 修改注意点

- 折叠逻辑依赖 `--opencodian-collapsible-max-height`，CSS 与 `collapsible.ts` 需保持契合。
- solid 是默认模式：基础规则不能依赖 `data-opencodian-user-bubble-style` 属性存在，glass 只能作为叠加覆盖层，否则默认样式会整体失效。
- 用户气泡的层次和 hover 动效与助手消息不同，不建议直接复用助手样式。
- 修改后执行 `npm run build:css`（或完整 `npm run build`）。

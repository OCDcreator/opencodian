# Chat User Styles

> **源码**: `src/style/features/chat-user.css`
> **状态**: [FINAL]

## 职责

定义用户消息气泡（右对齐玻璃态）、折叠长文本行为、文本选区高亮以及消息入场动画。

## 关键类名 / CSS 变量

- `.opencodian-message--user`：用户消息容器与右对齐布局。
- `.opencodian-message--user .opencodian-message-content`：玻璃态气泡本体。
- `.opencodian-collapsible*`：长内容折叠遮罩与“展开/收起”按钮。
- `.opencodian-selection-highlight` 与 `::highlight(opencodian-selection)`：选区高亮。
- 动画：`@keyframes messageSlideIn`，并通过 `nth-child` 做轻度错峰。

## 关联 TS 组件

- `src/features/chat/OpenCodianView.ts`
- `src/features/chat/rendering/collapsible.ts`
- `src/features/chat/ui/NavigationSidebar.ts`（定位用户消息锚点）

## 修改注意点

- 折叠逻辑依赖 `--opencodian-collapsible-max-height`，CSS 与 `collapsible.ts` 需保持契合。
- 用户气泡的玻璃态层次和 hover 动效与助手消息不同，不建议直接复用助手样式。
- 修改后执行 `npm run build:css`（或完整 `npm run build`）。

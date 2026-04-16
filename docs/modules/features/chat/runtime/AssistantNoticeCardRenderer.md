# AssistantNoticeCardRenderer

> **源码**: `src/features/chat/runtime/AssistantNoticeCardRenderer.ts`
> **状态**: [REVIEW]

## 概述

`AssistantNoticeCardRenderer` 是 assistant notice card 的 DOM 组装模块。它把 notice tone / icon、标题、Markdown body、OMO system-reminder raw block，以及 notice action button label 的组装从 `OpenCodianView` 中抽出。

## 公开接口

- `AssistantNoticeCardRenderer.render()`：在指定 container 内渲染 notice card
- `AssistantNoticeCardRendererHost.renderMarkdownInto()`：由 view 提供 Markdown 渲染能力
- `AssistantNoticeCardRendererHost.handleNoticeAction()`：由 view 提供 notice action 的真实副作用入口
- `AssistantNoticeCardRendererHost.handleCollapsibleToggle()`：由 view 在 raw block 展开/收起后决定是否安排滚动补偿

## 设计目的

- 让 `OpenCodianView` 不再直接持有 notice card 的 DOM / OMO body 解析 / action label 细节
- 让 persisted notice 与 streaming placeholder notice 继续复用同一份 card 组装逻辑
- 把 action 副作用留在 host，避免 runtime renderer 直接依赖 settings tab、rewind restore 等 view 级状态

## 注意事项

- OMO system-reminder 的标题、正文 fallback 和 raw block 展开行为在这里保持集中；raw block 现在会把 toggle 事件回传给 host，用于处理消息面板的 settled scroll；新增 reminder 类型时优先更新本模块。
- notice footer / timestamp row 不属于本模块，仍由 `AssistantShellViewHostAdapter` 经 `AssistantFooterRenderer` 处理。
- notice action type 的业务副作用仍由 `OpenCodianView` host 回调承接；不要在 renderer 内直接打开设置页或修改 conversation state。

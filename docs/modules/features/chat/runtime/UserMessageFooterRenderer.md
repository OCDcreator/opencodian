# UserMessageFooterRenderer

> **源码**: `src/features/chat/runtime/UserMessageFooterRenderer.ts`
> **状态**: [REVIEW]

## 概述

`UserMessageFooterRenderer` 是 user message footer 的 DOM 组装模块。它把 copy / rewind / fork 按钮、tooltip label，以及时间文本的组装从 `OpenCodianView` 中抽出。

## 公开接口

- `UserMessageFooterRenderer.render()`：在指定 user message bubble 下方组装 footer
- `UserMessageFooterRendererHost.attachTooltipLabel()`：由 view 提供 tooltip label 注入
- `UserMessageFooterRendererHost.initializeCopyButton()`：由 view 提供 copy 行为初始化
- `UserMessageFooterRendererHost.handleRewindRequest()`：由 view 提供 rewind 副作用入口
- `UserMessageFooterRendererHost.handleForkRequest()`：由 view 提供 fork 副作用入口

## 设计目的

- 让 `OpenCodianView` 不再直接持有 user footer 的按钮 DOM / label / timestamp 细节
- 让 rewind / fork 的副作用继续留在 view host，而不是让 renderer 直接依赖 conversation 或 tab 状态
- 保持 `.opencodian-user-action-btn` 选择器不变，继续兼容 `TabRuntimeStateBridge` 的 streaming 禁用态写回

## 注意事项

- copy / rewind / fork 的视觉样式与 tooltip class 仍沿用既有 CSS class；如果更改类名，需要同步检查 `userMessageActions.ts` 和样式文件。
- renderer 只读取 `message.timestamp` 与 `message.sourceMessageId`；真正的 rewind / fork 可用性与副作用仍由 host 决定。

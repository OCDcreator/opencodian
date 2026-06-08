# UserMessageFooterRenderer

> **源码**: `src/features/chat/runtime/UserMessageFooterRenderer.ts`
> **状态**: [REVIEW]

## 概述

`UserMessageFooterRenderer` 是 user message footer 的 DOM 组装模块。它把 copy / rewind / fork 按钮、tooltip label，以及时间文本的组装从 `OpenCodianView` 中抽出。rewind 与 fork 的 capability 检查已分离：只有 `hasRewindCapability()` 时才渲染 rewind 按钮，只有 `hasForkCapability()` 时才渲染 fork 按钮，允许 Claude Code 等只支持 fork 的 backend 独立暴露 fork 而不假装支持 revert。

## 公开接口

- `UserMessageFooterRenderer.render()`：在指定 user message bubble 下方组装 footer
- `UserMessageFooterRenderer.refreshTooltips()`：按按钮上保存的 i18n key 刷新已渲染 footer tooltip 文案
- `UserMessageFooterRendererHost.handleRewindRequest()`：由 view 提供 rewind 副作用入口
- `UserMessageFooterRendererHost.handleForkRequest()`：由 view 提供 fork 副作用入口

## 设计目的

- 让 `OpenCodianView` 不再直接持有 user footer 的按钮 DOM / label / timestamp 细节
- 让 rewind / fork 的副作用继续留在 view host，而不是让 renderer 直接依赖 conversation 或 tab 状态
- 保持 `.opencodian-user-action-btn` 选择器不变，继续兼容 `TabRuntimeStateBridge` 的 streaming 禁用态写回

## 注意事项

- copy / rewind / fork 的视觉样式与 tooltip class 仍沿用既有 CSS class；如果更改类名，需要同步检查 `userMessageActions.ts` 和样式文件。
- footer 按钮会把 tooltip 的 i18n key 保存在 DOM attribute 中，供语言切换后刷新已渲染消息使用。
- renderer 只读取 `message.timestamp` 与 `message.sourceMessageId`；真正的 rewind / fork 可用性与副作用仍由 host 决定。

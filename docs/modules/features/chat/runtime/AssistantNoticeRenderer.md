# AssistantNoticeRenderer

> **源码**: `src/features/chat/runtime/AssistantNoticeRenderer.ts`
> **状态**: [REVIEW]

## 概述

`AssistantNoticeRenderer` 是发送 runtime 的 assistant notice 专用 helper。它把 stream error / interrupted notice 的 message 构造，以及“把现有 streaming shell 改造成 notice card”的 DOM 过程从 `OpenCodianView` 中抽出。

## 公开接口

- `buildStreamErrorNotice()`：构建带 `displayStyle: 'notice'` 的 stream error assistant message
- `buildInterruptedAssistantNotice()`：构建 interrupted assistant notice message
- `renderAssistantPlaceholderAsNotice()`：把已创建的 assistant shell 清空、标记为 notice、渲染 notice card，并通过 host 补上时间戳行
- `AssistantNoticeRenderHost`：只暴露 notice 渲染需要的三个 view adapter：notice card 渲染、timestamp 渲染和 streaming shell 可见性切换

## 设计目的

- 让 `OpenCodianView` 不再直接拥有 stream notice message 形状和 placeholder 改写细节
- 让 `SendPipelineShellPort` 不再需要暴露 notice message builder
- 让 `buildLocalStreamOutcome` 与 `StreamShellFinalizer` 可以直接复用纯 notice 构造函数

## 注意事项

- 这个模块仍通过 `AssistantNoticeRenderHost` 复用 `OpenCodianView.renderNoticeCard()`，不要在这里复制完整 notice card 样式逻辑。
- assistant shell 的创建、reveal 与 timestamp row 具体实现已经迁到 `AssistantShellRenderer.ts`；这里继续只关心 notice 改写流程。
- notice id / `sourceMessageId` 规则会影响后续 server sync 是否保留本地 error notice，修改时需要同步检查 `streamErrorNoticeSync` 测试。

# AssistantNoticeRenderer

> **源码**: `src/features/chat/runtime/AssistantNoticeRenderer.ts`
> **状态**: [REVIEW]

## 概述

`AssistantNoticeRenderer` 是发送 runtime 的 assistant notice 专用 helper。它把 stream error / interrupted notice 的 message 构造，以及“把现有 streaming shell 改造成 notice card”的 shell 改写过程从 `OpenCodianView` 中抽出；notice card 内部 DOM 组装交给 `AssistantNoticeCardRenderer`，notice footer 收尾则交给 `AssistantNoticeFooterFinalizer`。

## 公开接口

- `buildStreamErrorNotice()`：构建带 `displayStyle: 'notice'` 的 stream error assistant message
- `buildInterruptedAssistantNotice()`：构建 interrupted assistant notice message
- `renderAssistantPlaceholderAsNotice()`：把已创建的 assistant shell 清空、标记为 notice、调用 host 渲染 notice card，并通过 host 触发 shared notice footer finalization
- `AssistantNoticeRenderHost`：只暴露 notice 渲染需要的三个 view adapter：notice card 渲染、notice footer finalization 和 streaming shell 可见性切换

## 设计目的

- 让 `OpenCodianView` 不再直接拥有 stream notice message 形状和 placeholder 改写细节
- 让 `SendPipelineShellPort` 不再需要暴露 notice message builder
- 让 `buildLocalStreamOutcome` 与 `StreamShellFinalizer` 可以直接复用纯 notice 构造函数

## 注意事项

- 这个模块仍通过 `AssistantNoticeRenderHost` 复用宿主提供的 notice card 渲染与 footer finalization；当前这层 host 由 `AssistantShellViewHostAdapter.ts` 统一装配。
- assistant shell 的创建、reveal 与 timestamp row 具体实现已经迁到 `AssistantShellRenderer.ts` / `AssistantNoticeFooterFinalizer.ts`；这里继续只关心 notice 改写流程。
- notice id / `sourceMessageId` 规则会影响后续 server sync 是否保留本地 error notice，修改时需要同步检查 `streamErrorNoticeSync` 测试。

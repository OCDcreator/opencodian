# AssistantStructuredContentRenderer

> **源码**: `src/features/chat/runtime/AssistantStructuredContentRenderer.ts`
> **状态**: [REVIEW]

## 概述

`AssistantStructuredContentRenderer` 是 persisted assistant message 的 structured `contentBlocks` helper。它消费 `QuestionResolutionCardRenderPlan`，并通过调用方提供的 block-render 回调，统一执行“先渲染 card 前 blocks、插入 resolved card、再渲染 card 后 blocks”的顺序。

## 公开接口

- `renderAssistantStructuredContent()`：按 render plan 顺序渲染 `blocksBeforeCard`、resolved card 与 `blocksAfterCard`
- `AssistantStructuredContentRenderOptions`：收束 structured 渲染所需的 container、render plan 与 `renderContentBlock` adapter

## 设计目的

- 让 `OpenCodianView.renderAssistantMessageBody()` 不再直接循环 structured blocks 和处理 resolved-card 插入点
- 保留 `thinking` / `tool_use` / `text` 各块的具体 DOM 细节仍由调用方的 `renderContentBlock()` 负责
- 让 structured assistant 的 resolved-card 顺序有独立单测，不必依赖 view 级测试覆盖

## 注意事项

- 这个 helper 不负责构建 render plan；调用方仍需先使用 `buildQuestionResolutionCardRenderPlan()`
- `renderContentBlock` 回调必须继续保留既有 block-type 分发行为
- assistant timestamp/copy button 收尾仍由 `AssistantShellRenderer` 统一处理

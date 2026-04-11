# AssistantPlainTextFallbackRenderer

> **源码**: `src/features/chat/runtime/AssistantPlainTextFallbackRenderer.ts`
> **状态**: [REVIEW]

## 概述

`AssistantPlainTextFallbackRenderer` 是 persisted assistant message 的无 structured blocks fallback helper。它把 resolved question card 追加顺序与普通 `message.content` 的 markdown/plain-text 渲染从 `OpenCodianView.renderAssistantMessageContent()` 中抽离出来。

## 公开接口

- `renderAssistantPlainTextFallbackContent()`：先按 render plan 追加可见的 persisted resolved card，再在存在 `messageContent` 时渲染 `opencodian-message-text`
- `AssistantPlainTextFallbackRenderOptions`：收束 fallback 渲染所需的 container、message content、markdown renderer 与 resolved-card render plan

## 设计目的

- 让 `OpenCodianView.renderAssistantMessageContent()` 只负责 assistant 消息分支选择和 timestamp 收尾
- 让无 `contentBlocks` 的 persisted assistant 正文渲染与 resolved card 顺序有独立单测
- 让有 `contentBlocks` 的 structured 分支交给 `AssistantStructuredContentRenderer.ts`，避免 fallback helper 再承担额外职责

## 注意事项

- 这个 helper 不负责构建 render plan；调用方仍需先使用 `buildQuestionResolutionCardRenderPlan()`
- `markdownService === null` 时必须保留旧行为：创建 `opencodian-message-text` 后直接写入 `textContent`
- 不要把 assistant timestamp/copy button 收尾搬进这里；该职责仍由 `AssistantShellRenderer` 统一处理

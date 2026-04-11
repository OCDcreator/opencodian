# AssistantCopyContent

> **源码**: `src/features/chat/runtime/AssistantCopyContent.ts`
> **状态**: [REVIEW]

## 概述

`AssistantCopyContent` 是 persisted assistant footer 的 copy-source helper。它把 `OpenCodianView` 里“优先提取 structured `contentBlocks` 的 text block；否则退回 `message.content`”的选择逻辑抽成独立纯函数。

## 公开接口

- `resolveAssistantCopyContent()`：统一返回 assistant footer copy 按钮应复制的正文字符串
- `extractAssistantStructuredTextCopyContent()`：只负责从 structured `contentBlocks` 提取并拼接可复制的 text blocks
- `AssistantCopyContentSource`：收束 copy-source helper 需要的 `content` 与 `contentBlocks`

## 设计目的

- 让 `OpenCodianView` 不再持有 structured text copy-source 选择细节
- 让 assistant footer copy-content 规则有独立单测，不必依赖 view 级测试覆盖
- 保持 `AssistantShellRenderer` 继续只关心 footer DOM，本 helper 只关心 copy-content 来源

## 注意事项

- 只提取 `type === 'text'` 且 trim 后非空的 block 文本；`thinking`、`tool_use` 等 block 不能进入 copy 内容
- 只要存在 structured `contentBlocks`，就继续沿用 structured copy-source 规则，不自动回退到 `message.content`
- 这个 helper 不负责 timestamp / copy button DOM 收尾；这些仍由 `AssistantShellRenderer` 统一处理

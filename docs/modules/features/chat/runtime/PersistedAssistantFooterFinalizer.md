# PersistedAssistantFooterFinalizer

> **源码**: `src/features/chat/runtime/PersistedAssistantFooterFinalizer.ts`
> **状态**: [REVIEW]

## 概述

`PersistedAssistantFooterFinalizer` 是 persisted assistant footer 的 renderer-bridge helper。它把 `OpenCodianView` 里“拿到 `messageEl` 与 `message` 后，调用 payload helper 再转交 `AssistantShellRenderer`”这一步抽成独立模块。

## 公开接口

- `PersistedAssistantFooterFinalizer`：收束 persisted assistant footer 最终落地所需的 renderer host
- `finalizeFooter()`：根据 `messageEl` 与 persisted assistant `message` 触发统一 footer 收尾
- `PersistedAssistantFooterFinalizerHost`：只暴露 timestamp/copy footer renderer 真正需要的 `addTimestampWithCopyButton()`

## 设计目的

- 让 `OpenCodianView` 在 persisted footer 路径里只负责提供 `messageEl` 与 `message`
- 让 `AssistantFooterPayload` 继续保持纯 payload 组装，不直接承担 renderer 调用职责
- 让 persisted footer 的 renderer 调用点收束到一个 helper，减少 view 内重复展开 `...buildPersistedAssistantFooterPayload(...)`

## 注意事项

- 这个 helper 只适用于 persisted assistant message footer；streaming shell、notice 与 pseudo-stream footer 仍在各自 runtime 路径内单独收尾
- `ConversationRenderService` 复用已有 assistant 正文时，也通过名为 `finalizePersistedAssistantFooter()` 的 host bridge 回到这里，而不是暴露 “只更新 timestamp” 的误导语义
- DOM 最终仍由 `AssistantShellRenderer` 创建和更新；本模块只负责 bridge，不复制时间行或 copy button 的实现
- 如果 persisted assistant footer 未来新增字段，应优先扩展 `AssistantFooterPayload`，再由这里透传给 renderer

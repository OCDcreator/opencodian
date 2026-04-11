# AssistantFooterPayload

> **源码**: `src/features/chat/runtime/AssistantFooterPayload.ts`
> **状态**: [REVIEW]

## 概述

`AssistantFooterPayload` 是 persisted assistant footer 的参数组装 helper。它把 `OpenCodianView` 里传给 `AssistantShellRenderer.addTimestampWithCopyButton()` 的 timestamp、copy-content、model 与 status payload 收束成纯 helper。

## 公开接口

- `buildPersistedAssistantFooterPayload()`：根据 persisted assistant `ChatMessage` 返回 footer payload
- `PersistedAssistantFooterPayloadOptions`：收束 helper 输入的 `message`
- `AssistantFooterPayload`：对应 `AssistantShellTimestampOptions` 去掉 `messageEl` 后的 payload 形状
- `resolvePersistedAssistantFooterStatusLabel()`：根据 persisted assistant `streamState` 返回 footer status label

## 设计目的

- 让 `OpenCodianView` 不再在多个 persisted assistant 渲染路径里重复拼装 timestamp/copy/model/status 参数
- 让 footer copy-content 来源继续委托 `AssistantCopyContent`，避免重新内联 structured/fallback 选择规则
- 让 interrupted badge 的判断也停留在 footer helper 内，避免 view 再持有 persisted footer stream-state 分支
- 保持 `AssistantShellRenderer` 只负责 footer DOM 与 copy button 初始化

## 注意事项

- 这个 helper 只适用于 persisted assistant message footer；streaming error、notice 与 pseudo-stream 的特殊 footer 仍在各自路径内传参
- `messageEl` 仍由调用方提供，避免 payload helper 持有 DOM 责任
- `resolvePersistedAssistantFooterStatusLabel()` 目前只识别 `interrupted` persisted assistant 状态；其他 footer 状态仍应在对应 runtime 路径内单独处理

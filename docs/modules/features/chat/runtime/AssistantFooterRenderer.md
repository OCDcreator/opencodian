# AssistantFooterRenderer

> **源码**: `src/features/chat/runtime/AssistantFooterRenderer.ts`
> **状态**: [REVIEW]

## 概述

`AssistantFooterRenderer` 是 assistant shell/footer 的窄 renderer helper。它把 notice、pseudo-stream、error 与 persisted assistant footer 最终调用 `addTimestampWithCopyButton()` 的几种变体收束到同一处，并继续复用 `PersistedAssistantFooterFinalizer` 处理 persisted payload。

## 公开接口

- `AssistantFooterRenderer`：统一承接 assistant footer 的 renderer 调用
- `finalizeNoticeFooter()`：为 notice message 补齐时间/model footer
- `finalizePseudoStreamFooter()`：为 pseudo-stream assistant 补齐时间/copy/model footer
- `finalizeErrorFooter()`：为本地错误 assistant shell 补齐时间/copy/model footer
- `finalizePersistedFooter()`：继续把 persisted assistant footer 交给 `PersistedAssistantFooterFinalizer`
- `AssistantFooterRendererHost`：只暴露真正需要的 `addTimestampWithCopyButton()`

## 设计目的

- 让 `OpenCodianView` 不再直接展开 notice / pseudo-stream / error footer 的 timestamp payload 细节
- 让 `AssistantShellViewHostAdapter` 继续只负责 host seam，而把多种 footer 变体路由到更窄的 helper
- 让 persisted 与非 persisted assistant footer 继续共用同一条 shell renderer 路径，而不是把 footer 参数组装重新分散回 view

## 注意事项

- notice / pseudo-stream / error footer 的 payload 仍通过 `AssistantFooterPayload.ts` 组装，避免在 helper 里重新内联字段规则
- persisted assistant footer 仍由 `PersistedAssistantFooterFinalizer` 负责最终 bridge；不要把 interrupted badge 或 copy-content 解析重新搬回这里
- 这个 helper 只关心 footer renderer 调用，不负责 notice card DOM、shell 创建或消息持久化

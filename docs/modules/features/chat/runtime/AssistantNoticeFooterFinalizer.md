# AssistantNoticeFooterFinalizer

> **源码**: `src/features/chat/runtime/AssistantNoticeFooterFinalizer.ts`
> **状态**: [REVIEW]

## 概述

`AssistantNoticeFooterFinalizer` 是 assistant notice footer 的窄 finalizer。它把 notice message 的时间戳 / model footer payload 组装集中到单一模块，避免 persisted notice 渲染与 streaming placeholder notice 改写分别重复拼装 `addTimestampWithCopyButton()` 参数。

## 公开接口

- `AssistantNoticeFooterFinalizer`：统一收口 notice footer 的 timestamp finalization
- `finalizeFooter()`：根据 notice message 的 `timestamp` / `modelId` 调用宿主补齐 footer
- `AssistantNoticeFooterFinalizerHost`：只暴露 `addTimestampWithCopyButton()`

## 设计目的

- 让 `AssistantFooterRenderer` 不再直接内联 notice footer payload
- 让 `AssistantNoticeRenderer` 只负责 notice shell/card 改写，而不是再知道 footer timestamp 细节
- 让 persisted notice 与 placeholder notice 继续共享同一条 footer finalization seam

## 注意事项

- 这个 helper 只负责 notice footer；不要把 pseudo-stream、error 或 persisted assistant copy-content 逻辑混进来
- notice footer payload 继续通过 `AssistantFooterPayload.ts` 统一组装，避免多处复制字段规则

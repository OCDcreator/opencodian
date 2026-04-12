# AssistantErrorRenderer

> **源码**: `src/features/chat/runtime/AssistantErrorRenderer.ts`
> **状态**: [REVIEW]

## 概述

`AssistantErrorRenderer` 是本地 stream-error assistant shell 的窄 renderer helper。它把 `OpenCodianView.finalizeAssistantMessageWithError()` 里原本直接展开的错误块 DOM 组装收束到单一模块，并继续复用既有的 assistant error footer seam。

## 公开接口

- `AssistantErrorRenderer`：统一承接本地 stream-error block 的 DOM 渲染
- `renderStreamError()`：清空 streaming content 容器、插入错误 icon/text，并把 footer 收尾交回 `AssistantFooterRenderer`
- `AssistantErrorRendererHost`：只暴露 `finalizeErrorFooter()`，避免把 shell host、持久化或滚动能力重新带进来

## 设计目的

- 让 `OpenCodianView` 不再直接维护 stream-error block 的 DOM 细节
- 让 `AssistantShellViewHostAdapter` 继续作为 assistant shell host seam，同时把错误泡泡 DOM 渲染下沉到更窄的 helper
- 保持 footer timestamp/copy/model 规则仍集中在 `AssistantFooterRenderer`

## 注意事项

- 这个 helper 只负责本地 stream-error 内容块；notice card 错误提示仍由 `AssistantNoticeRenderer` 负责
- footer 收尾仍通过 `AssistantFooterRenderer.finalizeErrorFooter()` 执行，不要把 timestamp/copy payload 逻辑重新塞回来
- 消息持久化、fingerprint 更新和滚动写回仍属于 `OpenCodianView`

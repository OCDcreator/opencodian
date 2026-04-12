# AssistantShellViewHostAdapter

> **源码**: `src/features/chat/runtime/AssistantShellViewHostAdapter.ts`
> **状态**: [REVIEW]

## 概述

`AssistantShellViewHostAdapter` 是 assistant shell / notice / footer / local stream-error block 的 view host adapter。它把 `OpenCodianView` 里原本分散的 `AssistantShellRendererHost`、`AssistantNoticeRenderHost`、assistant footer helper 与本地错误块 renderer 装配收束到一个更窄的 runtime bridge。

## 公开接口

- `AssistantShellViewHostAdapter`：统一持有 `AssistantShellRenderer`、`AssistantFooterRenderer` 与 `AssistantErrorRenderer`
- `createAssistantMessageElement()` / `revealStreamingAssistantMessageElement()`：透传 streaming assistant shell 创建与 reveal
- `addTimestampWithCopyButton()`：透传 footer timestamp / copy button 收尾
- `renderAssistantPlaceholderAsNotice()`：通过内部 notice host 把已有 shell 改写成 notice card
- `finalizePersistedFooter()` / `finalizeNoticeFooter()` / `finalizePseudoStreamFooter()`：让 persisted、notice 与 pseudo-stream assistant footer 变体都复用同一条 footer renderer seam
- `renderStreamError()`：通过 `AssistantErrorRenderer` 统一渲染本地 stream-error block，并复用既有 error footer 收尾
- `createSendPipelineShellPort()`：导出 `SendPipelineRuntime` 需要的 shell port，而不是让 view 自己重新拼一次 notice / footer wiring
- `AssistantShellViewHostAdapterHost`：只暴露 shell/notice/footer 真正需要的 runtime state、scroll、visibility、copy-button 初始化与 notice-card 渲染能力

## 设计目的

- 让 `OpenCodianView` 不再同时维护 assistant shell renderer host、notice render host、多种 footer helper wiring，以及本地 stream-error block DOM 组装
- 让 `SendPipelineShellPort`、persisted / notice / pseudo-stream / error footer 收尾、stream error notice 渲染，以及本地错误泡泡 DOM 渲染都回到同一条 assistant shell host seam
- 保持 `AssistantShellRenderer` / `AssistantNoticeRenderer` / `AssistantFooterRenderer` / `AssistantErrorRenderer` / `PersistedAssistantFooterFinalizer` 继续各自专注 shell、notice、footer 与错误块 DOM，而不是重新并回 view

## 注意事项

- 这个 adapter 只负责 host 装配与跨 helper 转接，不要把 notice message 构造、footer payload 组装或错误块 DOM 细节再塞进来
- 如果 notice card 渲染或 copy-button 初始化规则变化，应优先扩展 host 契约，再让内部 helper 复用
- `createSendPipelineShellPort()` 应继续返回窄 shell port；不要在这里重新混入 transport / persistence / debug 职责

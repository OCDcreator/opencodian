# AssistantShellRenderer

> **源码**: `src/features/chat/runtime/AssistantShellRenderer.ts`
> **状态**: [REVIEW]

## 概述

`AssistantShellRenderer` 是发送 runtime 的 assistant shell 专用 adapter。它把 streaming assistant shell 的创建、reveal、timestamp row 维护与 copy/timestamp 收尾，从 `OpenCodianView` 中抽成独立模块。

## 公开接口

- `createAssistantMessageElement()`：创建 streaming assistant shell，并在 tab runtime 里登记当前 `streamingMessageEl` / `streamingContentEl`
- `revealStreamingAssistantMessageElement()`：把延迟显示的 shell 改为可见，并在当前活动 tab 上按既有规则触发 settled auto-scroll
- `addTimestampWithCopyButton()`：把 streaming shell 收尾成稳定的 assistant footer，补上时间、model、状态和 copy 按钮
- `ensureAssistantTimestampRow()`：确保 shell 里只有一个 assistant timestamp row，并支持 pending 占位
- `AssistantShellRendererHost`：只暴露 shell adapter 真正需要的 tab runtime、turn body、scroll、visibility 与 copy-button 初始化能力

## 设计目的

- 让 `OpenCodianView` 不再直接持有 streaming assistant shell DOM 细节
- 让 `OpenCodianView` 通过 `AssistantShellViewHostAdapter.ts` 统一装配 shell / notice / persisted-footer 相关 host，而不是继续散落多个私有 host factory
- 让 `SendPipelineShellPort` 的实现收敛到一个专用 shell adapter，而不是继续分散在 view 私有方法里
- 让 shell 可见性和 timestamp 行行为可以脱离大视图类单测

## 注意事项

- 这个模块只负责 assistant streaming shell，不负责 notice message 构造；notice 仍由 `AssistantNoticeRenderer.ts` 负责。
- permission / question inline card 的插入位置与 reveal 编排已经迁到 `StreamingInlineCardRenderer.ts`，不要再把 post-tool-call placement 细节加回这里。
- `setStreamingAssistantMessageVisibility()` 的日志与隐藏规则仍然由 view host 决定，不要在这里复制额外状态判断。
- `createAssistantMessageElement()` 必须继续写回 tab runtime 的 `streamingMessageEl` / `streamingContentEl`，否则 chunk router 与 local finalizer 会失联。

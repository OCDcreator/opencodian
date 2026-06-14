# AssistantShellViewHostAdapter

> **源码**: `src/features/chat/runtime/AssistantShellViewHostAdapter.ts`
> **状态**: [REVIEW]

## 概述

`AssistantShellViewHostAdapter` 是 assistant shell / notice / footer / local stream-error block / body rendering 的 view host adapter。它把 `OpenCodianView` 里原本分散的 `AssistantShellRendererHost`、`AssistantNoticeRenderHost`、persisted assistant body render seam、assistant footer finalizer/renderer、content block rendering 与本地错误块 renderer 装配收束到一个更窄的 runtime bridge。

body rendering（`renderMessageBody` / `renderContentBlock` / `getAssistantBodySignature` / `getStoredToolStatus`）现在内聚在 adapter 内部，不再回弹到 `OpenCodianView`。

## 公开接口

- `AssistantShellViewHostAdapter`：统一持有 `AssistantShellRenderer`、`AssistantFooterRenderer`、`AssistantNoticeFooterFinalizer` 的 host seam，以及 `AssistantErrorRenderer`
- `createAssistantMessageElement()` / `revealStreamingAssistantMessageElement()`：透传 streaming assistant shell 创建与 reveal
- `createAssistantShellContainer()`：创建不绑定 streaming state 的 assistant shell 容器（`messageEl` + `contentEl`），用于 interrupted-tail 保留等场景
- `setStreamingAssistantMessageVisibility()`：切换 assistant 消息元素的可见性，变化时通过可选回调通知调用方记录调试日志
- `addTimestampWithCopyButton()`：透传 footer timestamp / copy button 收尾
- `renderStructuredOutputIfPresent()`：在已存在的 message DOM 中查找 `.opencodian-message-content`，如果存在结构化输出 payload 则注入可折叠的 structured output badge；供 stream finalization 在流式消息壳体上直接追加 badge，而不是等待消息重新渲染
- `renderPersistedAssistantMessage()`：通过内部 shell + body render + footer renderer，一次性完成普通 persisted assistant message 的壳层、正文与 footer 组装；notice message 也会在这里统一分派到 notice 渲染路径
- `renderMessageBody()`：公开入口，渲染 assistant message 正文（structured content blocks 或 plain text fallback），并在 `message.structured` 存在时渲染可折叠的结构化输出 JSON 块，供 `ConversationAssistantTailRenderPort` 直接调用；在 structured output 存在时会先过滤掉重复的 raw JSON text block，确保 hydration/reload 后不重新显示已被 streaming finalization 移除的内容
- `getAssistantBodySignature()`：公开入口，为 body 内容生成可序列化的比较指纹，供 render pipeline 判断是否需要重渲染
- `renderPersistedAssistantNoticeMessage()`：通过内部 shell + notice host 一次性完成 persisted assistant notice 的 shell、card 与 footer 编排
- `renderAssistantPlaceholderAsNotice()`：通过内部 notice host 把已有 shell 改写成 notice card
- `finalizePersistedFooter()` / `finalizeNoticeFooter()` / `finalizePseudoStreamFooter()`：让 persisted、notice 与 pseudo-stream assistant footer 变体都复用同一条 footer renderer seam
- `renderStreamError()`：通过 `AssistantErrorRenderer` 统一渲染本地 stream-error block，并复用既有 error footer 收尾
- `createSendPipelineShellPort()`：导出 `SendPipelineRuntime` 需要的 shell port，而不是让 view 自己重新拼一次 notice / footer wiring
- `AssistantShellViewHostAdapterHost`：只暴露 shell/notice/footer 真正需要的 runtime state、scroll、visibility、copy-button 初始化、notice-card 渲染能力，以及 body rendering 所需的 `shouldRenderQuestionResolutionCards` / `suppressActiveLayoutAutoScrollOnce` / `getMarkdownService` 回调
- `AssistantShellViewHostAdapterOnOpenTaskToolSession`：工具会话打开回调类型；在 adapter 构造时传入，由 `ToolCallRenderer.onOpenToolSession` 消费，避免通过 host 接口传递
- `AssistantShellViewHostAdapterOnOpenMcpServerDetail`：MCP server 详情打开回调类型；**16A 重构**：现在通过 `AssistantShellViewHostAdapterMcpCallbacks` 选项对象传入（与 `onAuthenticateMcpServer`、`onRetryMcpToolCall` 一起），由 `ToolCallRenderer.onOpenMcpServerDetail` 消费，用于 Codex chat→`CodexMcpServerDetailModal` 入口
- `AssistantShellViewHostAdapterMcpCallbacks`：**16A 新增**。MCP 回调选项对象，包含 `onOpenMcpServerDetail`、`onAuthenticateMcpServer`、`onRetryMcpToolCall`。构造函数第 3 个参数（取代先前的独立位置参数），将三个 MCP 相关回调收束到一个对象中以遵守 max-params lint 约束

## 设计目的

- 让 `OpenCodianView` 不再同时维护 assistant shell renderer host、persisted assistant shell/body/footer 装配、notice render host、多种 footer helper wiring，以及本地 stream-error block DOM 组装
- 让 `SendPipelineShellPort`、persisted assistant shell + body + footer、persisted notice shell + card + footer、notice / pseudo-stream / error footer 收尾、stream error notice 渲染，以及本地错误泡泡 DOM 渲染都回到同一条 assistant shell host seam
- 保持 `AssistantShellRenderer` / `AssistantNoticeRenderer` / `AssistantFooterRenderer` / `AssistantNoticeFooterFinalizer` / `AssistantErrorRenderer` / `PersistedAssistantFooterFinalizer` 继续各自专注 shell、notice、footer 与错误块 DOM，而不是重新并回 view

## 注意事项

- 这个 adapter 只负责 host 装配与跨 helper 转接，不要把 notice message 构造、footer payload 组装或错误块 DOM 细节再塞进来
- 普通 persisted assistant message 的正文仍由 host callback 提供；adapter 负责壳层、notice 分派与 footer 收尾，不重新理解 question/tool/OMO 内容语义
- 如果 notice card 渲染或 copy-button 初始化规则变化，应优先扩展 host 契约，再让内部 helper 复用
- `createSendPipelineShellPort()` 应继续返回窄 shell port；不要在这里重新混入 transport / persistence / debug 职责

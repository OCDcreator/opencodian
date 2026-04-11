# StreamingInlineCardRenderer

> **源码**: `src/features/chat/runtime/StreamingInlineCardRenderer.ts`
> **状态**: [REVIEW]

## 概述

`StreamingInlineCardRenderer` 是 chat runtime 的内联卡片 placement helper。它把 streaming shell 中 permission/question inline card 的 DOM 插入位置与 reveal 触发，从 `OpenCodianView` 中抽成独立模块。

## 公开接口

- `createStreamingInlineCard()`：创建指定 class 的 inline card，并按统一规则插入到当前 streaming assistant shell
- `StreamingInlineCardRendererHost`：只暴露当前 tab、streaming message shell 查询，以及 shell reveal 这三个 placement 真正需要的能力

## 设计目的

- 让 `OpenCodianView` 不再重复维护“插到最后一个 tool call 后，否则退回 content/message 容器”的 placement 细节
- 让 permission inline card 与 question inline card 共用同一条 post-tool-call 插入路径
- 让 inline card reveal 语义可以脱离大视图类做小范围单测

## 注意事项

- 这个模块只负责 inline card 壳体创建与插入，不负责 question/permission 具体内容或交互逻辑
- permission inline card 的内容构造与按钮等待已经迁到 `PermissionInlineCardRenderer.ts`，不要再把这部分逻辑塞回 placement helper
- reveal 仍通过 `AssistantShellRenderer` 的 host bridge 执行，不要在这里复制 scroll 或 visibility 规则
- tool call 仍然直接挂在 message shell 上；fallback 逻辑必须继续兼容 `.opencodian-message-content` 与 message root 两种容器

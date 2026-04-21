# Stream Controller

> **源码**: `src/utils/streaming/StreamController.ts`
> **状态**: [REVIEW]

## 概述

`StreamController` 是聊天流式渲染的本地控制器。它负责：

- 维护一次 assistant 流的临时状态
- 协调 `ThinkingBlockRenderer`、`ToolCallRenderer` 与 `MarkdownRenderService`
- 把实时流转换成可持久化的 `ContentBlock[]`
- 在流结束、取消或超时时做一致性收尾

最近这块逻辑最大的变化不是类型，而是“文本渲染节流”“结构化输出工具过滤”，以及把 thinking/tool 折叠交互的滚动补偿统一下沉到 controller options。

## 核心逻辑

### 生命周期

1. `startStream(contentEl)` 重置内部状态并绑定当前内容容器
2. `handleChunk(chunk)` 按类型路由
3. `done` 时刷新未完成块、终结工具调用、触发 `onStreamComplete`
4. `cancelStream()` / `timeoutStream()` 走本地收尾，但不触发完成回调

### 文本渲染节流

与旧文档不同，现在文本不是每来一段就立刻完整重渲。控制器维护了：

- `STREAMING_MARKDOWN_RENDER_MIN_INTERVAL_MS = 96`
- `textRenderRequested`
- `textRenderInFlight`
- `lastTextRenderAt`
- `lastRenderedTextContent`

这样做的目的有两个：

- 降低 streaming markdown 反复重排导致的抖动
- 避免在收尾阶段重复渲染完全相同的文本

`renderMarkdownText()` 还会临时设置 `min-height`，用来减少重绘时的布局跳动。

### chunk 路由

`handleChunk()` 只处理本地 `utils/streaming/types.ts` 里的 6 种 chunk：

- `thinking`
- `text`
- `tool_use`
- `tool_result`
- `error`
- `done`

其中：

- `thinking` 会先 flush 文本，再保证 thinking block 的边界正确
- `tool_use` / `tool_result` 会在文本和 thinking 之间强制断开
- `done` 会统一补齐所有尚未持久化的 block

### 结构化输出工具过滤

`isInternalStructuredOutputTool()` 现在会过滤内部结构化输出工具：

- streaming 时不会把这类 tool call 渲染到 UI
- 从持久化 block 重建历史消息时也会跳过

这避免了标题生成等结构化输出链路把“内部工具调用”泄露到聊天界面。

### 持久化一致性

tool call 不再只是“收到结果时 append 一次”那么简单。控制器会用：

- `persistedToolCallIds`
- `upsertToolCallContentBlock(...)`

来确保：

- 同一个 tool call 不会被重复写入 `contentBlocks`
- timeout / done 收尾时仍能补齐遗漏的工具块
- task/subagent 工具的白名单 `toolMetadata`（当前为 `sessionId`）与 `resultVisibility: 'hidden'` 也会跟随 running/result 持久化到 `tool_call` block，供最终消息卡片继续打开 child session，同时避免 raw `<task_result>` 被普通结果渲染器消费

## 关键方法

| 方法 | 说明 |
|------|------|
| `startStream(contentEl)` | 开始新流并重置全部运行时状态 |
| `handleChunk(chunk)` | 处理单个流 chunk |
| `cancelStream()` | 本地取消并 flush 已有内容 |
| `timeoutStream()` | 本地超时并把未完成 tool call 标成 error |
| `getContentBlocks()` | 返回可持久化的内容块数组 |
| `setCallbacks(callbacks)` | 设置外部事件回调 |
| `renderStoredContentBlocks(parentEl, blocks)` | 从持久化内容块重建历史 DOM |

### 折叠交互回调

`StreamControllerOptions` 除了 `scrollToBottom` 外，还支持 `onCollapsibleToggle`。controller 会把它继续传给：

- `ThinkingBlockRenderer`
- `ToolCallRenderer`

这样 assistant 的 thinking/tool 卡片在历史恢复和流式阶段都能复用同一套“展开后安排 settled scroll”的策略，而不是依赖 view 层分别补丁。

## 与其他模块的交互

- `OpenCodianView`: 创建并持有控制器，把服务层 chunk 映射到这里
- `MarkdownRenderService`: 渲染 streaming text 和历史 text block
- `ThinkingBlockRenderer`: 管理 thinking block 的创建、展开和 duration 更新
- `ToolCallRenderer`: 管理 tool call 卡片 UI
- `shared.isInternalStructuredOutputTool()`: 过滤内部结构化输出工具

## 注意事项

- `cancelStream()` / `timeoutStream()` 不触发 `onStreamComplete`。
- `handleChunk()` 在 `isStreaming === false` 或 `currentContentEl === null` 时会直接返回。
- 文本节流降低了抖动，但也意味着 chunk 到达和 DOM 完成渲染之间存在一个短暂缓冲窗口。
- `renderStoredContentBlocks()` 同样会跳过内部结构化输出工具块。
- 如果没有显式传入 `onCollapsibleToggle`，controller 会回退复用 `scrollToBottom`，保证老调用方仍有基本的滚动行为。

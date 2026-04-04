# Stream Controller

> **源码**: `src/utils/streaming/StreamController.ts`
> **状态**: [DRAFT]

## 概述

SSE 流式渲染的核心控制器。管理流状态，协调 `ThinkingBlockRenderer` 和 `ToolCallRenderer`，按 `StreamChunk` 类型分发处理逻辑。将流式内容实时渲染为 DOM，同时构建 `ContentBlock[]` 用于持久化。支持取消和超时处理。

## 导入关系
上游: `../../shared` (createLogger), `../markdown` (MarkdownRenderService), `./ThinkingBlockRenderer`, `./ToolCallRenderer`, `./types`
下游: `OpenCodianView` (流式消息处理), `./index`

## 核心类型 / 接口

使用 `./types` 中定义的全部流相关类型，核心包括：
- `StreamChunk` — 流数据块联合类型
- `StreamState` — 流运行时状态
- `StreamEventCallbacks` — 事件回调接口
- `ContentBlock` — 持久化内容块联合类型
- `StreamControllerOptions` — 构造选项

## 核心逻辑

### 流生命周期

1. **startStream(contentEl)**: 重置状态，设置 `isStreaming=true`，记录 `currentContentEl`
2. **handleChunk(chunk)**: 根据 `chunk.type` 分发到对应处理器
3. **cancelStream()**: 刷新未完成块，设置 `isStreaming=false`
4. **timeoutStream()**: 刷新未完成块 + 标记所有运行中 tool call 为 error

### Chunk 处理分发

`handleChunk()` 的 switch 分支：

| type | 处理方法 | 说明 |
|------|----------|------|
| `thinking` | `handleThinkingChunk()` | 创建/追加思考块，支持 partId 切换和 duration 更新 |
| `text` | `handleTextChunk()` | 追加文本并重新渲染 markdown |
| `tool_use` | `handleToolUseChunk()` | 创建 tool call 卡片，支持增量 input 合并 |
| `tool_result` | `handleToolResultChunk()` | 更新 tool call 状态和结果 |
| `error` | `handleErrorChunk()` | 渲染错误提示 |
| `done` | `handleDoneChunk()` | 刷新所有未完成块，触发 onStreamComplete |

### 内容块最终化

三个 finalize 方法将当前运行时状态推入 `contentBlocks[]`：
- `finalizeThinkingBlock()` → `ThinkingContentBlock`
- `finalizeTextBlock()` → `TextContentBlock`
- tool call 在 `handleToolResultChunk()` 中立即推入

### Thinking block 管理

- 支持多 partId（一个流中多个思考块）
- `thinkingBlocksByPartId` Map 存储已完成的思考块，支持后续 duration 更新
- `updateStoredThinkingDuration()` 更新已显示思考块的计时

## 关键方法

| 方法 | 说明 |
|------|------|
| `startStream(contentEl)` | 开始新流 |
| `handleChunk(chunk)` | 处理单个流数据块 |
| `cancelStream()` | 取消流 |
| `timeoutStream()` | 超时处理 |
| `getContentBlocks()` | 获取内容块列表（用于持久化） |
| `isStreaming()` | 查询流状态 |
| `setCallbacks(callbacks)` | 设置事件回调 |
| `renderStoredContentBlocks(parentEl, blocks)` | 从持久化内容块重建 DOM |

## 数据流

```
OpenCodianView → sendMessage()
  → streamController.startStream(contentEl)
  → SSE events → handleChunk(chunk)
    → thinking: ThinkingBlockRenderer.create/appendContent
    → text: MarkdownRenderService.render (增量)
    → tool_use: ToolCallRenderer.render
    → tool_result: ToolCallRenderer.updateResult
    → done: flushOpenContentBlocks → onStreamComplete(contentBlocks[])
  → contentBlocks 持久化到 conversation.messages[]

恢复历史消息:
  → renderStoredContentBlocks(parentEl, savedBlocks)
    → text: MarkdownRenderService.render
    → thinking: ThinkingBlockRenderer.renderStored
    → tool_call: ToolCallRenderer.render
```

## 与其他模块的交互

- **OpenCodianView**: 创建并持有 `StreamController`，传入 SSE 事件
- **ThinkingBlockRenderer**: 创建、追加内容、最终化思考块
- **ToolCallRenderer**: 创建和更新 tool call 卡片
- **MarkdownRenderService**: 渲染文本和思考内容的 markdown
- **StorageService**: `contentBlocks[]` 被持久化到 `conversation.messages[]`

## 配置项

通过 `StreamControllerOptions` 传入：
| 参数 | 说明 |
|------|------|
| `containerEl` | 容器元素 |
| `markdownService` | Markdown 渲染服务实例 |
| `onStreamComplete?` | 流完成回调 |
| `scrollToBottom?` | 滚动到底部回调 |

## 注意事项

- `handleTextChunk()` 每次追加内容都重新渲染整个文本块，频繁调用可能有性能影响
- tool call 在 `handleToolResultChunk()` 时立即推入 `contentBlocks`，确保顺序正确
- `cancelStream()` 和 `timeoutStream()` 不触发 `onStreamComplete`
- `currentContentEl` 为 null 时 `handleChunk()` 静默返回

## 待补充
- [ ] 流式文本增量渲染优化（diff-based）
- [ ] 多路并发流的隔离策略
- [ ] Tool call 增量 input 合并的边界情况

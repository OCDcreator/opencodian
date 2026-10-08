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

- `STREAMING_MARKDOWN_RENDER_MIN_INTERVAL_MS = 96`（从 `MarkdownRenderScheduler` 导入的共享常量，不再私有定义）
- `textRenderRequested`
- `textRenderInFlight`
- `textRenderGeneration`（每次取消或重启时递增，用于丢弃已经脱离当前流的旧 Promise 完成结果）
- `lastTextRenderAt`
- `lastRenderedTextContent`

这样做的目的有两个：

- 降低 streaming markdown 反复重排导致的抖动
- 避免在收尾阶段重复渲染完全相同的文本

`renderMarkdownText()` 会先渲染到脱离文档树的 staging element，再在 generation 仍然有效时提交到目标节点；这样取消或重启后的旧 Promise 不会写回旧 DOM，也不会覆盖新的 `last*` 状态或触发滚动。它还会临时设置 `min-height`，用来减少重绘时的布局跳动；过期 generation 不会清理新一代渲染设置的 shell 高度。

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
- `error` 根据 `errorClass` 通过 `ERROR_CLASS_ICONS` 映射渲染差异化图标（类型为 `Record<SdkErrorClass, string>`，含 `unknown: '❌'`），并将分类写入 `dataset.errorClass` 供 CSS 使用

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
- `MarkdownRenderScheduler`: 提供共享渲染间隔常量；thinking chunk 的全文重渲经 `ThinkingBlockRenderer` 内部 per-state scheduler 帧预算调度
- `ThinkingBlockRenderer`: 管理 thinking block 的创建、展开和 duration 更新
- `ToolCallRenderer`: 管理 tool call 卡片 UI
- `shared.isInternalStructuredOutputTool()`: 过滤内部结构化输出工具

## 注意事项

- `cancelStream()` / `timeoutStream()` 不触发 `onStreamComplete`。
- `handleChunk()` 在 `isStreaming === false` 或 `currentContentEl === null` 时会直接返回。
- 文本节流降低了抖动，但也意味着 chunk 到达和 DOM 完成渲染之间存在一个短暂缓冲窗口。
- `renderStoredContentBlocks()` 同样会跳过内部结构化输出工具块。
- 如果没有显式传入 `onCollapsibleToggle`，controller 会回退复用 `scrollToBottom`，保证老调用方仍有基本的滚动行为。


## 2026-10-08 未完成工具的本地中断状态

取消本地流时仍保存尚未收到结果的工具 call ID、参数和 interrupted 状态；不把本地停止推断为原生成功/失败，也不触发完成回调。已收到的终态和结果保持不变。卡片显示“原生工具结果尚未确认”，不显示运行中 spinner；历史归一保留该状态，后续权威 native completed/error 可以覆盖。


## 2026-10-09 B1：Markdown 等待期间的工具取消边界

`handleToolUseChunk()` 在首次 await 前把已接收的工具 ID、完整 input、kind、metadata 与 result visibility 登记到本次 `StreamState`；重复事件先合并参数/metadata。新工具在登记时触发一次 start 回调，保证等待期间真实 `tool_result` 仍能匹配原工具，并按原样记录 completed/error 与结果。工具 DOM 仍等前文的 Markdown 边界完成后再渲染。

工具 handler 捕获所属 state，并在异步边界后检查取消/重启；过期 handler 不创建 running 卡片、调用新的 start 回调或触碰替代流。公共分派在工具 handler 返回后同样检查所属 state，避免旧工具回调继续触发当前滚动。文本 flush 另捕获 render generation，等待返回后 generation 已变化即停止，不再消费替代流的渲染请求。

`cancelStream()` 扫描已登记工具：未终结者保存为 interrupted，已收到的真实 completed/error 保持不变。工具若因 Markdown 等待尚未创建 DOM，取消时也按已确定的本地状态创建卡片；不把本地取消当成 native 成功，不伪造工具 end 或流完成回调。取消后的迟到 result/done 由 streaming gate 拒绝。

现有 `StreamController.test.ts` 新增真实 Promise/DOM 行为回归：hold Markdown → 接收工具 → cancel → release；另覆盖第二次 await、等待期间真实成功/错误 result、重复输入合并、同 controller 重启与独立替代 controller。这里的 DOM 回归不代替固定构建的 Mac/FA880 native/reload 验收。

等待期间先到的真实 tool_result 立即更新登记对象及真实 end 回调，但在工具 DOM 尚未建立时推迟写入 contentBlocks，待原工具 handler 完成前文边界或 cancel 同步 flush 后再落盘，保证文本/工具时间顺序；不取消继续流的成功和错误结果也有对应回归。

## 2026-10-09 B2/B3 统一取消所有权

全部 async chunk handler 在 await 返回后核对原 StreamState 与 streaming 所有权；公共分派同样阻止过期 scroll。thinking 已 append 到本轮时取消同步保存；仍在前文 Markdown 等待、尚未 append 的 thinking 不在停止后补入，取消后新到的任何 chunk 均拒绝。

cancel/timeout 复用同一 owner 内 stopStream：先关闭 streaming、快照并清空工具 maps，再持久化原状态并调用 renderer。重复及renderer一次cancel重入均幂等；正常工具首次render先在detached staging完成，只有原流仍拥有时才附加和登记，避免重入时重复卡。confirmed结果在外部回调前写入原state，不覆盖替代流；done只有原流仍拥有时完成，onDone启动替代流后不派发旧onStreamComplete。最后的文本paint只使用cancel前捕获的字节，且不产生scroll/terminal回调。

固定取消矩阵A24/B6/C4/D1/E8/F1在现有ToolCallRenderer.lifecycle.test.ts执行；原B1和S1测试保留。CSS映射说明补齐streaming-content.md，源码和styles暂存未改。

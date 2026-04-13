# OpenCodeStreamEventTransformer

> **源码**: `src/core/opencode/OpenCodeStreamEventTransformer.ts`
> **状态**: [REVIEW]

## 概述

`OpenCodeStreamEventTransformer` 是 `OpenCodeService` 内部的流式事件转换 owner。它负责：

- 把 SDK / legacy SSE event 统一转换成 `StreamChunk`
- 维护单条活动流里的 part-type 感知，确保 `message.part.delta` 能区分 text / thinking
- 处理 tool chunk 去重、tool result 补发、question / permission / file 事件映射
- 解析原始 SSE buffer，保留未完成尾段

它不负责 transport、stream lifecycle 或最终 assistant message 补拉；这些仍留在 `OpenCodeService` 与 `OpenCodeStreamingRuntimeCoordinator`。

## 导入关系

```text
上游:
- `../../shared`
- `../types`
- `./OpenCodeStreamingRuntimeCoordinator`

下游:
- `src/core/opencode/OpenCodeService.ts`
- `tests/unit/core/opencode/OpenCodeStreamEventTransformer.test.ts`
```

## Host seam

`OpenCodeService` 通过 host seam 把仍然属于 service owner 的能力注入进来：

- `observeRuntimeToolNames()`：把流中出现的新工具写回 catalog runtime
- `getOpenCodeToolKind()`：沿用现有 builtin / MCP / custom 身份判断
- `normalizeQuestionRequest()`：继续由 service 维护问题请求的结构化归一化
- `logStreamingDebug()`：复用原本的 assistant stream debug log

这样 transformer 可以收束事件→chunk 逻辑，同时避免把 tool catalog 或 question normalization 重新拆散。

## 核心类型 / 状态

- `OpenCodeStreamEventState`: 单条流里的文本累计、error snapshot、tool dedupe 状态与 text-delta debug 游标。
- `OpenCodeStreamPartTypeState`: `OpenCodeStreamingRuntimeContext` 或测试用 `partTypeMap`，用来记住 `partId -> partType`。
- `OpenCodeStreamEvent`: SDK / legacy 共享的 event shape。
- `OpenCodeSSEEvent`: 解析后的单条 SSE event。

## 核心逻辑

### `handleStreamingEvent()`

负责处理真实流里的事件：

- 先按 `sessionID` / `part.sessionID` 做 session guard
- 对 `message.part.updated` 处理 tool_use / tool_result / thinking-duration
- 对 `message.part.delta` 复用 part type，把 reasoning / thinking delta 转成 `thinking` chunk，把普通文本 delta 转成 `text`
- 对 `permission.asked`、`file.edited`、`question.asked` 做结构化 chunk 映射
- 对 `session.error` / `session.idle` 返回 stop 信号，同时保留错误与 debug 信息

### `parseSSEEvents()`

负责把 `connectSSE()` 读到的 buffer 切成完整事件：

- 识别 `event:` / `data:` 行
- 遇到空行时结束当前 event
- 如果 OpenCode legacy SSE 没显式给 `event:`，则从 JSON `type` 推断事件名
- 把末尾未形成完整双换行的内容作为 `remaining` 保留给下一轮 read

### `transformEventToChunks()` / `transformPartToChunks()`

这是较薄的通用映射 helper，负责把已有 event / part payload 映射成 `text`、`thinking`、`tool_use`、`tool_result`、`usage` chunk。它们不参与 session guard、tool-use dedupe 或 stream stop 判断；这些留给 `handleStreamingEvent()`。

## 数据流

```mermaid
graph LR
    A[SDK event stream / legacy SSE] --> B[OpenCodeStreamEventTransformer]
    B --> C[StreamChunk[] + stop flag]
    D[OpenCodeStreamingRuntimeContext] --> B
    E[OpenCodeService host seam] --> B
```

## 与其他模块的交互

- `OpenCodeStreamingRuntimeCoordinator` 继续拥有 active stream registry 与 per-session abort lifecycle；transformer 只读写当前流的 part-type state。
- `OpenCodeCatalogStateStore` 不直接依赖 transformer，但会通过 host seam 接收 runtime tool-name 观察结果。
- `OpenCodeService` 继续负责 SDK-first / legacy fallback 的 transport 分流与最终 `finishStreamingResponse()`。

## 注意事项

- 不要在这里改 SDK 首事件失败才 fallback 到 legacy SSE 的策略；那属于 `OpenCodeService` transport owner。
- 不要把 question normalization 或 tool identity 规则搬进 transformer；保持 host seam 注入。
- `transformPartToChunks()` 目前仍保持原有“只直接处理 `reasoning` part，不单独处理 `thinking` part”的兼容语义。

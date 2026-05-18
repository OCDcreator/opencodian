# OpenCodeStreamEventTransformer

> **源码**: `src/core/opencode/OpenCodeStreamEventTransformer.ts`
> **状态**: [REVIEW]

## 概述

`OpenCodeStreamEventTransformer` 是 `OpenCodeService` 内部的流式事件转换 owner。它负责：

- 把 SDK / legacy SSE event 统一转换成 `StreamChunk`
- 维护单条活动流里的 part-type 感知，确保 `message.part.delta` 能区分 text / thinking
- 同步产出 canonical stream mutations，让 `message.part.updated` / `message.part.delta` 能写入 `sessionStateStore`
- 处理 tool chunk 去重、tool result 补发、question / permission / file 事件映射
- 对 `task` tool 透传可渲染白名单 metadata（当前为 `sessionId`）并标记 `toolResultVisibility: 'hidden'`，让流式 task 卡片能保留 child session linkage 且不把 `<task_result>` 当普通输出
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

`OpenCodeService` 通过 host seam 把相邻 owner 的能力注入进来：

- `observeRuntimeToolNames()`：把流中出现的新工具写回 catalog runtime
- `getOpenCodeToolKind()`：复用 `OpenCodeMessageNormalizationMapper` 的 builtin / MCP / custom 身份判断
- `normalizeQuestionRequest()`：复用 `OpenCodeMessageNormalizationMapper` 的问题请求结构化归一化
- `logStreamingDebug()`：复用原本的 assistant stream debug log

这样 transformer 可以收束事件→chunk 逻辑，同时避免把 tool catalog 或消息/问题 normalization 重新拆散。

## 核心类型 / 状态

- `OpenCodeStreamEventState`: 单条流里的文本累计、error snapshot、tool dedupe、reasoning text dedupe 状态与 text-delta debug 游标。
- `OpenCodeStreamPartTypeState`: `OpenCodeStreamingRuntimeContext` 或测试用 map，记住 `partId -> partType` 与 `partId -> messageID`。
- `OpenCodeStreamMutation`: 与 legacy chunks 并行的 canonical mutation 输出，覆盖 message upsert、part upsert、part delta 与 part completion signal。
- `OpenCodeStreamEventOutcome`: `chunks + mutations + stop` 的统一返回结构；调用方必须先应用 mutations，再继续交付 legacy chunks。
- `OpenCodeStreamEvent`: SDK / legacy 共享的 event shape；包含已观测到的 `session.next.*` v2 字段类型。
- `OpenCodeSSEEvent`: 解析后的单条 SSE event。

## 核心逻辑

### `handleStreamingEvent()`

负责处理真实流里的事件：

- 先按 `sessionID` / `part.sessionID` 做 session guard
- 对 `message.part.updated` 处理 tool_use / tool_result / thinking-duration；当 SDK 只补发完整 reasoning part 时，会按 part 已发送长度补齐缺失的 thinking 文本；如果 provider 只返回空白 reasoning，则不生成可见空 thinking 块
- `tool_use` chunk 只透传可渲染白名单 metadata；当前保留 `toolMetadata.sessionId` 用于 OpenCode 原生 subagent/task 卡片，并对 `task` 补 `toolResultVisibility: 'hidden'`，避免在流式/part-helper 路径丢 child session id 或误渲染 raw result
- 对 `message.part.updated` 记录 part type/message id，并产出 assistant message + part upsert mutations
- 对 `message.part.delta` 复用 part type/message id，把 reasoning / thinking delta 转成 `thinking` chunk，把普通文本 delta 转成 `text`，同时产出 part delta mutation；reasoning delta 会更新 dedupe 游标，避免后续 `part.updated` 重复渲染，空白 delta 只保留 canonical mutation 不触发 UI thinking 块
- 对 `permission.asked`、`file.edited`、`question.asked` 做结构化 chunk 映射；其中 permission chunk 会复用同一套请求归一化，保留 `sessionID`、`always` 与可选 `tool` 引用，避免流式路径和 polling 路径的权限语义漂移
- `question.asked` 仍是 AskQuestion 主路径；同时，`question` tool-part 如果明确处于 `state.status === 'waiting'` 且 `state.metadata` / `state.metadata.request` / `state.metadata.question` / part 本身能通过 host 的 `normalizeQuestionRequest()`，会补发 `question_request` chunk，作为事件丢失或 alternate stream shape 的保守回退
- 对 `session.error` / `session.idle` 返回 stop 信号。`session.error` 现在通过 `classifySdkError()` 对错误分类，将 `errorClass` 记入 debug 日志并附加到 error chunk
- 对已知 `session.next.*` 实验性事件做 typed observe-only 处理：`session.next.agent.switched`、`session.next.prompted`、`session.next.step.started`、`session.next.text.started`、`session.next.text.ended`、`session.next.reasoning.started`、`session.next.reasoning.ended`、`session.next.tool.called`、`session.next.tool.success`
- `session.next.step.ended` 会在 `tokens.input` 为数字时额外产出 `usage` chunk，并把 `tokens.reasoning` 计入 `outputTokens`，让 UI usage 显示包含模型生成的 reasoning token
- 其余 `session.next.*` 不产出 chunks、不产出 mutations、不触发 stop；未知 `session.next.*` 也保持 observe-only fallback，避免干扰 interleaved `message.part.*` 主路径
- `session.next.*` debug 日志只记录安全 metadata：eventType、sessionId、callID、reasoningID、hasText、hasInput、已知 numeric token counts、finish、agent、cost；禁止记录 text、prompt.text、tool input/output、reason 或 token 子对象里的未知内容字段

### `parseSSEEvents()`

负责把 `connectSSE()` 读到的 buffer 切成完整事件：

- 识别 `event:` / `data:` 行
- 遇到空行时结束当前 event
- 如果 OpenCode legacy SSE 没显式给 `event:`，则从 JSON `type` 推断事件名
- 把末尾未形成完整双换行的内容作为 `remaining` 保留给下一轮 read

### `transformEventToChunks()` / `transformPartToChunks()`

这是较薄的通用映射 helper，负责把已有 event / part payload 映射成 `text`、`thinking`、`tool_use`、`tool_result`、`usage` chunk。`transformPartToChunks()` 也保留 waiting `question` tool-part 的 `question_request` 回退映射，方便 helper 调用方不漏掉结构化问题。它们不参与 session guard、tool-use dedupe 或 stream stop 判断；这些留给 `handleStreamingEvent()`。

## 数据流

```mermaid
graph LR
    A[SDK event stream / legacy SSE] --> B[OpenCodeStreamEventTransformer]
    B --> C[StreamChunk[] + OpenCodeStreamMutation[] + stop flag]
    D[OpenCodeStreamingRuntimeContext] --> B
    E[OpenCodeService host seam] --> B
```

## 与其他模块的交互

- `OpenCodeStreamingRuntimeCoordinator` 继续拥有 active stream registry 与 per-session abort lifecycle；transformer 只读写当前流的 part metadata state，并把 mutations 交给 coordinator 转交服务层应用。
- `OpenCodeCatalogStateStore` 不直接依赖 transformer，但会通过 host seam 接收 runtime tool-name 观察结果。
- `OpenCodeService` 继续负责 SDK-first / legacy fallback 的 transport 分流与最终 `finishStreamingResponse()`。

## 注意事项

- 不要在这里改 SDK 首事件失败才 fallback 到 legacy SSE 的策略；那属于 `OpenCodeService` transport owner。
- 不要把 question normalization 或 tool identity 规则搬进 transformer；保持 host seam 注入。
- 不要让 `message.part.delta` 只走 loose text chunk；如果能解析出 `partID + messageID`，必须同时输出 canonical part mutation。
- `transformPartToChunks()` 目前仍保持原有"只直接处理 `reasoning` part，不单独处理 `thinking` part"的兼容语义。
- `toolMetadata` 是 UI-safe 白名单字段，不要把 OpenCode `part.state.metadata` 整对象直接塞进 `StreamChunk`。
- waiting `question` tool-part fallback 只能通过 `normalizeQuestionRequest()` 接受显式 question request payload；不要扩展成任意 tool metadata sniffing，否则容易把普通工具结果误判为用户问题。
- `task` 的 result visibility 同样属于流式 contract；如果以后新增 part-to-chunk helper，必须同时保留 `toolMetadata.sessionId` 与 hidden-result 标记。
- MCP 工具名观察必须在分类之前执行（`observeRuntimeToolNames` → `resolveToolPartClassification`），确保首次出现的 MCP 工具在第一个 `tool_use` chunk 里就拿到正确的 `mcp` kind，而不是先 `custom` 后 `mcp` 的漂移。这个观察-分类顺序在 `handleToolPartUpdated` 和 `appendToolPartChunks` 两条路径都保持一致。

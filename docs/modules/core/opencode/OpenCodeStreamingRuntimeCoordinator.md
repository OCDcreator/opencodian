# OpenCodeStreamingRuntimeCoordinator

> **源码**: `src/core/opencode/OpenCodeStreamingRuntimeCoordinator.ts`
> **状态**: [REVIEW]

## 概述

`OpenCodeStreamingRuntimeCoordinator` 是 `OpenCodeService` 的 streaming transport owner。它现在把这整段 runtime seam 收束到一个 session-scoped coordinator 里：

- active stream registry 与 `AbortController` 生命周期
- 单一 streaming 入口下的 SDK/legacy transport 选择
- SDK stream 订阅、prompt 启动顺序与“首事件前失败 → legacy SSE”降级策略
- legacy `/event` SSE 读取委托给 `OpenCodeLegacySseStreamReader`，coordinator 只消费解析后的事件
- 在交付 legacy `StreamChunk` 前先把 stream mutations 转交给 canonical session graph；具体 message/part reducer 由 `OpenCodeSessionStateStore.applyStreamMutations()` 拥有
- `cancelStream()` / `detachStream()` 的协议语义
- 流结束后的 finalization 委托给 `OpenCodeStreamingFinalizationCoordinator`

`OpenCodeService` 仍负责 prompt payload 组装、SDK feature-flag 分流与 public API；`OpenCodeStreamEventTransformer` 仍负责 event → `StreamChunk` transform。本模块处在两者之间，承接完整 transport/fallback/read lifecycle，并把 finalize 阶段委托给专门的 finalization owner。

## 导入关系

```text
上游:
- `../../shared`
- `../types`
- `./OpenCodeSessionLifecycleCoordinator`
- `./OpenCodeStreamEventTransformer`
- `./OpenCodeLegacySseStreamReader`
- `./OpenCodeStreamingFinalizationCoordinator`
- `./sdkTypes`

下游:
- `src/core/opencode/OpenCodeService.ts`
- `tests/unit/core/opencode/OpenCodeStreamingRuntimeCoordinator.test.ts`
```

## 核心类型 / 状态

- `OpenCodeStreamingRuntimeCoordinatorHost`: host seam，提供 stream mutation 应用入口、服务端 abort、legacy SSE 请求参数、session messages 读取、warning log、短延迟重试能力，以及共享的 `streamEventTransformer`。应用入口现在委托 `OpenCodeSessionStateStore.applyStreamMutations()`，coordinator 不直接了解 canonical store 内部细节。
- `OpenCodeStreamingRuntimeContext`: 单条活动流的 session-scoped runtime context，封装 `AbortController.signal`、part type map 与 part message-id map。
- `OpenCodeStreamingRuntimeRequest`: 单一 transport 入口；调用方传入 `useSdkStream`、当前 prompt 的 `promptMessageId`、SDK callbacks 与 legacy callbacks，coordinator 负责选择实际 transport。
- `OpenCodeStreamingLegacyStreamRequest`: legacy transport 入口；调用方可传入 `startPrompt()` 与 `promptMessageId`，coordinator 随后接手 `/event` 读取。
- `OpenCodeStreamingSdkStreamRequest`: SDK transport 入口；调用方传入 `startPrompt()`、`subscribe(signal)` 与 `promptMessageId`，coordinator 负责 SDK stream 读取与必要时的 legacy fallback。
- `activeStreams`: `Map<string, OpenCodeStreamingRuntimeContext>`，以 `sessionId` 为键保存当前活动流。

## 核心逻辑

### Active stream registry

- `createActiveStreamContext(sessionId)` 会为每个 session 分配独立 context。
- 如果同一 session 已有旧流，coordinator 会先中断旧 context，再注册新 context；单 session 仍只保留一个 active stream context。
- `releaseActiveStreamContext()` 只在传入 context 仍是当前注册实例时才删除它，避免旧流 finally 把同 session 的新流误清掉。

### SDK / legacy transport seam

- `streamResponse()` 先根据 `useSdkStream` 选择 SDK 或 legacy transport，把 `OpenCodeService` 的入口分流收束到同一个 runtime seam。
- `streamSdkResponse()` 先用传入的 `subscribe(signal)` 建立 SDK event stream，再执行 `startPrompt()`，避免 prompt 启动后立刻产生的 reasoning delta 在订阅前丢失。
- 如果 SDK iterator 在第一条事件前抛错，coordinator 会通过 host 的 legacy SSE 请求参数立即切到 `/event`，保持既有 SDK-first / legacy fallback 策略。
- 一旦已经收到首个 SDK event，后续异常不会再切回 legacy，而是直接产出 `error` chunk。
- `streamLegacyResponse()` 则直接执行 legacy prompt 启动后进入 `/event` 读取。
- 每个 event outcome 都会先调用 host `applyStreamMutations()`，再 yield 对应 `StreamChunk`，避免 canonical graph 落后于本地 loose chunk；message/part merge 和 delta fallback 由 `OpenCodeSessionStateStore` 处理。

### Legacy SSE delegation

- 低层 SSE reader lifecycle（`connectSSE`、`openSseReader`、`readSseStream`、buffer 管理、abort/dispose）已迁移到 `OpenCodeLegacySseStreamReader`。
- `consumeLegacyEventStream()` 调用 `legacyReader.connectSSE(signal)` 获取解析后的 `OpenCodeSSEEvent` 流，然后继续负责事件语义转换、mutation 应用、和 stop 判断。
- `streamEventTransformer.parseSSEEvents()` 仍由 `OpenCodeStreamEventTransformer` 拥有；reader 通过 host seam 调用它，coordinator 不再直接维护 reader state 或剩余缓冲区。

### Finalize delegation

- `finishStreamingResponse()` 现在把全部 finalization 工作委托给 `OpenCodeStreamingFinalizationCoordinator.finishStreamingResponse()`。
- runtime coordinator 在构造时会把自身的 `getSessionMessages` 与 `delay` host seam 适配成 finalization coordinator 所需的更小 host 接口。
- finalization coordinator 负责：重新拉取 assistant tail、按 `parentID` 过滤、补发 trailing text/reasoning/tool/error chunks、输出 `message_metadata` 与 `message_stop`。
- 具体的 finalization 行为（重试策略、去重逻辑、tool metadata 处理等）已迁移到 `OpenCodeStreamingFinalizationCoordinator` 文档中描述。

### Cancel / detach 语义

- `cancelStream(sessionId)` 会中断本地 signal，并 best-effort 调用 host 的 `abortSessionOnServer()`。
- `detachStream(sessionId)` 只中断本地观察，不请求服务端 abort。
- 对于缺失 sessionId 或不存在的活动流，coordinator 只记 debug log，不抛异常。

### Part type tracking

`OpenCodeStreamingRuntimeContext` 继续保存流内 `partId -> partType` 映射，并额外记录 `partId -> messageID`。`OpenCodeStreamEventTransformer.handleStreamingEvent()` 会在 `message.part.updated` / `message.part.delta` 之间共享这些信息，让 reasoning/tool/text delta 的分类与 canonical message 归属都保持 per-session、per-stream 隔离。

## 数据流

```mermaid
graph LR
    A[OpenCodeService sendMessage] --> B[OpenCodeStreamingRuntimeCoordinator]
    A --> C[startPrompt / subscribe host callbacks]
    B --> D[OpenCodeStreamingRuntimeContext]
    B --> E[SDK event stream]
    B --> LR[OpenCodeLegacySseStreamReader]
    LR --> F[legacy /event SSE]
    E --> G[OpenCodeStreamEventTransformer]
    F --> G
    G --> H[StreamChunk + StreamMutation]
    H --> M[applyStreamMutations]
    M --> N[OpenCodeSessionStateStore canonical graph]
    B --> I[finishStreamingResponse]
    I --> FC[OpenCodeStreamingFinalizationCoordinator]
    FC --> J[getSessionMessages host seam]
    A --> K[cancelStream / detachStream]
    K --> B
    B --> L[abortSessionOnServer host seam]
```

## 与其他模块的交互

- `OpenCodeService` 现在只负责 prompt payload / request-body 组装、session 默认值解析，以及 transport callback 注入；SDK/legacy 入口分流都委托给本 coordinator，SSE 读取进一步委托给 `OpenCodeLegacySseStreamReader`，finalize 则委托给 `OpenCodeStreamingFinalizationCoordinator`。
- `OpenCodeLegacySseStreamReader` 拥有低层 SSE reader lifecycle：fetch 连接、reader 打开、分块读取、buffer 缓冲、abort/dispose 清理。coordinator 只消费它 yield 出的解析后事件。
- `OpenCodeStreamEventTransformer` 继续负责 `session.error` / `session.idle` 的 stop 判断、tool/question/file/permission 事件映射、canonical stream mutation 输出，以及 SSE event parsing。
- `OpenCodeStreamingFinalizationCoordinator` 接手了 finalize 阶段的全部行为：补拉 assistant tail、按缺失情况恢复 trailing content、输出 metadata/stop。runtime coordinator 只负责在流结束时触发 finalization。
- `abortSessionOnServer()` 仍留在 `OpenCodeService`，因此 SDK `session.abort()` 失败后回退 legacy HTTP 的语义不变。

## 配置项

本模块没有独立配置项；它完全依赖 host seam、调用时传入的 `sessionId`，以及 `OpenCodeService` 注入的 SDK/legacy transport callbacks。

## 注意事项

- 不要把 prompt payload 组装重新搬回本模块；`OpenCodeContextPartSerializer` 与 `OpenCodePromptRequestBuilder` 仍是 `OpenCodeService` 的上游 owner。
- `releaseActiveStreamContext()` 的 identity check 是并发安全边界的一部分，不要简化成“按 sessionId 一律删除”。
- `cancelStream()` 与 `detachStream()` 的差异是协议语义，不只是日志差异：前者会请求服务端 abort，后者不会。
- `streamSdkResponse()` 的 fallback 只允许发生在首个 SDK event 之前；不要把“已经开始消费 SDK events 后的错误”也改成回退 legacy。
- 当前根因边界不是“单纯 SDK 不可用”，而是 SDK/legacy 两条 transport 都可能先结束本地流，再晚一点才让 canonical assistant tail 完整可见；因此收尾逻辑必须以最终 session state 为准，而不是只相信流内 chunk。

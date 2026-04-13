# OpenCodeService

> **源码**: `src/core/opencode/OpenCodeService.ts`
> **状态**: [REVIEW]

## 概述

`OpenCodeService` 是 OpenCodian 与 OpenCode Server 之间的核心门面。它把几类能力收在同一个服务里：

- 通过 `ServerManager` 管理本地或远程 OpenCode 服务状态
- 在 SDK v2 与 legacy HTTP/SSE 两条链路之间按 feature flag 路由
- 维护按 session 隔离的流式状态，支持多标签并发流式响应
- 归一化 session、message、todo、question、diff、permission 等返回值
- 归一化 OpenCode 工具身份（builtin / MCP / custom），避免流式与历史恢复出现不同图标判断
- 把 OpenCode 持久化消息转换成 UI 可直接消费的 `ChatMessage`

当前实现是“混合外观层”：SDK v2 已覆盖大部分 CRUD、非流式 prompt、流式主链路、abort、questions 与 sync 事件；legacy HTTP/SSE 仍完整保留作为回滚路径。

## 导入关系

```text
上游:
- Obsidian `requestUrl`
- Node `path` / `url`
- `../../shared/*`
- `../../shared/contextPath`
- `../types/*`
- `../types/settings`
- `./createSdkClient`
- `./omoCompat`
- `./OpenCodeCatalogStateStore`
- `./OpenCodeEventSubscriptionCoordinator`
- `./OpenCodeSyncEventRuntimeCoordinator`
- `./sdkFeatureFlags`
- `./sdkTypes`
- `./ServerManager`
- `./types`

下游:
- `src/main.ts`
- `src/features/chat/OpenCodianView`
- `src/features/chat/services/TitleGenerationService`
- `src/core/config/ModelConfigService`
- 单元测试
```

## 核心类型 / 状态

- `OpenCodeServiceEvents`: server status、错误、模型加载事件回调。
- `OpenCodeServiceRuntimeOptions`: 初始 managed pid、state 持久化回调、SDK feature flag 覆盖。
- `SessionActivityStatus`: session 的 `idle` / `busy` / `retry` 状态。
- `activeStreams: Map<string, ActiveStreamContext>`: 以 `sessionId` 为键保存当前流的 `AbortController` 和 part 类型映射。
- `sdkFeatureFlags`: 由 `resolveSdkFeatureFlags()` 合并后的运行时 SDK 开关。
- `syncEventRuntime`: `OpenCodeSyncEventRuntimeCoordinator` 实例，负责 session todo/status/message sync event 的监听集合、wanted state、SDK 订阅生命周期与 emit 路径。
- `catalogState`: `OpenCodeCatalogStateStore` 实例，负责 registry tool ids、tool schema cache、observed external tool names、MCP server status、catalog snapshot 构造与 catalog listener lifecycle。
- `openCodeEventRuntime`: `OpenCodeEventSubscriptionCoordinator` 实例，负责 open-code event listener registry、`event` / `global` 订阅生命周期，以及 catalog-relevant payload 到 `catalogState` 的刷新/广播触发。
- `vaultPath`: 用于 SDK `directory` 注入、上下文文件绝对路径解析，以及 `ServerManager` 工作目录设置；OpenCode directory scope 和 context file path 的跨平台规范化委托给 `shared/contextPath`。

`responseHandlers` 字段虽然仍然存在，但当前公开的主流式接口已经是 `AsyncGenerator<StreamChunk>`。

另外，tool/MCP 目录状态现在集中在 `catalogState`：

- 运行时可见的外部工具键名会被记录到 observed external tools 集合
- `refreshToolIds()` / `listTools()` / `refreshMcpServerStatus()` 都通过同一个 state store 更新 snapshot 与 listener 广播
- 流式 `tool_use` 与历史 `openCodeMessageToChatMessage()` 继续通过 `shared/toolIdentity` 写入结构化 `toolKind`
- 当没有稳定 MCP 目录时，OpenCode 风格外部工具也会按保守 `custom` 图标 `layers` 兜底，而不是回落成 `wrench`；一旦命中 MCP 目录则会切到 `opencodian-tool-mcp`

## 核心逻辑

### 服务初始化、设置同步与服务状态

构造函数会先：

1. 深拷贝 `OpenCodianSettings`
2. 由 `getServerBaseUrl()` 生成 `baseUrl`
3. 以“全关闭”为基线解析 `sdkFeatureFlags`
4. 创建 `ServerManager`

`ServerManager` 的回调被接上后，服务层会在 server 进入 `running` 时自动执行 `autoFetchModels()`，并把错误与状态变化向上传递。

运行时还有三条重要的配置通道：

- `setVaultPath(path)`: 更新 vault 路径、把工作目录传给 `ServerManager`，并重启 sync / open-code 两类 event runtime。
- `checkHealth()`: 优先走 SDK `global.health()`，失败时回退到 `ServerManager.checkHealth()`。
- `updateSettings(settings)`: 根据新旧设置差异决定是否需要重启/停止 managed server；失败时会回滚内存设置、`baseUrl`、`ServerManager` 配置，并尽力恢复原服务。

补充一个运行时细节：

- 当本地服务短暂离线、SDK/legacy 都同时打到 `ERR_CONNECTION_REFUSED` / `ERR_CONNECTION_RESET` 时，`OpenCodeService` 现在会把整段离线期的重复 fallback / failure 日志合并成一次；服务恢复并重新健康后才解除抑制。`global.syncEvent.subscribe()` 在离线期也会改为健康轮询等待恢复，而不是每秒继续重连刷控制台。

特别点：

- 如果本地 managed server 正在运行，切换到新的 host/port 前会先调用 `canBindLocalEndpoint()` 做端口占用预检。
- `isServerProcessRunning()` 代理的是 `ServerManager.isRunning()`，语义是“插件是否持有一个 managed pid”，不是“远端服务是否可达”。

### 会话 CRUD 与回退态过滤

会话读写接口几乎都支持 SDK / legacy 双路径：

- `createSession()`
- `listSessions()`
- `getSessionMessages()`
- `getSessionTodos()`
- `getSessionStatuses()`
- `deleteSession()`
- `updateSessionTitle()`
- `forkSession()`
- `revertSession()`
- `unrevertSession()`
- `getSessionRevertState()`
- `getSessionDiff()`

其中 `getSessionMessages()` 有两个实现细节需要注意：

- legacy 路径使用的是 `/session/:id/message`，不是 `messages`。
- 无论 SDK 还是 legacy，读到消息后都会调用 `applySessionRevertState()`，按 session 的 `revert.messageID` / `revert.partID` 过滤被回滚掉的消息或消息尾部 parts。

`currentSessionId` 是默认会话指针；调用方如果不显式传 `options.sessionId`，多数接口会落回它。

### Prompt 组装与 SDK/legacy 分流

#### `buildPromptRequestParts()`

请求 parts 的组装顺序固定为：

1. 当前输入文本
2. `contextItems`
3. `images`

`externalContextPaths` 仍保留在 `QueryOptions` 里，但这里会直接记一条 debug log 后忽略，不再序列化。

#### 上下文 item 的序列化

- 本地模式：
  - 序列化为 `file` part
  - `url` 使用 `resolveContextPath()` + `toFileContextUrl()`，Windows vault path 在 macOS/Linux 上也会稳定输出 `file:///C:/vault/...`
  - 如果是 `selection` 且带 `textSnapshot`，会把选中文本放进 `source.text`
- 远程模式：
  - 只允许 text-like MIME
  - 必须有 `textSnapshot`
  - 文本大小上限是 `64 * 1024` 字节
  - 序列化为带 `synthetic: true` 的 `text` part，内容由 `buildObsidianContextTag()` 生成

图片会被追加成 data URL `file` part。

#### 非流式请求

`requestAssistantResponse()`：

- `sdkPrompt` 开启时调用 `client.session.prompt(...)`
- 否则 POST 到 `/session/:id/message`
- 如果服务端返回的是“assistant message + structured error”而不是直接 throw，服务层也会优先把 `info.error` 提取成异常抛出，而不是默默返回一个空 assistant

返回值不是原始 OpenCode message，而是已经过 `openCodeMessageToChatMessage()` 归一化后的 `ChatMessage`。

另外还有一个专门给设置页用的 `probeProviderResponse(providerId, modelId)`：

- 创建一个临时 session
- 用指定 `provider/model` 发送一条最小真实请求
- 成功时返回简短响应预览
- 失败时返回真实错误文本
- 最后无论成功失败都会删除临时 session

这让设置页的 provider 测试可以验证“真实发送能力”，而不是只看目录或 runtime 是否出现。

#### 流式请求

`sendMessage()`：

- `sdkStream` 开启时调用 `sendMessageWithSdk()`
- 否则先 POST `/session/:id/prompt_async`，再连接 legacy SSE `/event`

`buildSdkPromptParameters()` 只在 SDK 路径上生效，并且：

- `allowedTools` 会被转换成 `{ [toolName]: true }`
- `reasoningEffort` 会映射到 SDK `variant`
- `system` 会透传
- `thinkingBudget` 当前不会写进 SDK v2 payload，只会记录 debug log

legacy 流式路径则会把：

- `reasoningEffort` 写进 `model.options.reasoningEffort`
- `thinkingBudget` 写进 `model.options.thinking`

### 流式事件处理与取消

服务层的并发模型是“每个 session 一条活动流”：

- `createActiveStreamContext()` 会为 `sessionId` 分配独立 `AbortController`
- 如果同一 session 已有旧流，会先中断旧流再替换
- `handleStreamingEvent()` 负责把 OpenCode event 归一化成 `StreamChunk`

当前会产出的 chunk 类型包括：

- `usage`
- `text`
- `thinking`
- `tool_use`
- `tool_result`
- `permission_request`
- `file_edited`
- `question_request`
- `message_start`
- `message_stop`
- `message_metadata`
- `error`

`sendMessageWithSdk()` 有一个很具体的降级策略：

- 如果 SDK `event.subscribe()` 在第一条事件之前就失败，会回退到 legacy SSE
- 一旦已经开始收到 SDK 事件，后续异常不会再切回 legacy，而是直接产出 `error` chunk

`handleStreamingEvent()` 现在还会显式处理 `session.error`：

- 普通 provider/API 错误会立刻转成 `error` chunk
- `MessageAbortedError` 只会结束流，不会误报成发送失败

除此之外，`finishStreamingResponse()` 在收尾重新拉取 assistant message 时，也会再检查一次 `assistant.info.error`。如果流里没收到 `session.error`，但最终持久化消息里已经带了结构化错误，服务层仍会补发 `error` chunk，避免 UI 再次把它误判成“空回复”。

流结束后，`finishStreamingResponse()` 还会重新拉一次 session messages，补发任何未在流里出现的尾部文本，并补一条 `message_metadata`，最后统一输出 `message_stop`。

取消分两种：

- `cancelStream(sessionId?)`: 先中断本地流，再 best-effort 调用 `abortSessionOnServer()`
- `detachStream(sessionId?)`: 只中断本地观察，不请求服务端 abort

### Todo / status 的 sync 事件循环

只有在 `sdkSync` 开启且存在本地监听器时，才会启动 `global.syncEvent.subscribe()` 循环。

链路如下：

1. `subscribeToSessionTodoUpdates()` / `subscribeToSessionStatusUpdates()` 注册监听器
2. `ensureSyncEventSubscription()` 启动循环
3. `runSyncEventLoop()` 订阅 SDK sync stream
4. `handleSyncEvent()` 只处理两类事件：
   - `todo.updated`
   - `session.status`
5. 订阅失败后等待 1 秒并重试；停止时通过 `AbortController` 中断

修改 vault 路径或设置时，服务会先停掉旧订阅，再按需要恢复。

### 消息标准化、上下文附件与 OMO

`openCodeMessageToChatMessage()` 是服务层和 UI 之间的重要桥：

- 把 `text` / `reasoning` / `tool` parts 组装成 `contentBlocks`
- 为 assistant message 生成 `modelId`
- 为用户消息提取 `contextAttachments`
- 识别 OMO 注入与 system reminder

上下文提取有三条来源：

1. 用户消息中的 synthetic text tag（`parseObsidianContextTag`）
2. `file` parts（`parseFileContextAttachment`）
3. 夹在文本里的 inline Read tool 记录（`Called the Read tool with the following input:`）

file part 与 inline Read tool 里的路径会先通过 `shared/contextPath` 做跨平台归一化：Windows drive path 会统一成 `C:/...`，如果能确认在当前 `vaultPath` 内则再还原为 vault-relative attachment path。

inline Read tool 解析成功后：

- 会把对应的文件/行号转成 `MessageContextAttachment`
- 同时把这段工具调用 JSON 从可见正文里剥离出去

OMO 处理则基于 `detectOmoMessageMeta()`：

- 用户注入消息最终显示 `originalText`
- system reminder 最终显示 `reminderText`
- system reminder 会把 `displayStyle` 设为 `notice`，`noticeTone` 设为 `info`

### 模型、权限、问题与上下文使用快照

除了聊天主链路，服务层还负责一组周边接口：

- `getAvailableModels()`: 读取 SDK `config.providers()` 或 legacy `/config/providers`，并把 string-array/object 两种 provider model 结构统一成同一个返回形状。开启 `includeDirectory` 时，它表示“当前项目目录作用域下的 runtime provider/model 列表”，也是设置页复现 `opencode models` 结果的主入口。
- `getProviderDirectory()`: 读取 SDK `provider.list()` 或 legacy `/provider`，归一化 `all` / `default` / `connected`；它对应的是 connect-provider 目录总览，不是 `opencode models` 的等价接口。
- `getResolvedModelConfig()`: 读取 SDK `config.get()` 或 legacy `/config`，只提取模型相关配置字段。开启 `includeDirectory` 时返回当前项目作用域的解析结果；关闭时返回服务端“默认工作目录作用域”的解析结果，不能把它简单等同于纯全局配置文件。
- `getSessionContextUsageSnapshot()`: 并发读取 session、messages、providers，计算 provider/model 名称、上下文窗口、token 统计和总 cost。
- `getPendingPermissions()` / `respondToPermission()`: 当前跟随 `sdkCrud` 开关走 SDK `permission.*` 或 legacy `/permission/*`。
- `getPendingQuestions()` / `replyToQuestion()` / `rejectQuestion()`: 由 `sdkQuestions` 单独控制。

额外要记住一个容易混淆的点：

- `opencode models` CLI 与 `getAvailableModels(includeDirectory=true)` / `/config/providers` 同源，都是目录作用域下服务端内部 `Provider.list()` 的结果；这里说的是 OpenCode 内部 provider service，不是 SDK `provider.list()` / `/provider` 这条 HTTP 接口
- `provider.list().all` 只是当前作用域下的 connect-provider 目录，不等于当前项目实际启用列表，也不是 models.dev 的无过滤全量目录
- 如果比较 CLI、HTTP API 和插件 UI，一定要先确认三者是不是在同一个 `directory` 作用域下
- 在 Windows 上，插件发送给 OpenCode 的 `directory` 必须规范化成正斜杠路径（例如 `C:/vault`）；如果直接传 `C:\vault`，服务端会退回到接近“无目录作用域”的结果，常见症状就是 runtime providers 只剩 `deepseek`
- 如果 `config.providers(directory)` 和 `opencode models` 仍然对不上，下一步先看 `ServerManager` 有没有继续接管旧的本地 `4096` 服务；不要把 `provider.list()` 重新接回设置页目录

## 关键方法

| 方法 | 说明 |
|------|------|
| `start()` / `stop()` | 启停底层 `ServerManager` 并管理 sync 事件订阅 |
| `checkHealth()` | SDK 优先健康检查，失败时回退到 `ServerManager` |
| `updateSettings()` | 根据新旧设置差异更新 `baseUrl`、`ServerManager` 和订阅状态 |
| `createSession()` | 创建 session，并可同时写入 `currentSessionId` |
| `getSessionMessages()` | 读取消息并应用 revert 过滤 |
| `requestAssistantResponse()` | 非流式请求，返回归一化后的 `ChatMessage` |
| `probeProviderResponse(providerId, modelId)` | 用临时 session 做一次最小真实发送探测 |
| `sendMessage()` | 流式请求入口，按 flag 选择 SDK 或 legacy SSE |
| `cancelStream()` | 本地 abort + 服务端 abort |
| `detachStream()` | 只停止本地流观察 |
| `subscribeToSessionTodoUpdates()` | 订阅 todo.updated sync 事件 |
| `subscribeToSessionStatusUpdates()` | 订阅 session.status sync 事件 |
| `getAvailableModels()` | 读取并统一 provider/model 目录 |
| `getProviderDirectory()` | 读取服务端宽 provider 目录，不等同于运行时可用列表 |
| `getResolvedModelConfig()` | 读取服务器解析后的模型配置子集 |
| `getSessionContextUsageSnapshot()` | 计算 token/cost/context window 快照 |
| `getPendingPermissions()` / `respondToPermission()` | 处理权限请求 |
| `getPendingQuestions()` / `replyToQuestion()` / `rejectQuestion()` | 处理 OpenCode question 请求 |
| `getSessionDiff()` | 拉取 session diff 元数据，并兼容 legacy `before/after` 与 SDK `1.4.x` `patch` 形状 |
| `openCodeMessageToChatMessage()` | 把 OpenCode persisted message 归一化为 UI message |

## 数据流

```mermaid
graph TD
    A[OpenCodianView / TitleGenerationService] --> B[OpenCodeService]
    B --> C{feature flag 路由}
    C -->|SDK| D[createSdkClient]
    C -->|legacy| E[requestUrl + fetch/SSE]
    D --> F[OpenCode Server]
    E --> F
    F --> G[OpenCode message / event]
    G --> H[handleStreamingEvent / normalize*]
    H --> I[StreamChunk / ChatMessage]
    I --> A
```

## 与其他模块的交互

- `ServerManager`: 负责本地/远程服务生命周期与健康检查。
- `OpenCodeSyncEventRuntimeCoordinator`: 负责 `global.syncEvent.subscribe()` 的 session todo/status/message sync event listener registry、订阅重启和 transient connectivity recovery 循环。
- `OpenCodeEventSubscriptionCoordinator`: 负责 `event.subscribe()` / `global.event()` 的 open-code event listener registry、catalog-relevant payload routing、双路订阅重启与 catalog listener emit。
- `createSdkClient`: 为每次 SDK 调用创建客户端实例。
- `sdkFeatureFlags`: 定义 SDK 与 legacy 的路由开关。
- `omoCompat`: 负责 OMO 文本检测与元数据提取。
- `shared/*`: 提供上下文标签、路径解析、tool 状态和结果文本等辅助能力。
- `OpenCodianView`: 是最主要消费者，聊天发送、流式渲染、取消、diff、todo、question 都通过本服务完成。
- `TitleGenerationService`: 调用 `requestAssistantResponse()` 走非流式链路。
- `ModelConfigService`: 现在用 `getAvailableModels()` 的目录作用域运行时列表，加上 `getResolvedModelConfig()` 的禁用配置来构建服务器 catalog；`getProviderDirectory()` 保留给显式诊断 connect-provider 目录时使用。
- 对本地模式的 provider/config 问题，优先用 live HTTP/CLI 调试验证：`config.providers()` 看运行时列表，`provider.list()` 看当前作用域下的 connect-provider 目录，`config.get(directory)` 看当前 vault 解析结果；不要直接拿无 `directory` 的 `/config` 当“全局文件内容”。

## 配置项

| 项目 | 来源 | 当前行为 |
|------|------|---------|
| `sdkFeatureFlags` | 运行时注入 | 不传时全部关闭；`main.ts` 当前 6 个 SDK rollout 开关全部开启 |
| `server.*` | `OpenCodianSettings` | 决定 `baseUrl`、认证方式和 `ServerManager` 行为 |
| `defaultProvider` / `defaultModel` | `OpenCodianSettings` | 调用方未显式传 `provider` / `model` 时作为默认模型 |
| `allowedTools` | `QueryOptions` | 只在 SDK prompt 路径里映射为 `tools` 记录 |
| `reasoningEffort` | `QueryOptions` | SDK 路径映射到 `variant`；legacy 路径映射到 `model.options.reasoningEffort` |
| `thinkingBudget` | `QueryOptions` | legacy 路径会下发；SDK prompt 路径当前仅记录日志，不写入 payload |
| `REMOTE_CONTEXT_TEXT_LIMIT_BYTES` | 常量 | 远程模式上下文文本上限 64 KiB |

## 注意事项

- `OpenCodeService.initialize()` 仍然存在，但运行时入口 `main.ts` 并不调用它；主要使用方是测试。
- `getPendingPermissions()` / `respondToPermission()` 当前跟随的是 `sdkCrud`，不是单独的 permission flag。
- `checkHealth()`、`getAvailableModels()`、`getProviderDirectory()` 和 `getResolvedModelConfig()` 都跟随 `sdkCrud`，而不是独立的 health/models flag。
- `getAvailableModels()` 是运行时可用列表，也是最接近 OpenCode 主界面当前 provider 列表的数据源。
- `getProviderDirectory()` 返回的是 connect-provider 目录；如果只禁用了少量 provider，它仍可能返回上百个可连接项，所以不要把它当成设置页服务器模型目录。
- SDK client 会把 `directory` 作为查询参数和 `x-opencode-directory` 头一起传给服务端；直接手写 HTTP 请求如果不带这个作用域，`/config` 和 `/config/providers` 看到的通常是全局层结果。
- `OpenCodeService` 不再直接使用宿主平台 `path.resolve()` / `path.relative()` 处理 context attachment 的 Windows path；相关兼容逻辑集中在 `shared/contextPath.ts`。
- 本地模式下如果 `4096` 是旧的 managed server，`getAvailableModels()` / `getResolvedModelConfig()` 即使代码本身没错，也会返回“上一份 vault / 上一份配置”对应的结果；先重启 stale server，再判断是不是 SDK/归一化问题。
- legacy `connectSSE()` / `parseSSEEvents()` 仍然是有效回滚路径，不能在 SDK rollout 未完全收口前删除。
- 文件里的 `transformEventToChunks()` / `transformPartToChunks()` 仍保留，但当前主流式路径实际走的是 `handleStreamingEvent()`。

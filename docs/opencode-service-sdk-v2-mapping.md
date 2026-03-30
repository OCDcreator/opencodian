# OpenCodeService 与 SDK v2 详细映射表与迁移方案

## 1. 结论先行

当前 `OpenCodian` 的 `OpenCodeService` 已经进入 **SDK v2 渐进迁移的混合态**：

- 对 UI 仍然保持 `OpenCodeService` facade、不暴露 SDK 原始类型
- 本地 OpenCode 进程仍由 `ServerManager` 管理
- 已新增 SDK v2 client factory / transport / type bridge / feature flags
- 已有一部分 CRUD、非流式 prompt、流式主链、取消逻辑切到 SDK
- 旧 HTTP / 旧 SSE 仍保留为回滚链路

对当前项目最有价值的方向不是“全量切换到 SDK”，而是“保留 Obsidian 适配层和 ServerManager，逐步把 API 调用层与类型层向 SDK v2 对齐”。

推荐策略：

1. 保留 `ServerManager`
2. 保留 `OpenCodeService` 对 UI 的现有接口
3. 先引入 SDK v2 类型与客户端适配层
4. 再把低风险 CRUD / Permission / Config 调用迁到 SDK
5. 最后再迁移流式消息和事件订阅

不建议直接使用 SDK 的 `createOpencodeServer()` / `createOpencode()` 替换现有本地服务管理，因为当前 `ServerManager` 已经承载了 Obsidian 环境特有的逻辑：

- `requestUrl()` 绕过 CORS
- `--cors app://obsidian*`
- Windows 进程树回收
- 已启动服务接管
- `OPENCODE_PURE`
- `OPENCODE_DISABLE_PROJECT_CONFIG`
- `OPENCODE_CONFIG_DIR`
- `OPENCODE_CONFIG_CONTENT`
- vault 工作目录注入

## 1.1 截至 2026-03-29 的当前实施进度（新会话先看这里）

当前实现状态以仓库代码为准，最近一次完整验证结果为：

- 通过：`npm run typecheck`
- 通过：`npm run lint`
- 通过：`npm run test`
- 已构建并部署到 Test Vault
- 最近一次已验证部署的 `BUILD_ID`：`main.202603291252`

### 1.1.1 已实现模块

| 模块 | 当前状态 | 已落地内容 | 关键文件 |
| --- | --- | --- | --- |
| 模块 1：SDK 类型与开关护栏 | 已完成 | 已引入精确版本 `@opencode-ai/sdk@1.3.3`；新增 `sdkCrud` / `sdkPrompt` / `sdkStream` / `sdkAbort` / `sdkQuestions` / `sdkSync`；默认全关，组合根显式启用 rollout defaults；UI 仍只依赖本地类型 | `package.json`、`src/core/opencode/sdkFeatureFlags.ts`、`src/core/opencode/sdkTypes.ts`、`src/main.ts` |
| 模块 2：client factory 与 transport | 已完成 | 新增 `createSdkClient()` 与 `createSdkFetch()`；统一注入 `baseUrl` / 认证头 / `directory`；JSON 走 `requestUrl()` 包装 `Response`，SSE 走原生 `fetch()`；固定 `responseStyle: "data"` 与 `throwOnError: true` | `src/core/opencode/createSdkClient.ts`、`src/core/opencode/sdkFetch.ts` |
| 模块 3：低风险非流式 CRUD | 已完成 | `checkHealth`、`createSession`、`listSessions`、`getSessionMessages`、`deleteSession`、`updateSessionTitle`、`forkSession`、`revertSession`、`getAvailableModels`、`getPendingPermissions`、`respondToPermission` 已切 SDK；读操作保留 legacy fallback，写操作无自动重试 | `src/core/opencode/OpenCodeService.ts` |
| 模块 4：非流式 prompt | 大部分完成 | `requestAssistantResponse()` 已切到 `session.prompt()`；已映射 `text part`、`system`、`provider/model`、`reasoningEffort -> variant`、`allowedTools -> tools`；输出继续归一化为 `ChatMessage` | `src/core/opencode/OpenCodeService.ts` |
| 模块 5：流式消息主链 | 大部分完成 | `sendMessage()` 已切到 `session.promptAsync()` + `event.subscribe()` + 本地 event adapter；已消费 `message.part.delta`、`message.part.updated`、`permission.asked`、`session.idle`、`usage`；reasoning/thinking block 的最终耗时现在优先采用 SDK `reasoning.time.start/end` 计算，前端本地计时仅作流中展示与兜底；首事件前失败会整次回退到 legacy SSE；旧 `connectSSE()` / `parseSSEEvents()` 仍保留；服务层流状态已改成按 `sessionId` 独立，支持多 tab / 多 session 并发流式发送 | `src/core/opencode/OpenCodeService.ts`、`src/features/chat/OpenCodianView.ts` |
| 模块 6：取消与高可用补全 | 大部分完成 | `cancelStream()` 已升级为本地 `AbortController.abort()` + best-effort `session.abort()`；首事件后失败不会中途换链路；SDK abort 失败时会降级到 legacy `/session/:id/abort`；视图层已拆成 per-tab runtime，取消只作用于当前 tab 对应 session | `src/core/opencode/OpenCodeService.ts`、`src/features/chat/OpenCodianView.ts` |

### 1.1.2 未实现或仅部分实现的模块

| 模块 | 当前缺口 |
| --- | --- |
| 模块 4：非流式 prompt | `thinkingBudget` 仍未映射到 SDK prompt payload；`externalContextPaths` 尚未转 `file part`；图片仍是文本占位；`format` / `agent` / `noReply` 尚未开放 |
| 模块 5：流式消息主链 | 事件白名单仍偏保守；`message.part.removed`、`session.status`、`session.diff` 等未接；通用未知事件目前是“安全忽略”为主，尚未补统一日志采样；问题事件仅记录 debug，不进入 UI；多 tab 并发已支持，但“并发 + question/event 扩展”的组合场景自动化覆盖仍不足 |
| 模块 6：取消与高可用补全 | 还没有专门的“服务端已 abort” UI 状态；尚未补充针对异常 finish reason 的细粒度展示 |
| 模块 7：后续增强 | `global.syncEvent.subscribe()` 已接入 `todo.updated` 增量同步；`question.*`、`session.summarize()`、`session.diff()`、`session.unrevert()`、`find.*`、`file.status()`、`vcs.get()` 仍未开始 |
| 模块 8：旧链路收敛 | `connectSSE()`、`parseSSEEvents()`、旧 HTTP helpers 仍保留，计划在至少一个版本周期后再评估收敛 |

### 1.1.3 新会话接力注意事项

- 唯一权威 SDK 参考路径仍是 `reference-projects/opencode/packages/sdk/js/src/v2`
- 不要迁移 `ServerManager` 到 SDK server helper；本轮只迁 client / types / event 使用方式
- 不要删除 legacy `connectSSE()` / `parseSSEEvents()` / legacy HTTP fallback，至少保留一个版本周期
- `src/main.ts` 当前显式注入 `SDK_FEATURE_FLAG_ROLLOUT_DEFAULTS`，而 `OpenCodeService` 默认构造仍使用全关默认值，便于测试精确控制
- 若新会话继续开发，优先顺序建议为：`format/noReply/agent` → `file part / externalContextPaths` → `question.*` → 扩展更多 `syncEvent`
- 手工回归清单见 `docs/opencode-sdk-v2-manual-checklist.md`

## 2. 对比范围

### 当前实现

- `src/core/opencode/OpenCodeService.ts`
- `src/core/opencode/ServerManager.ts`
- `src/core/opencode/types.ts`
- `src/core/types/chat.ts`
- `src/core/types/permission.ts`

### 对照目标

先明确路径层级，避免把整个参考仓库误认为就是 SDK：

- OpenCode 参考仓库根目录：`reference-projects/opencode`
- OpenCode JS SDK 包目录：`reference-projects/opencode/packages/sdk/js`
- 本次迁移直接参考的 SDK v2 源码目录：`reference-projects/opencode/packages/sdk/js/src/v2`

- `reference-projects/opencode/packages/sdk/js/src/v2/client.ts`
- `reference-projects/opencode/packages/sdk/js/src/v2/index.ts`
- `reference-projects/opencode/packages/sdk/js/src/v2/server.ts`
- `reference-projects/opencode/packages/sdk/js/src/v2/gen/sdk.gen.ts`
- `reference-projects/opencode/packages/sdk/js/src/v2/gen/types.gen.ts`

## 3. 当前 OpenCodeService 到 SDK v2 的逐项映射

状态说明：

- `已覆盖`：当前服务已有对应能力，且语义接近
- `部分覆盖`：当前服务有对应能力，但接口更窄、返回值更少、事件处理更粗，或存在行为差异
- `本地实现`：这是 `OpenCodeService` / `ServerManager` 自己的运行时能力，SDK 客户端没有直接等价物
- `未覆盖`：SDK v2 有能力，但当前 `OpenCodeService` 没有公开或没有实现

### 3.1 服务启动、运行态与配置管理

| 当前能力 | 当前实现 | SDK v2 对应 | 状态 | 主要差异 |
| --- | --- | --- | --- | --- |
| `initialize()` | 根据设置决定是否自动启动本地服务 | 无直接客户端方法 | 本地实现 | 这是插件运行时编排，不属于 SDK API |
| `setVaultPath(path)` | 把 vault 目录传给 `ServerManager`，影响 `cwd` 与 `.opencode` 配置读取 | `createOpencodeClient({ directory })` 仅能传请求上下文 | 部分覆盖 | SDK 能传 `directory`，但不负责进程 `cwd` 和配置目录注入 |
| `getSettingsSnapshot()` | 返回插件设置快照 | 无 | 本地实现 | 纯插件内部状态 |
| `start()` | 委托 `ServerManager.start()` | `createOpencodeServer()` / `createOpencode()` | 部分覆盖 | SDK 启动器更通用，但没有当前项目的 Obsidian / Windows / pure mode 适配 |
| `stop()` | 委托 `ServerManager.stop()` | SDK server `close()` | 部分覆盖 | 当前实现支持已接管进程停止、Windows 进程树 kill |
| `isReady()` | 依据 `ServerManager` 状态判断 | 无 | 本地实现 | 纯本地状态 |
| `getServerStatus()` | 返回 `stopped / starting / running / error / restarting` | 无 | 本地实现 | SDK 没有插件级运行状态模型 |
| `checkHealth()` | 访问 `/global/health` 并返回 `boolean` | `client.global.health()` | 部分覆盖 | SDK 返回完整响应体 `{ healthy, version }`；当前只保留布尔值 |
| `isServerProcessRunning()` | 查询插件是否管理着子进程 | 无 | 本地实现 | SDK 无此概念 |
| `updateSettings(settings)` | 重建 `baseUrl`、重启服务、回滚失败配置 | 无 | 本地实现 | 是插件设置变更编排，不属于 SDK |
| `autoFetchModels()` | 服务可用后调用模型目录并修正默认模型 | `client.config.providers()` | 部分覆盖 | 这是 `config.providers()` 的上层策略逻辑，SDK 不负责“修正默认值” |

### 3.2 会话基础能力

| 当前能力 | 当前实现 | SDK v2 对应 | 状态 | 主要差异 |
| --- | --- | --- | --- | --- |
| `createSession(title, { setCurrent })` | `POST /session`，只返回 `sessionId`，可顺带更新本地当前会话 | `client.session.create()` | 部分覆盖 | SDK 返回完整 `Session`；当前方法只暴露 `id` 并附带本地状态更新 |
| `setSessionId(sessionId)` | 设置本地当前会话 | 无 | 本地实现 | 本地 UI 状态 |
| `getSessionId()` | 获取本地当前会话 | 无 | 本地实现 | 本地 UI 状态 |
| `listSessions()` | `GET /session`，失败时吞错并返回空数组 | `client.session.list()` | 部分覆盖 | SDK 支持 `roots/start/search/limit`；当前无过滤与分页 |
| `getSessionMessages(sessionId)` | `GET /session/{id}/message`，失败时返回空数组 | `client.session.messages()` | 部分覆盖 | SDK 支持 `limit/before`；当前无分页参数、无 typed response |
| `getSessionTodos(sessionId)` | 优先走 `client.session.todo()`，失败时回退 `GET /session/{id}/todo` | `client.session.todo()` | 部分覆盖 | 当前已提供 UI 需要的 todo 归一化，但未公开更多原始字段 |
| `deleteSession(sessionId)` | `DELETE /session/{id}`，如果正是当前会话则清空本地状态 | `client.session.delete()` | 部分覆盖 | SDK 返回响应；当前隐藏细节并带本地清理 |
| `updateSessionTitle(sessionId, title)` | `PATCH /session/{id}` 只改标题 | `client.session.update()` | 部分覆盖 | SDK 还支持更新时间字段等 |
| `forkSession(sessionId, messageID?)` | `POST /session/{id}/fork`，返回 `{ id, title }` | `client.session.fork()` | 部分覆盖 | SDK 返回完整 `Session`；当前只保留最小字段 |
| `revertSession(sessionId, messageID, partID?)` | `POST /session/{id}/revert`，归一化成 `boolean` | `client.session.revert()` | 部分覆盖 | SDK 返回完整 `Session`；当前丢弃详细响应 |
| `getSessionContextUsageSnapshot(sessionId)` | 组合 `GET /session/{id}` + `messages` + `config/providers` 生成上下文快照 | 组合 `client.session.get()` + `client.session.messages()` + `client.config.providers()` | 部分覆盖 | 这是很适合保留在本地的组合型 helper，不建议直接暴露 SDK 原始结果 |

### 3.3 非流式消息发送

| 当前能力 | 当前实现 | SDK v2 对应 | 状态 | 主要差异 |
| --- | --- | --- | --- | --- |
| `requestAssistantResponse(message, options)` | 当前优先走 `client.session.prompt()`，flag 关闭时才回退 `POST /session/{id}/message`；已支持 `parts:text`、`model`、`system`、`reasoningEffort -> variant`、`allowedTools -> tools`，最后转成 `ChatMessage` | `client.session.prompt()` | 部分覆盖 | `format`、`agent`、`noReply`、`file/agent/subtask` parts 仍未开放；`thinkingBudget` 仍未映射 |
| 标题生成场景 | `TitleGenerationService` 通过 `requestAssistantResponse()` 临时会话完成，当前默认已走 SDK prompt 链路 | `client.session.prompt()` | 部分覆盖 | 当前不支持结构化输出，可考虑迁到 `format: json_schema` |

### 3.4 流式消息与事件订阅

| 当前能力 | 当前实现 | SDK v2 对应 | 状态 | 主要差异 |
| --- | --- | --- | --- | --- |
| `sendMessage(message, options)` | 当前优先走 `client.session.promptAsync()` + `client.event.subscribe()` + 本地 adapter；仅在首事件前 SDK stream 失败时回退到 legacy `/prompt_async` + `/event` | `client.session.promptAsync()` + `client.event.subscribe()` | 部分覆盖 | 当前白名单只覆盖 `message.part.delta`、`message.part.updated`、`permission.asked`、`session.idle`、`usage`，未完整消费 SDK 事件模型；但已额外利用 reasoning `part.time.start/end` 修正 thinking block 最终耗时 |
| 流取消 `cancelStream()` | 当前会先中断本地流，再 best-effort 调 `session.abort()` 停止服务端 | 本地 `AbortController` + `client.session.abort()` | 部分覆盖 | 服务端 abort 已接入，但 UI 还没有单独展示“已中止 finish reason” |
| `connectSSE()` | 已降级为 legacy fallback transport，只在 SDK 流首事件前失败时使用 | `client.event.subscribe()` | 部分覆盖 | 仍需保留一个版本周期作为回滚链路 |
| `parseSSEEvents()` | 已降级为 legacy fallback parser，只服务于旧 `/event` 回滚链路 | SDK 内部 SSE parser | 部分覆盖 | 仍需保留一个版本周期作为回滚链路 |
| `transformEventToChunks()` | 把 SDK 风格事件转 `StreamChunk[]` | 无直接 API，对应本地 adapter | 本地实现 | 这是一个有价值的适配器雏形，但当前未被实际接入主链 |
| `transformPartToChunks()` | 把 `Part` 转 `StreamChunk[]` | 无直接 API，对应本地 adapter | 本地实现 | 很适合作为未来 SDK 事件接入后的标准适配层 |

### 3.5 模型目录与配置读取

| 当前能力 | 当前实现 | SDK v2 对应 | 状态 | 主要差异 |
| --- | --- | --- | --- | --- |
| `getAvailableModels()` | 调 `GET /config/providers`，兼容 `models` 为数组或对象两种格式，输出扁平 provider/model 结构 | `client.config.providers()` | 部分覆盖 | 当前做了 UI 需要的归一化，这是 SDK 原始数据上层的本地价值 |
| 服务启动后自动修正默认 provider/model | `autoFetchModels()` 里完成 | 无 | 本地实现 | 属于插件体验层，不应迁到 SDK |

### 3.6 权限审批与用户问答

| 当前能力 | 当前实现 | SDK v2 对应 | 状态 | 主要差异 |
| --- | --- | --- | --- | --- |
| `getPendingPermissions()` | `GET /permission` | `client.permission.list()` | 已覆盖 | 当前实现语义基本一致 |
| `respondToPermission(requestID, reply, message?)` | `POST /permission/{requestID}/reply` | `client.permission.reply()` | 已覆盖 | 当前实现语义基本一致 |
| 流式权限卡片 | 当前在 SDK `event.subscribe()` 主链里处理 `permission.asked`，并转成 `StreamChunk.permission_request` | `client.event.subscribe()` 中的 `permission.asked` | 部分覆盖 | 已接入 SDK 主链，但 question UI 仍未实现 |
| 问题请求 | 无 | `client.question.list()` / `reply()` / `reject()` | 未覆盖 | SDK 有完整 question 流程，当前 UI / service 都没有 |

### 3.7 本地消息归一化与 UI 适配

| 当前能力 | 当前实现 | SDK v2 对应 | 状态 | 主要差异 |
| --- | --- | --- | --- | --- |
| `findLatestAssistantWithTokens()` | 从消息列表里提取最近一个有 token 数据的 assistant message | 无 | 本地实现 | 本地聚合逻辑 |
| `openCodeMessageToChatMessage(info, parts)` | 把 OpenCode message + parts 转成 `ChatMessage` / `ContentBlock[]` / OMO meta | SDK `Message` / `Part` 类型可直接复用 | 本地实现 | 这是 `OpenCodian` 的核心价值层，不应被 SDK 取代 |
| OMO 兼容与 notice 样式 | 在消息归一化中检测、提取、展示 | 无 | 本地实现 | 完全是插件 UI 层能力 |

## 4. 当前 OpenCodeService 的实现差异与已知缺口

这一节不是“有没有 API”，而是“即便有对应 API，当前实现与 SDK v2 / 服务器能力相比还差什么”。

### 4.1 流式消息链路的关键差异

| 项目 | 当前实现 | SDK v2 / 服务端能力 | 影响 |
| --- | --- | --- | --- |
| 事件订阅范围 | 当前主链已改为 SDK `event.subscribe()`，仍在本地按 `sessionID` 做二次过滤；legacy `/event` 仅作首包前失败回滚；服务层流 context 已按 session 独立维护 | SDK `event.subscribe()` 支持 typed stream；请求还可带 `directory/workspace` | 多会话安全性已好于纯手写 SSE，且已支撑多 tab 并发发送；`workspace` 仍未接入 |
| 取消行为 | 当前会先中断本地 stream，再 best-effort 调 `session.abort()`；视图层取消已按当前 tab 的 session 定向 | `session.abort()` 才能真正停服务端执行 | 已补服务端 abort，但 UI 侧仍未细分中止状态 |
| 图片输入 | 把图片变成 `[Image: xxx]` 文本占位 | SDK 支持 `FilePartInput` / `file` parts | 当前不是真正的多模态输入 |
| `allowedTools` | 已映射到 SDK `tools` | SDK `prompt()` / `promptAsync()` 支持 `tools` | 当前真实生效，但仍只支持布尔白名单，不含更细粒度配置 |
| `externalContextPaths` | `QueryOptions` 有字段，但未写入请求 | SDK 可通过 `parts:file` 等方式传上下文 | 当前外部上下文路径只是 UI/状态字段，未真正参与 prompt |
| 结构化输出 | 未实现 | SDK `format: { type: "json_schema" }` | 无法直接拿到 schema 校验后的结果 |
| 事件类型覆盖 | 主要处理 `message.part.delta`、`message.part.updated`、`permission.asked`、`session.idle` | SDK 类型还覆盖 `question`、`message.updated`、`message.part.removed`、`session.status`、`session.diff`、`worktree`、`pty` 等 | 当前流式 UI 对上游能力覆盖不全 |
| Part 类型覆盖 | 实际只消费 `text` / `reasoning` / `tool` | SDK `Part` 还包括 `step-start`、`step-finish`、`snapshot`、`patch`、`agent`、`retry`、`compaction`、`subtask` | 会丢掉更丰富的 agent 时间线信息 |
| Sync event 能力 | 已接入 `global.syncEvent.subscribe()`，当前消费 `todo.updated` 并驱动会话待办面板；其余增量事件仍未覆盖 | SDK v2 还提供更丰富的全局增量同步流 | Todo 渲染已不再依赖工具卡文本，但更多会话级增量同步仍主要靠手动拉取与局部事件 |

### 4.2 `requestAssistantResponse()` 的关键差异

| 项目 | 当前实现 | SDK v2 / 服务端能力 | 影响 |
| --- | --- | --- | --- |
| Parts | 当前支持 text part，图片仍降级成文本占位 | 支持 text / file / agent / subtask | 不能精确表达真实文件 / 多模态输入 |
| `system` | 支持 | 支持 | 无明显差异 |
| `model` | 支持 provider/model | 支持 | 无明显差异 |
| `agent` | 不支持 | 支持 | 不能切 agent |
| `format` | 不支持 | 支持结构化输出 | 标题生成、提取任务等能力受限 |
| `noReply` | 不支持 | 支持 | 不能做“只注入上下文不触发回答”的高级场景 |
| `tools` | 已支持 `allowedTools -> tools` | 支持 | 当前只支持布尔白名单映射 |
| `variant` | 已支持 `reasoningEffort -> variant` | 支持 | 仍未暴露更完整 variant 语义 |

### 4.3 `getAvailableModels()` 的关键差异

| 项目 | 当前实现 | SDK v2 / 服务端能力 | 影响 |
| --- | --- | --- | --- |
| 输出结构 | 扁平化成适合 UI 的 provider/model 数组 | SDK 返回 typed 原始结构 | 当前实现对 UI 更友好，建议保留归一化层 |
| default 模型 | 归一化成 `{ [provider]: model }` | SDK 保留服务端结构 | 差异不大，可继续在本地适配 |
| provider 其他信息 | 只保留 `id/name/models/contextWindow` | SDK 类型可能更丰富 | 如果未来需要 auth / method / tags 等信息，当前结构不够 |

### 4.4 v2 数据模型与事件体系中值得额外关注的新增项

这些点不一定都要立即接入，但它们解释了为什么“仅靠当前轻量自定义类型”会逐步与服务端能力脱节。

| 类别 | v2 新增或更完整的内容 | 当前项目现状 | 影响 |
| --- | --- | --- | --- |
| Assistant 错误模型 | `StructuredOutputError`、`ContextOverflowError`、`MessageAbortedError` 等 | 当前只把多数错误降成字符串或通用 error chunk | 结构化输出、上下文溢出等场景无法精细 UI 呈现 |
| Assistant 元数据 | `AssistantMessage.agent`、`structured`、`variant`、`finish` | 当前本地类型未完整承接 | agent 选择、结构化输出结果、finish reason 等信息会丢失 |
| User 元数据 | `UserMessage.format`、`variant`、`tools` | 当前调用面未映射 | 用户侧结构化请求和变体请求难以保真 |
| Session 字段 | `slug`、`workspaceID`、`permission`、`time.archived` | 当前主要只消费 `id/title/time` | 归档、workspace、权限规则与分享增强场景支撑不足 |
| Subtask / agent 时间线 | `SubtaskPart.model`、`SubtaskPart.command`、`AgentPart` | 当前基本未消费 | 子任务和 agent 编排信息无法在 UI 中重建 |
| Compaction 细节 | `CompactionPart.overflow` | 当前未消费 | 无法区分普通总结与 overflow 触发的压缩 |
| MCP resource 引用 | `ResourceSource` | 当前未消费 | MCP 资源来源无法在消息中溯源 |
| 新事件族 | `EventProjectUpdated`、`EventWorkspaceReady/Failed`、`EventWorktreeReady/Failed`、`EventMcpToolsChanged`、`EventMcpBrowserOpenFailed` | 当前 `sendMessage()` 基本不会识别 | 工作区、worktree、MCP 变化无法进入插件状态系统 |
| SyncEvent 体系 | `message.updated.1`、`session.updated.1` 等增量同步事件 | 当前完全未接入 | 多会话、多窗口、后台刷新等同步策略仍偏被动 |

### 4.5 `workspace`、分页与查询语义的当前定位

SDK v2 的大多数 API 都支持 `directory` + `workspace` 双上下文，而当前 `OpenCodian` 实际上只有“当前 vault / 当前 OpenCode project 目录”这一层语义。

当前建议：

1. Phase 1-4 只正式接入 `directory`
2. `workspace` 保持为内部预留能力，不在 UI 或 `OpenCodeService` public API 中提前暴露
3. 如果未来引入 workspace UI，再把 `experimental_workspaceID` 贯通到 SDK client factory

补充说明：

- `client.session.list()` 当前对应的是 `/session`，参数是 `roots/start/search/limit`
- `cursor/archived` 出现在 `client.experimental.session.list()` 对应的 `/experimental/session`
- 因此如果未来要做“归档会话”或更强分页，应该明确是扩展到 `experimental.session.list()`，而不是误认为普通 `session.list()` 已经具备全部能力

## 5. SDK v2 全量能力面与当前 OpenCodeService 覆盖矩阵

这一节按 SDK v2 的模块逐项列出当前覆盖情况。

### 5.1 Global / Auth / App / Project / Config

| SDK v2 能力 | 当前 OpenCodeService 状态 | 当前等价实现 | 备注 |
| --- | --- | --- | --- |
| `global.health()` | 部分覆盖 | `checkHealth()` | 当前只返回 `boolean` |
| `global.event()` | 未覆盖 | 无公开方法 | 当前只用 `/event`，未用 `/global/event` |
| `global.dispose()` | 未覆盖 | 无 | 可作为“重置当前实例”能力 |
| `global.upgrade()` | 未覆盖 | 无 | 插件里通常不应直接开放 |
| `global.syncEvent.subscribe()` | 部分覆盖 | 已订阅 `todo.updated` 并同步到会话待办 UI | 其他 sync 事件仍未消费 |
| `global.config.get()` | 未覆盖 | 无 | 当前 `OpenCodeService` 不公开全局 config |
| `global.config.update()` | 未覆盖 | 无 | 同上 |
| `auth.remove()` | 未覆盖 | 无 | provider auth 管理尚未接入 |
| `auth.set()` | 未覆盖 | 无 | 同上 |
| `app.log()` | 未覆盖 | 无 | 如果要把插件日志写回 OpenCode 服务端，可考虑引入 |
| `app.agents()` | 未覆盖 | 无 | 对 agent 切换功能有价值 |
| `app.skills()` | 未覆盖 | 无 | 对插件探索能力扩展有价值，但当前 UI 没承载 |
| `project.list()` | 未覆盖 | 无 | 当前 OpenCodian 以当前 vault 为中心，不看多项目列表 |
| `project.current()` | 未覆盖 | 无 | 可用于更准确展示项目名 / icon |
| `project.initGit()` | 未覆盖 | 无 | 风险较高，不建议优先开放 |
| `project.update()` | 未覆盖 | 无 | 同上 |
| `config.get()` | 未覆盖 | 无 | 当前只关心 provider 目录，不公开整体配置 |
| `config.update()` | 未覆盖 | 无 | 当前配置写入主要走本地配置管理器，不走服务端 |
| `config.providers()` | 部分覆盖 | `getAvailableModels()` | 当前做了二次归一化 |

### 5.2 Session 主链能力

| SDK v2 能力 | 当前 OpenCodeService 状态 | 当前等价实现 | 备注 |
| --- | --- | --- | --- |
| `session.list()` | 部分覆盖 | `listSessions()` | 当前无筛选 / 分页 |
| `session.create()` | 部分覆盖 | `createSession()` | 当前只返回 `id` |
| `session.status()` | 未覆盖 | 无 | 可用于更准确的 busy / idle 管理 |
| `session.delete()` | 部分覆盖 | `deleteSession()` | 当前语义已够用 |
| `session.get()` | 未覆盖为公开能力 | `getSessionContextUsageSnapshot()` 内部组合调用了私有 GET | 建议补一个公开 `getSession()` |
| `session.update()` | 部分覆盖 | `updateSessionTitle()` | 当前只覆盖标题更新 |
| `session.children()` | 未覆盖 | 无 | 对 fork 树导航有价值 |
| `session.todo()` | 部分覆盖 | `getSessionTodos()` + 会话 todo dock | 已用于会话待办面板，当前仍以 UI 归一化结构为主 |
| `session.init()` | 未覆盖 | 无 | 可用于生成 `AGENTS.md`，但当前插件不一定需要 |
| `session.fork()` | 部分覆盖 | `forkSession()` | 当前丢弃完整 Session 信息 |
| `session.abort()` | 部分覆盖 | `cancelStream()` 内部 best-effort 调用 | 当前没有公开 `abortSession()` facade，但流取消已接入服务端 abort |
| `session.unshare()` | 未覆盖 | 无 | 可后补 |
| `session.share()` | 未覆盖 | 无 | 可后补 |
| `session.diff()` | 未覆盖 | 无 | 对“本轮改了什么”很有价值 |
| `session.summarize()` | 未覆盖 | 无 | 对长会话压缩很有价值 |
| `session.messages()` | 部分覆盖 | `getSessionMessages()` | 当前无分页 |
| `session.prompt()` | 部分覆盖 | `requestAssistantResponse()` | 当前参数面更窄 |
| `session.deleteMessage()` | 未覆盖 | 无 | 对消息管理有价值 |
| `session.message()` | 未覆盖 | 无 | 可用于按 messageID 精确取详情 |
| `session.promptAsync()` | 部分覆盖 | `sendMessage()` | 当前主链已切到 SDK typed stream，但仍保留 legacy `/prompt_async` 回滚链路 |
| `session.command()` | 未覆盖 | 无 | 可用于执行服务端预设命令 |
| `session.shell()` | 未覆盖 | 无 | 可能风险较高，需要权限 UI 配套 |
| `session.revert()` | 部分覆盖 | `revertSession()` | 当前只返回 boolean |
| `session.unrevert()` | 未覆盖 | 无 | fork / rewind 体验不完整 |

### 5.3 Permission / Question / Part

| SDK v2 能力 | 当前 OpenCodeService 状态 | 当前等价实现 | 备注 |
| --- | --- | --- | --- |
| `permission.list()` | 已覆盖 | `getPendingPermissions()` | 已切到 SDK，保留读链路 fallback |
| `permission.reply()` | 已覆盖 | `respondToPermission()` | 已切到 SDK |
| `permission.respond()` | 未覆盖 | 无 | SDK 标成 deprecated，不建议补 |
| `question.list()` | 未覆盖 | 无 | 价值高，适合后续补 UI |
| `question.reply()` | 未覆盖 | 无 | 同上 |
| `question.reject()` | 未覆盖 | 无 | 同上 |
| `part.delete()` | 未覆盖 | 无 | 对编辑消息分段或工具结果管理有价值 |
| `part.update()` | 未覆盖 | 无 | 同上 |

### 5.4 Provider / Find / File / Event

| SDK v2 能力 | 当前 OpenCodeService 状态 | 当前等价实现 | 备注 |
| --- | --- | --- | --- |
| `provider.list()` | 未覆盖 | 无 | 可用于 provider 状态面板 |
| `provider.auth()` | 未覆盖 | 无 | 可用于 provider auth UI |
| `provider.oauth.authorize()` | 未覆盖 | 无 | 需要专门授权流程 |
| `provider.oauth.callback()` | 未覆盖 | 无 | 同上 |
| `find.text()` | 未覆盖 | 无 | 高价值，可用于工作区搜索 |
| `find.files()` | 未覆盖 | 无 | 高价值，可用于快速插入上下文 |
| `find.symbols()` | 未覆盖 | 无 | 高价值，可用于符号级上下文 |
| `file.list()` | 未覆盖 | 无 | 中等价值 |
| `file.read()` | 未覆盖 | 无 | 中等价值 |
| `file.status()` | 未覆盖 | 无 | 高价值，可用于展示当前 diff / dirty files |
| `event.subscribe()` | 部分覆盖 | `sendMessage()` 主链已接入，`connectSSE()` + `parseSSEEvents()` 仅作 fallback | 仍需补更多事件类型与统一未知事件日志 |

### 5.5 MCP / TUI / PTY / Worktree / 其他运行时能力

| SDK v2 能力 | 当前 OpenCodeService 状态 | 当前等价实现 | 备注 |
| --- | --- | --- | --- |
| `mcp.status()` | 未覆盖 | 无 | 未来可做 MCP 状态页 |
| `mcp.add()` | 未覆盖 | 无 | 未来可做动态 MCP 管理 |
| `mcp.connect()` | 未覆盖 | 无 | 同上 |
| `mcp.disconnect()` | 未覆盖 | 无 | 同上 |
| `mcp.auth.remove()` | 未覆盖 | 无 | 同上 |
| `mcp.auth.start()` | 未覆盖 | 无 | 同上 |
| `mcp.auth.callback()` | 未覆盖 | 无 | 同上 |
| `mcp.auth.authenticate()` | 未覆盖 | 无 | 同上 |
| `tui.control.next()` | 未覆盖 | 无 | OpenCodian 不是 TUI 客户端 |
| `tui.control.response()` | 未覆盖 | 无 | 同上 |
| `tui.appendPrompt()` | 未覆盖 | 无 | 同上 |
| `tui.openHelp()` | 未覆盖 | 无 | 同上 |
| `tui.openSessions()` | 未覆盖 | 无 | 同上 |
| `tui.openThemes()` | 未覆盖 | 无 | 同上 |
| `tui.openModels()` | 未覆盖 | 无 | 同上 |
| `tui.submitPrompt()` | 未覆盖 | 无 | 同上 |
| `tui.clearPrompt()` | 未覆盖 | 无 | 同上 |
| `tui.executeCommand()` | 未覆盖 | 无 | 同上 |
| `tui.showToast()` | 未覆盖 | 无 | 同上 |
| `tui.publish()` | 未覆盖 | 无 | 同上 |
| `tui.selectSession()` | 未覆盖 | 无 | 同上 |
| `pty.list()` | 未覆盖 | 无 | 对 Obsidian 内嵌终端有潜力，但当前无 UI |
| `pty.create()` | 未覆盖 | 无 | 同上 |
| `pty.remove()` | 未覆盖 | 无 | 同上 |
| `pty.get()` | 未覆盖 | 无 | 同上 |
| `pty.update()` | 未覆盖 | 无 | 同上 |
| `pty.connect()` | 未覆盖 | 无 | 同上 |
| `experimental.workspace.list()` | 未覆盖 | 无 | 未来如果做多 workspace 才有价值 |
| `experimental.workspace.create()` | 未覆盖 | 无 | 同上 |
| `experimental.workspace.remove()` | 未覆盖 | 无 | 同上 |
| `experimental.session.list()` | 未覆盖 | 无 | 当前无明确价值 |
| `experimental.resource.list()` | 未覆盖 | 无 | 可用于 MCP resource 探索 |
| `worktree.list()` | 未覆盖 | 无 | 对分支 / sandbox 工作流有价值 |
| `worktree.create()` | 未覆盖 | 无 | 同上 |
| `worktree.remove()` | 未覆盖 | 无 | 同上 |
| `worktree.reset()` | 未覆盖 | 无 | 同上 |
| `instance.dispose()` | 未覆盖 | 无 | 可做调试重置 |
| `path.get()` | 未覆盖 | 无 | 可用于 UI 展示当前 cwd / root |
| `vcs.get()` | 未覆盖 | 无 | 高价值，可展示当前分支 |
| `command.list()` | 未覆盖 | 无 | 中等价值 |
| `lsp.status()` | 未覆盖 | 无 | 中等价值 |
| `formatter.status()` | 未覆盖 | 无 | 中等价值 |

## 6. 迁移决策建议

### 6.1 三种可选方案

| 方案 | 做法 | 优点 | 风险/缺点 | 结论 |
| --- | --- | --- | --- | --- |
| 方案 A：完全不引入 SDK | 继续手写 HTTP/SSE/types | 无新增依赖；完全可控 | API 漂移风险最高；维护事件/类型成本持续累积 | 不推荐长期坚持 |
| 方案 B：全量迁移到 SDK | API、流式、服务启动全改成 SDK | 理论上类型统一 | Obsidian `requestUrl`、ServerManager、进程管理、CORS 适配会被打散，迁移成本最高 | 不推荐 |
| 方案 C：混合迁移 | 保留 `ServerManager` 和 UI adapter，只把 API client / types / event stream 逐步迁到 SDK v2 | 成本可控；最符合 Obsidian 环境；能显著降低 API 漂移风险 | 需要做一层 SDK 适配与本地 facade | 推荐 |

### 6.2 推荐结论

推荐采用 `方案 C：混合迁移`。

具体原则：

1. 不迁移 `ServerManager` 到 SDK
2. 不让 UI 直接依赖 SDK 响应类型
3. `OpenCodeService` 继续作为唯一门面
4. 在 `OpenCodeService` 内部逐步用 SDK v2 替换手写请求
5. 保留本地的 `ChatMessage` / `StreamChunk` / OMO / contentBlocks 归一化层
6. 在真正迁移前，先验证 SDK v2 在 Obsidian Electron 环境中的技术可行性

## 7. 可落地迁移方案

下面的方案按“实际收益 / 迁移风险 / 对现有代码侵入程度”排序。

实施说明：

- `reference-projects/opencode` 是 OpenCode 仓库根目录，不是 SDK 目录本身
- 本次迁移涉及的 OpenCode JS SDK 包路径是：`reference-projects/opencode/packages/sdk/js`
- 本次迁移实现时需要优先核对的 SDK v2 源码路径是：`reference-projects/opencode/packages/sdk/js/src/v2`
- 如文档总结与真实实现存在差异，应以 `reference-projects/opencode/packages/sdk/js/src/v2` 下的 `client.ts`、`index.ts`、`server.ts`、`gen/sdk.gen.ts`、`gen/types.gen.ts` 为准

### Phase 0：冻结边界，先引入 SDK v2 但不改行为（已完成）

目标：

- 把 SDK 当“类型来源”和“未来适配目标”
- 不改变现有功能行为

建议改动：

- `package.json`
  - 新增 `@opencode-ai/sdk`
  - 使用精确版本锁定，不使用 `^` / `~`
- 新建 `src/core/opencode/sdkTypes.ts`
  - 统一 re-export 需要的 SDK v2 types
- 新建 `src/core/opencode/sdkNotes.ts` 或相近文件
  - 记录当前 `OpenCodeService` 与 SDK v2 的字段映射约定
- 在文档或代码注释中记录当前对齐的 OpenCode server / SDK 版本组合

额外建议：

- 如果后续进入 CI，可增加一个“SDK 类型漂移检查”步骤
- 最低要求是：升级 SDK 时人工比对 `types.gen.ts` / `sdk.gen.ts` 的关键 diff
- 更进一步可以把项目当前实际使用的类型导出做快照，便于发现破坏性变更

完成标准：

- 工程能编译
- 现有行为零变化
- 新代码可以开始直接引用 SDK v2 的 `Message` / `Part` / `Session` / `PermissionRequest` 等类型

实际价值：

- 先把“类型漂移风险”降下来
- 后续迁移不再需要一次性同时改 transport + types + UI

### Phase 0.5：技术可行性验证（已完成）

这是建议新增的一道前置关卡，用来回答“SDK 在 Obsidian Electron 环境里到底能不能稳定跑”。

验证目标：

1. `@opencode-ai/sdk/v2/client` 能被当前 esbuild 流程正确打包
2. 通过自定义 fetch 适配后，普通 JSON 请求能成功工作
3. SDK 自带 SSE 客户端在 Electron/Obsidian 环境中能正确订阅和中断

最小验证清单：

1. 新建一个临时命令或开发开关，尝试创建 SDK client
2. 调 `client.global.health()` 验证 JSON 请求
3. 调 `client.config.providers()` 验证带 JSON body / query 的常规路径
4. 调 `client.event.subscribe()` 验证 SSE stream
5. 手动中断 stream，确认不会卡死、不泄漏 reader

验证失败时的降级策略：

- 如果 JSON 请求可以，但 SSE 不稳定：只迁非流式 API，继续保留手写 `connectSSE()`
- 如果 JSON 请求本身就不稳定：SDK 仅作为类型来源，不进入 transport 层

完成标准：

- 至少完成一次真实运行验证，而不是只通过 TypeScript 编译
- 明确记录“JSON 可用 / SSE 可用 / 是否需要保留手写流”的结论

### Phase 1：建立 SDK 客户端工厂，但保留 `OpenCodeService` 门面（已完成）

目标：

- 在插件里引入一个“可用的 SDK v2 client”
- 不直接替换所有方法

建议新增文件：

- `src/core/opencode/createSdkClient.ts`
- `src/core/opencode/sdkFetch.ts`

建议实现：

1. 使用 `@opencode-ai/sdk/v2/client` 的 `createOpencodeClient()`
2. 注入“混合 fetch”：
   - 普通 JSON 请求：优先使用 `requestUrl()`，把结果包装成标准 `Response`
   - SSE 请求：继续使用原生 `fetch()`，因为需要 `ReadableStream`
3. 把认证头、baseUrl、directory 统一在工厂里处理
4. 推荐在 client 级别设置：
   - `responseStyle: "data"`
   - `throwOnError: true`

关键适配细节：

- SDK v2 的 fetch 注入签名是 `(input: RequestInfo | URL, init?: RequestInit) => Promise<Response>`
- `requestUrl()` 返回的不是标准 `Response`，需要手动包装
- 适配器至少要处理：
  - `status`
  - `headers`
  - `text/json`
  - 204 / 空 body
  - 错误状态转为可读的 `Response`
- 如果用默认 `responseStyle: "fields"`，SDK 返回的是 `{ data, error, request, response }`
- 为了尽量贴近当前 `OpenCodeService` 的“抛错 + 返回原始 data”语义，更建议统一设置 `responseStyle: "data"` 和 `throwOnError: true`

关键点：

- 不要用 `createOpencodeServer()`
- 不要让 SDK 接管本地进程生命周期
- `directory` 可以开始接入当前 vault path
- `workspace` 暂不启用，但 factory 设计上要预留参数位

完成标准：

- 能创建可用的 SDK client
- 能用 SDK client 成功跑通至少一个简单请求，例如 `config.providers()`
- 不影响原有 `OpenCodeService`

实际价值：

- 先解决“Obsidian 环境能否用 SDK”这个最大前置问题
- 一旦这个适配层稳定，后面迁 API 就是机械替换

### Phase 2：先迁低风险、非流式 API（已完成）

优先迁移的方法：

- `checkHealth()` -> `client.global.health()`
- `createSession()` -> `client.session.create()`
- `listSessions()` -> `client.session.list()`
- `getSessionMessages()` -> `client.session.messages()`
- `deleteSession()` -> `client.session.delete()`
- `updateSessionTitle()` -> `client.session.update()`
- `getAvailableModels()` -> `client.config.providers()`
- `getPendingPermissions()` -> `client.permission.list()`
- `respondToPermission()` -> `client.permission.reply()`
- `forkSession()` -> `client.session.fork()`
- `revertSession()` -> `client.session.revert()`

迁移方式：

- 保持 `OpenCodeService` 的 public method 名称和返回值不变
- 只把内部 `this.get/post/patch/delete()` 改为 SDK 调用
- 继续保留本地二次归一化

返回值适配模板：

如果 Phase 1 已经采用 `responseStyle: "data"` + `throwOnError: true`，那么大多数方法可以按下面的方式迁移：

```ts
const data = await client.session.list({
  directory,
})
return data ?? []
```

如果没有改 SDK 默认配置，而是保留 `fields` 风格，则需要显式适配：

```ts
const result = await client.session.list({
  directory,
})

if (result.error) {
  throw result.error
}

return result.data ?? []
```

建议优先采用第一种风格，因为它更贴近当前 `OpenCodeService` 的行为模型，也能减少 facade 内部的样板代码。

完成标准：

- 现有 UI 无需改动
- 单元测试或手测路径保持通过
- `OpenCodeService` 中手写 CRUD helper 的调用次数显著下降

实际价值：

- 这一阶段性价比最高
- 可以快速把会变的 endpoint / response 结构交给 SDK 托管

### Phase 3：迁移消息发送的非流式分支（大部分完成）

优先迁移：

- `requestAssistantResponse()` -> `client.session.prompt()`

顺手补齐：

- `format` 支持
- `tools` 支持（已完成）
- `agent` 支持
- `noReply` 支持

建议做法：

1. 先保持现有方法签名不变
2. 在内部把 `QueryOptions` 映射到 SDK `prompt()` 参数
3. 为标题生成场景新增可选 `format: json_schema`

完成标准：

- 标题生成继续可用
- 非流式对话继续可用
- 支持至少一个新的 SDK 能力，例如结构化输出

实际价值：

- 可以先把“同步 prompt”稳定下来
- 后续流式迁移的复杂度更可控

### Phase 4：迁移流式消息主链（大部分完成，保留回滚链路）

这是最有价值也最需要谨慎的一阶段。

目标：

- 用 `client.session.promptAsync()` + `client.event.subscribe()` 替代手写 `/prompt_async` + `fetch('/event')` + `parseSSEEvents()`
- 保持外部仍然输出 `AsyncGenerator<StreamChunk>`

建议做法：

1. 新增一个内部 adapter，例如 `sdkEventToStreamChunks(event): StreamChunk[]`
2. 让 `sendMessage()` 内部改为：
   - 调 `client.session.promptAsync()`
   - 订阅 `client.event.subscribe()`
   - 迭代 typed stream
   - 把 event / part 转回现有 `StreamChunk`
3. 在取消时：
   - 本地 `AbortController.abort()`
   - 同时调用 `client.session.abort({ sessionID })`

实现建议：

- 先用 feature flag 控制是否启用“SDK 流式链路”
- 保留原有手写 `connectSSE()` 一段时间作为回滚路径
- 在稳定前，不要立即删除旧实现

必须一起修复的事项：

- `allowedTools` 要映射到 SDK `tools`（已完成）
- `externalContextPaths` 要真正转成 `file` parts；当前实现已明确记录 TODO 并跳过
- 图片输入要转成真实文件 part，而不是文本占位
- `question.asked` 事件要至少先收集并安全忽略，不能直接丢失（已完成“记录 debug + 安全忽略”）
- 新的 `Part` 类型需要有默认降级策略

完成标准：

- 移除 `connectSSE()` 和 `parseSSEEvents()` 的主路径依赖
- 取消流时服务端确实停止执行
- 现有 streaming UI 无回退
- 权限卡片、tool call、thinking block 仍然正常

建议增加的验证指标：

- 首 token 延迟
- 长响应期间的 chunk 完整性
- permission 事件不丢失
- tool call 与 tool result 配对正确
- 中断后服务端是否仍继续执行
- 多次连续对话后是否出现 reader / stream 泄漏

回滚策略：

1. 如果 SDK SSE 在 Obsidian 中出现兼容性问题，先回退到“SDK 非流式 + 手写 SSE”混合模式
2. 如果仅 typed event adapter 有问题，则保留 SDK stream，回滚 adapter 到更保守的事件白名单
3. 在旧实现完全删除前，至少保留一个版本周期的双路径兜底

实际价值：

- 这是最能减少维护成本的一步
- 后续新增事件类型时，只需要扩展 adapter，不必再碰底层 SSE parser

### Phase 5：补齐高价值缺口（未开始）

优先级从高到低建议如下：

1. `question.list()` / `reply()` / `reject()`
   - 价值：补齐真正的“人在回路”交互
2. `session.abort()` 公开 facade / richer abort UI
   - 价值：当前内部 best-effort abort 已落地，下一步应补公开能力与更明确的中止态展示
3. 扩展 `global.syncEvent.subscribe()`
   - 价值：当前已用于 `todo.updated`，下一步可继续承接更多多 tab、后台同步、会话状态刷新事件
4. `session.summarize()`
   - 价值：长对话压缩
5. `session.diff()`
   - 价值：展示这一轮改了什么
6. `session.unrevert()`
   - 价值：完善 fork / rewind 工作流
7. `find.text()` / `find.files()` / `find.symbols()`
   - 价值：在 Obsidian 侧做上下文拾取、代码定位、文件选择
8. `file.status()` / `vcs.get()`
   - 价值：显示当前工作树状态与分支
9. `app.agents()`
   - 价值：如果未来要做 agent 选择器

不建议优先做的能力：

- `tui.*`
- `pty.*`
- `worktree.*`
- `project.initGit()`
- `provider.oauth.*`

这些能力要么与 Obsidian 插件当前 UX 不匹配，要么引入权限 / 风险较高。

### Phase 6：收敛旧实现，保留本地价值层（未开始）

当 Phase 2-4 稳定后，可逐步收敛以下旧代码：

- `OpenCodeService` 里的 `get/post/patch/delete()` 手写 HTTP helper
- `connectSSE()`
- `parseSSEEvents()`
- 旧的自定义 `Message` / `Part` / `Session` 轻量类型

但下面这些本地层建议继续保留：

- `ServerManager`
- `OpenCodeService` 作为对 UI 的唯一 facade
- `openCodeMessageToChatMessage()`
- `StreamChunk`
- OMO 兼容逻辑
- UI 侧的 `ContentBlock` 归一化
- 模型目录的本地归一化逻辑

## 8. 实施顺序建议

如果按“风险最小 + 收益最大”来排，建议顺序是：

1. 引入 SDK v2 依赖与类型
2. 做 Phase 0.5 技术可行性验证
3. 建 `createSdkClient()` + hybrid fetch
4. 迁移非流式 CRUD 与 permission
5. 迁移 `requestAssistantResponse()`
6. 迁移 `sendMessage()` 主链并补 `session.abort()`
7. 补 `question` / `sync event` / `summarize` / `diff` / `find.*` / `file.status()` / `vcs.get()`

## 9. 最终建议

当前项目最实际的目标不是“把 `OpenCodeService` 改造成 SDK 的直通镜像”，而是：

- 继续让 `OpenCodeService` 作为面向 UI 的稳定 facade
- 逐步把 facade 背后的 transport / endpoint / typed response 收敛到 SDK v2
- 保留 `ServerManager`、`ChatMessage`、`StreamChunk`、OMO 兼容、模型归一化这些 Obsidian 插件专属价值层

一句话总结：

**不要全量迁移到 SDK；要做的是把 SDK v2 作为 OpenCode API 的类型与请求底座，渐进替换当前手写 API 层，同时保留 `OpenCodian` 自己的运行时和 UI 适配层。**

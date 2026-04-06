# OpenCodeService 与 SDK v2 当前集成状态

> 更新时间：2026-04-06
>
> 依据：当前仓库 `src/` 代码实现。
>
> 如果这份文档与旧说明冲突，以代码为准；如果与 SDK 行为有疑问，以 `reference-projects/opencode/packages/sdk/js/src/v2` 为准。
>
> 本次更新是基于代码审查的状态刷新，没有重新执行 build/test/deploy。

## 1. 结论先行

当前 `OpenCodian` 的 `OpenCodeService` 已经不是“准备迁移到 SDK”的阶段，而是一个已经落地较深的 **SDK v2 混合 facade**：

- UI 仍只面向 `OpenCodeService` 和本地聊天类型，不直接依赖 SDK 原始类型。
- `ServerManager` 仍负责本地 OpenCode 进程生命周期，SDK 没有接管服务启动。
- SDK v2 已经接管大部分 CRUD、非流式 prompt、流式主链、取消 abort、questions、session diff、todo/status 查询和全局 sync 订阅。
- 旧 HTTP / 旧 SSE 仍保留为 fallback 和回滚链路。

一句话说，当前项目的真实状态是：

**“核心调用链已大面积切到 SDK v2，但仍保留 OpenCodian 自己的运行时编排、消息归一化、Obsidian 上下文适配和 legacy fallback。”**

## 2. Rollout 与开关现状

当前 SDK rollout 有两层语义，需要区分：

1. `OpenCodeService` 默认构造仍是全关，方便测试精确控制。
2. `src/main.ts` 在真实插件运行时显式注入 `SDK_FEATURE_FLAG_ROLLOUT_DEFAULTS`。

当前代码中的 flag 状态如下：

| Flag | `OpenCodeService` 默认值 | `src/main.ts` 运行时默认值 | 当前说明 |
| --- | --- | --- | --- |
| `sdkCrud` | 关 | 开 | 已实际接管大量会话 / 配置 / diff / todo / status 查询 |
| `sdkPrompt` | 关 | 开 | `requestAssistantResponse()` 已走 SDK |
| `sdkStream` | 关 | 开 | `sendMessage()` 主链已走 SDK |
| `sdkAbort` | 关 | 开 | `cancelStream()` 已做 SDK abort + legacy fallback |
| `sdkQuestions` | 关 | 开 | SDK question API 已接入，真实运行时默认启用 |
| `sdkSync` | 关 | 开 | `global.syncEvent.subscribe()` 已用于 todo/status 增量同步 |

这意味着：

- 真实插件运行时，绝大多数 SDK 功能已经在工作。
- `question.list/reply/reject` 的主路径现在已经是 SDK；legacy `/question` 仍保留为回滚链路。

## 3. 当前集成快照

### 3.1 已完成或已大面积落地的模块

| 模块 | 当前状态 | 代码中已落地的内容 | 关键文件 |
| --- | --- | --- | --- |
| SDK 类型桥与开关 | 已完成 | `@opencode-ai/sdk@1.3.3`、`sdkTypes.ts`、`sdkFeatureFlags.ts`、runtime rollout | `package.json`、`src/core/opencode/sdkTypes.ts`、`src/core/opencode/sdkFeatureFlags.ts`、`src/main.ts` |
| SDK client factory 与 transport | 已完成 | `createSdkClient()` + `createSdkFetch()`；JSON 走 `requestUrl()` 包装，SSE 走原生 `fetch()`；`responseStyle: "data"` + `throwOnError: true` | `src/core/opencode/createSdkClient.ts`、`src/core/opencode/sdkFetch.ts` |
| 会话 CRUD 主链 | 已完成 | `checkHealth`、`createSession`、`listSessions`、`getSessionMessages`、`deleteSession`、`updateSessionTitle`、`forkSession`、`revertSession`、`getSessionDiff`、`getSessionInfo` 已接 SDK；多数读链路保留 fallback | `src/core/opencode/OpenCodeService.ts` |
| 模型目录与 provider 配置 | 已完成 | `getAvailableModels()` -> `config.providers()`，并继续做本地归一化与默认值修正 | `src/core/opencode/OpenCodeService.ts` |
| session todo / status | 已完成 | `getSessionTodos()` -> `session.todo()`；`getSessionStatuses()` -> `session.status()` | `src/core/opencode/OpenCodeService.ts` |
| 非流式 prompt | 已大面积完成 | `requestAssistantResponse()` -> `session.prompt()`；支持 `system`、`tools`、`variant`、`contextItems`、图片 file part | `src/core/opencode/OpenCodeService.ts` |
| 流式消息主链 | 已大面积完成 | `sendMessage()` -> `session.promptAsync()` + `event.subscribe()`；首事件前失败时回退 legacy SSE | `src/core/opencode/OpenCodeService.ts` |
| 取消 / abort | 已完成 | 本地 `AbortController` + best-effort `session.abort()` + legacy `/abort` fallback | `src/core/opencode/OpenCodeService.ts` |
| question 事件与 UI | 已完成 | `question.asked` 已转 `StreamChunk.question_request`，UI 已支持 inline/dock、reply/reject、持久化 answered/rejected notice | `src/core/opencode/OpenCodeService.ts`、`src/features/chat/OpenCodianView.ts`、`src/features/chat/ui/QuestionDock.ts` |
| session diff notice | 已完成 | 流中接 `file.edited`，assistant 完成后调用 `session.diff()` 并生成持久 notice | `src/core/opencode/OpenCodeService.ts`、`src/features/chat/OpenCodianView.ts` |
| sync event 增量订阅 | 已完成 | `global.syncEvent.subscribe()` 已接 `todo.updated` 与 `session.status` | `src/core/opencode/OpenCodeService.ts`、`src/features/chat/OpenCodianView.ts` |
| Obsidian 上下文 parts | 已完成 | `contextItems` 在本地模式转 `file` parts，在远程模式转 synthetic text part；历史消息可反解析 `contextAttachments` | `src/core/opencode/OpenCodeService.ts`、`src/shared/obsidianContext.ts` |

### 3.2 当前仍需持续关注的模块

| 项目 | 当前状态 | 说明 |
| --- | --- | --- |
| `format` | 未开放 | `buildSdkPromptParameters()` 还没有映射结构化输出 |
| `agent` | 未开放 | prompt 参数里还没有 agent 选择 |
| `noReply` | 未开放 | 还不能只注入上下文不触发回答 |
| `thinkingBudget` | 未映射 | 代码里明确记录为 omitted |
| `externalContextPaths` | 已废弃但未替代 | 当前会记录 debug 并忽略，新的上下文路径应走 `contextItems` |
| 更多 stream event 类型 | 部分完成 | 还没有系统化处理 `message.part.removed`、`message.updated` 等更丰富事件 |
| `sdkQuestions` rollout | 已默认开启 | 代码支持 SDK `question.*`，runtime 默认 flag 已开，legacy 仅保留回滚用途 |
| `session.summarize()` | 未实现 | 当前没有 facade |
| `session.unrevert()` | 未实现 | 当前只有 `revertSession()` |
| `find.*` / `file.status()` / `vcs.get()` | 未实现 | 还没有接到插件 UI 或 service facade |

## 4. 关键能力逐项映射

### 4.1 服务启动与运行时边界

| 当前能力 | SDK 对应 | 当前状态 | 备注 |
| --- | --- | --- | --- |
| `initialize()` / `start()` / `stop()` | SDK server helpers | 保持本地实现 | 仍由 `ServerManager` 负责，不建议迁给 SDK |
| `setVaultPath()` | `directory` 请求上下文 | 部分对应 | SDK 只负责请求上下文，不负责进程 `cwd` / 环境变量注入 |
| `checkHealth()` | `global.health()` | 已接 SDK | 失败时回退 `ServerManager.checkHealth()` |

### 4.2 会话与基础 CRUD

| 当前能力 | SDK 对应 | 当前状态 | 备注 |
| --- | --- | --- | --- |
| `createSession()` | `session.create()` | 已接 SDK | 仍只向 UI 暴露 `sessionId` |
| `getAvailableModels()` | `config.providers()` | 已接 SDK | 仍保留本地模型目录归一化 |
| `listSessions()` | `session.list()` | 已接 SDK | 失败时回退 legacy HTTP |
| `getSessionMessages()` | `session.messages()` | 已接 SDK | 加了本地 revert-state 过滤 |
| `getSessionTodos()` | `session.todo()` | 已接 SDK | 供 todo dock 使用 |
| `getSessionStatuses()` | `session.status()` | 已接 SDK | 供后台任务 live 状态使用 |
| `deleteSession()` | `session.delete()` | 已接 SDK | 保留本地 currentSession 清理 |
| `updateSessionTitle()` | `session.update()` | 已接 SDK | 当前只改标题 |
| `forkSession()` | `session.fork()` | 已接 SDK | UI 仍用本地最小返回值 |
| `revertSession()` | `session.revert()` | 已接 SDK | 返回值仍归一化成 boolean |
| `getSessionDiff()` | `session.diff()` | 已接 SDK | 已实际用于 turn 后 diff notice |
| `getSessionInfo()` | `session.get()` | 已接 SDK | 当前仍是 service 内部 helper |

### 4.3 Prompt 与上下文

| 当前能力 | SDK 对应 | 当前状态 | 备注 |
| --- | --- | --- | --- |
| `requestAssistantResponse()` | `session.prompt()` | 已接 SDK | 当前非流式主链已走 SDK |
| `sendMessage()` | `session.promptAsync()` + `event.subscribe()` | 已接 SDK | 首事件前失败才回退 legacy SSE |
| `system` | `system` | 已支持 | 已映射 |
| `allowedTools` | `tools` | 已支持 | 目前映射为布尔白名单 |
| `reasoningEffort` | `variant` | 已支持 | 当前直接使用 `reasoningEffort` 字符串 |
| `contextItems` 本地模式 | `parts:file` | 已支持 | `file://` + 选区行号 + `source.text` |
| `contextItems` 远程模式 | `parts:text` | 已支持 | synthetic text part，限制文本和 64 KB |
| 图片输入 `images` | `parts:file` | 已支持 | 现在走 data URL file part，不再是文本占位 |
| `thinkingBudget` | 模型/variant payload | 未支持 | 仍被明确省略 |
| `format` / `agent` / `noReply` | prompt payload | 未支持 | 还没接到 facade |
| `externalContextPaths` | 已废弃 | 未支持 | 当前只记录 debug 并忽略 |

### 4.4 流式事件与 UI

当前 `sendMessageWithSdk()` 主链已经实际处理这些事件：

- `message.part.updated`
- `message.part.delta`
- `permission.asked`
- `question.asked`
- `file.edited`
- `session.idle`
- `usage`

当前行为要点：

- `message.part.updated` 会驱动 tool call/tool result 与 reasoning 持续时间更新。
- `message.part.delta` 会区分 `text` 和 `reasoning/thinking`。
- `permission.asked` 会渲染权限卡片。
- `question.asked` 会渲染问题卡片，并可 reply/reject。
- `file.edited` 会先记账，assistant 完成后再触发 `session.diff()` notice。
- `session.idle` 作为当前 stream stop 信号。

仍未系统消费的事件主要是：

- `message.part.removed`
- `message.updated`
- 更丰富的 worktree / pty / session 事件
- 更广泛的未知事件日志采样

### 4.5 Question / Permission / Sync

| 能力 | SDK 对应 | 当前状态 | 备注 |
| --- | --- | --- | --- |
| `getPendingPermissions()` | `permission.list()` | 已接 SDK | runtime 默认已开 |
| `respondToPermission()` | `permission.reply()` | 已接 SDK | runtime 默认已开 |
| `getPendingQuestions()` | `question.list()` | 已接 SDK | 关闭 flag 时回退 `/question` |
| `replyToQuestion()` | `question.reply()` | 已接 SDK | 关闭 flag 时回退 legacy |
| `rejectQuestion()` | `question.reject()` | 已接 SDK | 关闭 flag 时回退 legacy |
| `todo.updated` | `global.syncEvent.subscribe()` | 已接 SDK | 已驱动 session todo dock |
| `session.status` | `global.syncEvent.subscribe()` | 已接 SDK | 已驱动后台任务状态刷新 |

## 5. 文档与旧状态相比，最需要纠正的点

这次以代码为准重新梳理后，下面这些旧结论已经不准确：

- `question.*` 不能再标为“只实现未启用”。
  - 实际上 service facade、UI、持久化和 stream 事件都已经接上。
  - 现在更准确的说法是：**SDK question API 已实现，且 runtime rollout 默认已开启。**

- `session.diff()` 不能再标为“未开始”。
  - 现在它已经被 `OpenCodianView` 在 `file.edited` 之后实际调用，用于生成持久 diff notice。

- `contextItems` 不能再写成“只有规划，没有真正走 SDK parts”。
  - 现在本地模式已经走真实 `file` part，远程模式已经走 synthetic text part。

- 图片输入不能再写成“文本占位”。
  - 当前 `options.images` 已经映射成 `type: 'file'` 的 data URL part。

- `global.syncEvent.subscribe()` 不能只写 `todo.updated`。
  - 当前还实际消费了 `session.status`。

## 6. 下一步最值得做的事

按当前代码结构，下一阶段最值得继续推进的顺序是：

1. 继续手工验收 `sdkQuestions` 主链，确认 `question.list/reply/reject` 在真实使用场景下稳定。
2. 给 facade 补 `format` / `agent` / `noReply`。
3. 决定 `thinkingBudget` 在 SDK prompt payload 中的映射方式。
4. 扩展 stream event 覆盖面，至少补 `message.part.removed` / `message.updated`。
5. 视产品需要再评估 `session.summarize()`、`find.*`、`file.status()`、`vcs.get()`。

## 7. 维护建议

- 不要迁移 `ServerManager` 到 SDK server helper。
- 不要让 UI 直接依赖 SDK 原始响应类型。
- 不要移除 legacy `connectSSE()` / `parseSSEEvents()` / HTTP fallback，除非至少经历一个版本周期的稳定验证。
- SDK 迁移状态更新时，记得同步刷新：
  - `AGENTS.md`
  - `docs/status/sdk-v2-rollout.md`
  - `docs/status/sdk-v2-manual-checklist.md`

## 8. 关键文件

- `src/core/opencode/OpenCodeService.ts`
- `src/core/opencode/createSdkClient.ts`
- `src/core/opencode/sdkFetch.ts`
- `src/core/opencode/sdkFeatureFlags.ts`
- `src/core/opencode/sdkTypes.ts`
- `src/main.ts`
- `src/features/chat/OpenCodianView.ts`
- `src/features/chat/ui/QuestionDock.ts`
- `src/shared/obsidianContext.ts`

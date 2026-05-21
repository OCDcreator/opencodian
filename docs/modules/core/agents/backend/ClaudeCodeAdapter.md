# ClaudeCodeAdapter

> **源码**: `src/core/agents/backend/ClaudeCodeAdapter.ts`
> **状态**: [REVIEW]

## 概述

`ClaudeCodeAdapter.ts` 是 Claude Code Agent SDK backend adapter。它实现 `AgentService`、`AgentChatCapability` 和 `AgentSessionCapability`，通过注入式或 lazy-loaded SDK facade 调用 `query()`，并复用 Claude options builder、stream normalizer 和 permission bridge。

生产 runtime 通过 `ClaudeCodeSdkLoader` lazy-load 官方 SDK facade，避免插件启动时因为 SDK 包、bundled binary 或本机认证状态阻塞 OpenCodian 启动。生产构建会把 SDK 主包打进 `main.js`，并把当前平台 Claude Code binary 放入 `dist/node_modules/@anthropic-ai/claude-agent-sdk-<platform>/`。`claude-code` 已进入 `IMPLEMENTED_AGENT_BACKENDS`，但默认设置仍只启用 OpenCode；用户需要在 backend 设置中显式启用 Claude Code 并完成 Claude Code 认证。

## 职责

- 声明 Claude Code backend kind、显示名、状态和 Phase 1 capability 集合
- 维护本地 session handle，用于后续 OpenCodian conversation 到 Claude SDK 会话的映射基础
- 捕获 Claude SDK stream 中的真实 `session_id`，把本地 handle alias 到 SDK session id，并在后续发送中通过 `options.resume` 恢复同一 Claude session
- 在 `sendMessage()` 中构造 SDK `query({ prompt, options })` 输入
- 对每个 Claude session 维护一个持久 streaming SDK `Query`：首次发送启动 `query({ prompt: AsyncIterable<SDKUserMessage>, options })`，后续发送把 user prompt 推入同一个 input channel；`sendMessage()` 仍按 OpenCodian 现有 contract 返回 per-turn `StreamChunk` async generator，并在 SDK `result` 消息边界结束本轮输出
- 将 SDK message/event 通过 `ClaudeCodeStreamNormalizer` 转换为 `StreamChunk`
- 将 `ClaudeCodePermissionBridge.canUseTool` 注入 SDK options
- 首次 SDK query 前会加载动态 MCP 配置缓存，即使调用方没有显式 `start()` adapter，也会把项目 `.opencode` 转换后的 Claude `mcpServers` 透传到 SDK options，用于 MCP stdio/runtime 配置接线验证
- 对活跃持久 `Query` 暴露后端 live control：`setModel()`、`setPermissionMode()` 和 `reloadMcpServers()` 会分别委托 SDK `Query.setModel()`、`Query.setPermissionMode()` 和 `Query.setMcpServers()`；没有活跃 query 时保持无害 no-op，MCP reload 会先刷新 adapter 缓存
- 从真实 SDK `Query.supportedModels()` 读取模型目录；本地 facade 兼容官方 `ModelInfo.value/displayName` 与旧 fixture `id/name` 形状，避免把 `supportedModels()` 误挂到顶层 SDK module
- 接收 composer per-send `options.model` 与 `options.variant`，在 SDK query options 中映射为 Claude Code `model` 与 `effort`；若同一持久 query 仍活跃且仅 model 变化，model 会通过 `Query.setModel()` 尝试 live 更新；若 effort 变化，则关闭旧 query 并用已捕获的 SDK session id 重新启动 resumed query，确保下一轮发送应用新的 effort
- 将 SDK `onElicitation` callback 注入 options，生产 host 会把 elicitation 转成 OpenCodian question flow 的统一交互入口
- 将自定义 `abortController` 和 `spawnClaudeCodeProcess` 注入 SDK options，绕开 Obsidian/Electron renderer 对 `child_process.spawn({ signal })` 的 `AbortSignal` 兼容问题
- 支持 `cancelStream()`、`stop()`、`dispose()` 的本地取消和资源清理
- 将 SDK stream 异常转换为 backend-labelled error chunk，避免发送管线无响应
- 在首次 `sendMessage()` 时 lazy-load 官方 SDK；单测仍可注入 fake facade，启动路径不会直接 import SDK
- 对已经持久化到 OpenCodian conversation metadata 的 Claude SDK session id 进行轻量恢复，避免 Obsidian reload 后同一个 `backendSessionId` 因 adapter 内存 Map 清空而在发送前失败；恢复后的第一次 `query()` 会传入 `options.resume`
- 通过 SDK facade 暴露 `listSessions()`、`getSession()`、`renameSession()` 与 `forkSession()` 的基础委托；fork 成功后以 SDK session id 建立新的本地 session state
- 对活跃、checkpoint-enabled 的 SDK `Query` 暴露后端级 `rewindFiles(sessionId, userMessageId, { dryRun? })` 委托；当前没有接入稳定聊天按钮，调用方必须先完成 dry-run/确认设计
- 通过 `createLogger('ClaudeCodeAdapter', { moduleKey: 'claudeCode', channel })` 写入摘要级诊断日志：`runtime` 覆盖 start/stop/dispose/status change、sendMessage、runtime create/reuse/close、SDK load/query creation、supportedModels、spawn command/exit/error；`sessions` 覆盖 create/delete/update/list/get/fork/rewind/restore；`mcp` 覆盖 MCP config load/reload。日志只记录 id、cwd、count、length、状态和错误摘要，不记录 prompt、tool input、secret 或完整 env

## 维护约束

- 不直接静态 import 官方 SDK；真实 SDK 只能通过 `ClaudeCodeSdkLoader` 动态加载，方便测试继续使用 fake facade，并避免 Jest/Obsidian 启动期 ESM 解析问题。
- adapter 的 `debug` / `info` 诊断日志必须继续受全局 `enableDebugLogging`、`claudeCode` debug module 和 Claude Code channel 设置控制；`warn` / `error` 可沿用 shared logger 默认行为。
- OpenCode 仍是默认 backend；Claude Code 必须通过设置显式启用，认证失败会以 Claude Code error chunk 暴露，而不是回落到 OpenCode。
- `spawnClaudeCodeProcess` 不要把 SDK 传入的 `signal` 继续传给 Node `spawn()` options；它需要手动监听 abort 并 kill 子进程，保持 Obsidian renderer 兼容。
- 本地 handle 与 SDK `session_id` 是两层身份：首次发送前只有本地 handle，SDK 输出 `session_id` 后才把 conversation `backendSessionId` 收敛为真实可 resume 的 Claude session id；如果 reload 后传入的 `backendSessionId` 已经是 Claude SDK session id，adapter 会直接恢复 `sdkSessionId` 并 resume。
- 持久 `Query` 关闭或 adapter reload 后，下一次发送会重新启动 SDK query，并在已捕获真实 SDK `session_id` 时继续通过 `resume` 恢复；OpenCodian 本地生成的 `claude-code-*` conversation handle 不会被误传给 SDK `resume`。JSONL replay、完整 history browser、hook/agent/skill authoring UI 和 stable rewind UI 仍属于后续 full-capability phase。
- Claude Code 目前不注册 `Hooks` / `Subagents` UI capability，避免误打开 OpenCode-only 子代理或 hooks surface；SDK hook/subagent 事件先以 diagnostic `backend_event` 进入发送调试链路。
- crash recovery 当前只做错误 chunk；异常后的 prompt replay、冷启动 fallback 和多 view 并发同 session 仲裁属于后续 full-capability phase。

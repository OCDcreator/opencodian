# ClaudeCodeAdapter

> **源码**: `src/core/agents/backend/ClaudeCodeAdapter.ts`
> **状态**: [REVIEW]

## 概述

`ClaudeCodeAdapter.ts` 是 Claude Code Agent SDK backend adapter。它实现 `AgentService`、`AgentChatCapability` 和 `AgentSessionCapability`，通过注入式或 lazy-loaded SDK facade 调用 `query()`，并复用 Claude options builder、stream normalizer 和 permission bridge。

生产 runtime 通过 `ClaudeCodeSdkLoader` lazy-load 官方 SDK facade，避免插件启动时因为 SDK 包、bundled binary 或本机认证状态阻塞 OpenCodian 启动。生产构建会把 SDK 主包打进 `main.js`，并把当前平台 Claude Code binary 放入 `dist/node_modules/@anthropic-ai/claude-agent-sdk-<platform>/`。`claude-code` 已进入 `IMPLEMENTED_AGENT_BACKENDS`，但默认设置仍只启用 OpenCode；用户需要在 backend 设置中显式启用 Claude Code 并完成 Claude Code 认证。

## 职责

- 声明 Claude Code backend kind、显示名、状态和 Phase 1 capability 集合
- 维护本地 session handle，用于后续 OpenCodian conversation 到 Claude SDK 会话的映射基础
- 在 `sendMessage()` 中构造 SDK `query({ prompt, options })` 输入
- 将 SDK message/event 通过 `ClaudeCodeStreamNormalizer` 转换为 `StreamChunk`
- 将 `ClaudeCodePermissionBridge.canUseTool` 注入 SDK options
- 将自定义 `abortController` 和 `spawnClaudeCodeProcess` 注入 SDK options，绕开 Obsidian/Electron renderer 对 `child_process.spawn({ signal })` 的 `AbortSignal` 兼容问题
- 支持 `cancelStream()`、`stop()`、`dispose()` 的本地取消和资源清理
- 将 SDK stream 异常转换为 backend-labelled error chunk，避免发送管线无响应
- 在首次 `sendMessage()` 时 lazy-load 官方 SDK；单测仍可注入 fake facade，启动路径不会直接 import SDK
- 对已经持久化到 OpenCodian conversation metadata 的本地 Claude session handle 进行轻量恢复，避免 Obsidian reload 后同一个 `backendSessionId` 因 adapter 内存 Map 清空而在发送前失败

## 维护约束

- 不直接静态 import 官方 SDK；真实 SDK 只能通过 `ClaudeCodeSdkLoader` 动态加载，方便测试继续使用 fake facade，并避免 Jest/Obsidian 启动期 ESM 解析问题。
- OpenCode 仍是默认 backend；Claude Code 必须通过设置显式启用，认证失败会以 Claude Code error chunk 暴露，而不是回落到 OpenCode。
- `spawnClaudeCodeProcess` 不要把 SDK 传入的 `signal` 继续传给 Node `spawn()` options；它需要手动监听 abort 并 kill 子进程，保持 Obsidian renderer 兼容。
- 这里的 session handle 只是 Phase 1 foundation；轻量恢复只保证 OpenCodian 已持久化的 conversation 能继续触达 SDK/auth/query 路径，真实 Claude resume/fork/history persistence 必须在后续 session lifecycle 任务中补齐。
- crash recovery 当前只做错误 chunk；持久 query 重启、未输出 chunk 时的 replay 和 cold-start fallback 属于后续 full-capability phase。

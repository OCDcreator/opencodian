# CodexAdapter

> **源码**: `src/core/agents/backend/CodexAdapter.ts`
> **状态**: [RUNTIME_PROVEN]
> **Updated**: 2026-06-11 Checkpoint 15F — webSearchMode settings surface productization (settings-only)

## 概述

`CodexAdapter.ts` 是 OpenAI Codex SDK 接入的 AgentService 适配器。它实现 `AgentChatCapability` 和 `AgentSessionCapability`，把 Codex SDK 的 `Codex` / `Thread` API 包装为统一的 agent 后端接口。

## 职责

- 实现 `AgentService` 核心：kind=`'codex'`、identity、status lifecycle、status change handlers
- 实现 `AgentChatCapability`：通过 `thread.runStreamed()` 提供异步流式聊天，经由 `CodexStreamNormalizer` 转换事件
- 实现 `AgentSessionCapability`：基于 provisional local ID + thread ID aliasing 的会话管理
- 提供 DI seam (`CodexFactory`)：测试时注入 mock Codex 实例，无需真实 API key 或网络
- 仅声明有 smoke-test 证据的能力：Chat、Sessions、Thinking、FileOps、Shell
- 使用 bundled `import('@openai/codex-sdk')` (esbuild 打包进 main.js)
- `sendMessage` 在 `resolveOrCreateThread` 阶段捕获异常并降级为 error chunk
- `updateModelReasoningEffort()` 允许运行时更新 reasoning effort，影响后续 thread 创建/恢复
- `updateAdditionalDirectories()` 允许运行时更新额外目录，影响后续 thread 创建/恢复
- `updateNetworkAccessEnabled()` 允许运行时更新网络访问开关，影响后续 thread 创建/恢复
- `updateWebSearchMode()` 允许运行时更新网页搜索模式（disabled/cached/live），影响后续 thread 创建/恢复
- **App-server adjunct client** (Checkpoint 14H): `start()` 初始化 `CodexAppServerClient` 用于 persisted session discovery；`listSessions()` 合并 in-memory 与 app-server threads；`getSessionMessages()` 通过 app-server 读取 thread turns 并归一化为 `{ role, content }` 形状供 `AgentBackendRouting` 消费；`getSession()` 优先 in-memory，回退 app-server；`stop()` 清理 app-server client。App-server 为 best-effort：启动失败时自动降级为仅 in-memory sessions，不影响主 SDK chat path。

## 维护约束

- 隐藏阶段已结束：`'codex'` 已加入 `IMPLEMENTED_AGENT_BACKENDS`，在 UI 暴露为用户可选后端
- `codexPathOverride` 必须在 wiring 阶段通过 `resolveCodexBinaryPath()` 解析并传入，因为 Obsidian 插件 `__filename` 不指向插件目录，SDK 的 `require.resolve` 链会失败
- `skipGitRepoCheck: true` 在 `buildThreadOptions()` 中无条件设置：Obsidian vault 通常不是 Git 仓库。所有 `resumeThread()` 调用（包括 unknown-threadId fallback）均通过 `buildThreadOptions()`，确保非 Git vault 恢复不会失败
- `updateSessionTitle` 是 no-op：Codex SDK 不暴露 title 管理
- `deleteSession` 仅清理本地映射：Codex SDK 不提供显式删除 API
- 新增 Codex 专有能力前必须有 SDK smoke 证据和对应测试
- Session aliasing 使用 provisionalId → threadId 双向映射，避免首次 turn 前 `thread.id === null` 时找不到 session
- `resolveOrCreateThread` 区分 provisional ID（`codex-local-` 前缀）和真实 thread ID：前者走 `startThread()`，后者走 `resumeThread()`
- 认证不预检：Codex CLI 支持多种认证来源（显式 apiKey、`OPENAI_API_KEY` env、`~/.codex/auth.json` ChatGPT login 等），adapter 不在初始化阶段拦截；认证失败在 `thread.runStreamed()` 运行时自然暴露
- `updateModelReasoningEffort()` 更新 options 引用但不影响已创建的 thread；chat toolbar effort selector 通过此方法在"下一 thread"边界生效
- 不在这里实现权限审批、模型目录、MCP 管理；这些属于独立的 capability 接口

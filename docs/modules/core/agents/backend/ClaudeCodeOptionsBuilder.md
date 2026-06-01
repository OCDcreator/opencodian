# ClaudeCodeOptionsBuilder

> **源码**: `src/core/agents/backend/ClaudeCodeOptionsBuilder.ts`
> **状态**: [REVIEW]

## 概述

`ClaudeCodeOptionsBuilder.ts` 是 Claude Code Agent SDK 接入的隐藏 foundation 模块。它把 OpenCodian 的 `backendSettings.claudeCode` 映射成 SDK `query()` options 的本地兼容形状；官方 SDK 的实际加载由 `ClaudeCodeSdkLoader` 负责，本模块不注册 Claude backend。

## 职责

- 固定 `cwd` 为 vault path
- 始终显式写入 `settingSources`，避免依赖 SDK 默认值
- 始终启用 `includePartialMessages: true`
- 始终使用官方 Claude Code preset system prompt 与默认 built-in tools，避免 SDK 默认 minimal prompt / empty tool set 让真实 coding session 缺失 Read/Edit/Bash 等能力；`ClaudeCodeSdkOptionsShape.tools` 类型已拓宽为 `string[] | { type: 'preset'; preset: 'claude_code' }`，支持诊断路径用 `string[]` 覆盖默认 preset 进行工具可用性限制测试，但普通 runtime 始终使用 preset
- 映射 Claude 专属 `permissionMode`、`thinking`、`effort`
- 当 `permissionMode === 'bypassPermissions'` 时显式写入 SDK 要求的 `allowDangerouslySkipPermissions: true`
- 将 OpenCodian UI 中的 `thinking.type === 'fixed'` 映射为官方 SDK `thinking: { type: 'enabled', budgetTokens }`
- 只在用户显式配置时写入 `model`、`fallbackModel`、`additionalDirectories`、`pathToClaudeCodeExecutable`、`canUseTool`、`mcpServers`；`ClaudeCodeOptionsBuilderInput` 现在接受可选 `fallbackModel?: string` 字段，该覆盖值优先级高于 `settings.fallbackModel`；同时接受可选 `model?: string` 字段，该诊断级覆盖值优先级高于 `settings.model`，用于 Capability Lab 的 fallback behavior proof
- 只在用户显式配置时写入 `env`，使用 `{ ...settings.env }` 防御性复制，与 `additionalDirectories`、`allowedTools`、`disallowedTools`、`restrictedBuiltinTools`、`settingSources` 保持一致；调用者在构建后修改 `settings.env` 不会泄漏到 SDK options 快照
- 只在用户显式开启或 runtime 明确注入时写入 `enableFileCheckpointing`、`includeHookEvents`、`forwardSubagentText`、`agentProgressSummaries`；这些是 SDK 诊断/后续能力 foundation，不等同于稳定 JSONL browser、hook authoring 或 rewind UI。`forwardSubagentText` 和 `agentProgressSummaries` 现在支持 runtime-only 覆盖，让 Capability Lab 的 subagent stream proof 可以在不污染稳定设置的情况下强制打开子代理事件流
- 只在 `sandbox.enabled === true` 时写入 `sandbox` 到 SDK options，仅包含 `enabled`、`failIfUnavailable`、`autoAllowBashIfSandboxed` 三个布尔字段；network/filesystem/TLS/proxy/Mach lookup 等子策略不在 stable settings surface 暴露。分类为 readback：option wiring 已证明，OS 级 sandbox 强制执行无法从插件层独立验证
- 只在 `title` 非空且非 resume 时写入 `title` 到 SDK options；SDK 文档说明 title 仅在首次 query 生效，resume 时无效果。分类为 readback：option wiring 已证明，CLI subprocess 是否接受该 title 不从插件层独立验证
- 只在用户显式配置时写入 `maxTurns` 和 `maxBudgetUsd`；null 时省略，保持 SDK 默认无限行为
- 只在 adapter 已捕获真实 Claude SDK session id 时写入 `resume`，让后续 per-send `query()` 续接同一个 Claude session
- 只在 runtime 提供时写入 `abortController` 和 `spawnClaudeCodeProcess`，用于 Obsidian/Electron 下的流取消和进程启动兼容层
- 只在 runtime 明确注入时透传 `hooks`、`sessionStore` / `sessionStoreFlush`、`outputFormat`、`persistSession`、`plugins`、`skills`（包含 SDK 的 `'all'` skills sentinel）、`agent` 和 `agents`，为后续 Claude Code authoring、structured output、agent definitions 和 JSONL mirror/import 诊断保留官方 SDK 通道；这些字段不来自用户设置，也不等同于稳定 UI 已完成
- 允许 runtime-only `includeHookEvents` 覆盖 settings 开关，让 Capability Lab 的 hook / structured-output proof 可以强制打开 hook event 流而不污染稳定设置

## 维护约束

- 这是 SDK options 形状的本地边界；若官方 SDK option 命名变化，应优先在这里收口映射。
- 不要把 OpenCode 的 `permissionMode`、`effortLevel`、`thinkingBudget` 直接复用到这里；Claude 语义由 `backendSettings.claudeCode` 独立表达。
- `settingSources: []` 是显式 none，不能被默认成 `['project']`。
- `fallbackModel` 可以在 builder input 上作为 runtime-only 覆盖传入，优先级高于 `settings.fallbackModel`；用于诊断探针验证 fallback model wiring，不表示 fallback 行为已有完整 E2E 验证。
- `resume` 不是用户设置；它来自 runtime 捕获到的 SDK `session_id`，不能写入 settings。
- `enableFileCheckpointing` 只启用 SDK checkpoint 跟踪；实际 rewind 操作必须经由独立 dry-run/确认 UI 后才能暴露。
- `includeHookEvents` / `forwardSubagentText` / `agentProgressSummaries` 只允许进入诊断 stream 或后续实验 UI；不能据此声明 hooks、subagent transcript 或 authoring UI 已完整完成。
- `persistSession` 也是 runtime 注入项：普通 chat 继续沿用官方默认持久化，Capability Lab 可按需传 `false` 做无痕诊断；不要把它暴露成稳定设置。
- `enableFileCheckpointing` 支持 runtime-only 显式关闭。Capability Lab 的 sessionStore probe 会用这个 override 把 checkpoint tracing 关掉，避免触发官方 SDK 对 `sessionStore + enableFileCheckpointing` 组合的不支持错误。
- `hooks`、`sessionStore`、`outputFormat`、`plugins`、`skills`、`agent` 和 `agents` 是 runtime-injected foundation，只能由后续已验证 runtime owner 传入；不要把它们直接保存到 `backendSettings.claudeCode` 或稳定 settings 控件。
- `abortController` / `spawnClaudeCodeProcess` 是 runtime 注入，不应保存进用户设置。

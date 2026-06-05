# backend/index

> **源码**: `src/core/agents/backend/index.ts`
> **最近更新**: 2026-06-06

## 概述

`backend/index.ts` 是 agent backend 抽象层的 barrel 入口。它集中导出当前已实现 backend 列表、`AgentService` 契约、OpenCode adapter、Claude Code adapter 和 registry，供上层 runtime 与 UI 通过一个稳定路径接入多代理 backend 能力。

## 职责

- 导出 `IMPLEMENTED_AGENT_BACKENDS`，作为设置归一化与 UI 过滤的运行时白名单；当前包含 `opencode` 与 `claude-code`
- 重新导出 `AgentService.ts` 中的核心接口、状态类型、共享 disposable 类型、chat/session 请求类型和可选 capability interface
- 导出 `OpenCodeAdapter` 作为当前 OpenCode backend 的 adapter 实现
- 导出 backend routing helper，供入口、聊天视图和发送管线按 conversation owner / active backend 做 capability narrowing
- 导出 Claude Code adapter、runtime catalog readback 类型、project skill/command/agent/settings discovery helper、model catalog projection、SDK loader、options builder、MCP config adapter、process resolver、stream normalizer 与 permission bridge；`claude-code` 已可在设置中显式启用，默认仍保持 OpenCode
- 导出 `AgentServiceRegistry` 作为 adapter 注册与 active backend 解析 owner
- 保持 type-only 导出与 value 导出分层，避免 barrel 额外引入运行时副作用

## 公共导出

- `IMPLEMENTED_AGENT_BACKENDS`: 已实现 backend kind 的 readonly tuple，用 `AgentBackendKind` 约束元素类型；当前为 `['opencode', 'claude-code']`。
- `AgentServiceRegistry`: backend adapter 注册、启用状态和 active backend 解析 owner。
- `getConversationChatBackendService` / `getConversationSessionBackendService` / `getActiveSessionBackendService`: backend routing helper。
- `OpenCodeAdapter`: OpenCode backend 的 `AgentService` adapter 实现。
- `ClaudeCodeAdapter`: Claude Code official Agent SDK adapter，生产 runtime 通过 `ClaudeCodeSdkLoader` lazy-load 官方 SDK。
- `ClaudeCodeRuntimeCatalog` / `ClaudeCodeRuntimeCatalogCommand` / `ClaudeCodeRuntimeCatalogAgent`: Claude SDK `supportedCommands()` / `supportedAgents()` 的 sanitized readback 类型；只用于 runtime catalog 可见性，不代表命令执行或 agent authoring 能力。
- `ClaudeProjectSkillInfo` / `discoverClaudeProjectSkills`: Claude 项目 `.claude/skills/<name>/SKILL.md` 的只读文件系统 discovery 类型与扫描函数；用于 settings/chat discovery，不代表 SDK runtime 已加载或允许执行该 skill。
- `ClaudeProjectCommandInfo` / `discoverClaudeProjectCommands`: Claude 项目 `.claude/commands/<name>.md` 的只读文件系统 discovery 类型与扫描函数；用于 settings discovery。
- `ClaudeProjectAgentInfo` / `discoverClaudeProjectAgents`: Claude 项目 `.claude/agents/<name>.md` 的只读文件系统 discovery 类型与扫描函数；用于 settings discovery 和 `@agent` mention 候选来源。
- `PromptSuggestionsReadbackProbeResult`: Claude Code `promptSuggestions` 选项 readback probe 结果类型；诊断专用，不验证实际 SDK emission。
- `SystemPromptLiveProbeResult`: Claude Code `systemPrompt` 选项 live behavior probe 结果类型；通过 nonce-bearing diagnostic query 验证同一条 preset-with-append SDK 路径确实影响模型响应。2026-06-04 将 System Prompt 矩阵分类从 `readback` 晋升为 `pass`，但最终 `pass` 依赖 readback wiring + same-path live proof 两层互补证据。
- `SystemPromptReadbackProbeResult`: Claude Code `systemPrompt` 选项 readback probe 结果类型；诊断专用，验证 settings→SDK option mapping，不声称行为验证。
- `PlanModeInstructionsReadbackProbeResult`: Claude Code `planModeInstructions` 选项 readback probe 结果类型；诊断专用，不验证实际 plan-mode behavior enforcement。
- `SandboxReadbackProbeResult`: Claude Code `sandbox` 选项 readback probe 结果类型；诊断专用，不验证实际 OS-level sandbox enforcement 行为。
- `DebugFileReadbackProbeResult`: Claude Code `debugFile` 选项 readback probe 结果类型；诊断专用，不验证实际 CLI debug file writing 行为。
- `StrictMcpConfigReadbackProbeResult`: Claude Code `strictMcpConfig` 选项 readback probe 结果类型；诊断专用，不验证实际 MCP config validation 行为。
- `DebugReadbackProbeResult`: Claude Code `debug` 选项 readback probe 结果类型；诊断专用，不验证实际 CLI debug log emission 行为。
- `Context1mBetaReadbackProbeResult`: Claude Code `betas` 选项 readback probe 结果类型；诊断专用，不验证实际 beta 可用性。
- `JsRuntimeReadbackProbeResult`: Claude Code `executable` 选项 readback probe 结果类型；诊断专用，不验证实际运行时选择行为。
- `LoadTimeoutReadbackProbeResult`: Claude Code `loadTimeoutMs` 选项 readback probe 结果类型；诊断专用，不验证实际超时行为。
- `buildClaudeCodeModelSelectorProviders` / `CLAUDE_CODE_EFFORT_VARIANTS`: Claude Code composer model aliases、SDK supported-model projection 与 effort variants helper。
- `loadClaudeCodeSdk` / `buildClaudeCodeOptions` / `adaptMcpConfigForClaude` / `resolveClaudeCodeProcess` / `createClaudeCodeStreamNormalizer` / `createClaudeCodePermissionBridge`: Claude Code Phase 1 前置 SDK loading、options、MCP config adapter、process、stream 转换与 permission/question bridge helper。
- `AgentService` / `AgentServiceInfo` / `AgentConnectionStatus` / `Disposable` / `StatusChangeHandler`: backend 抽象层核心契约与共享类型。
- `AgentChatSendRequest`: backend-neutral chat 发送请求类型。
- `AgentChatCapability` / `AgentSessionCapability` / `AgentAuthCapability` / `AgentBranchCapability` / `AgentConfigCapability` / `AgentMcpCapability` / `AgentModelCapability` / `AgentPermissionCapability` / `AgentQuestionCapability` / `AgentTodoCapability` / `AgentToolCapability`: 可选 capability interface。

## 依赖

- `src/core/agents/backend/AgentService.ts`：核心类型导出面
- `src/core/agents/backend/AgentBackendRouting.ts`：conversation/active backend capability routing helper
- `src/core/agents/backend/OpenCodeAdapter.ts`：OpenCode adapter 实现
- `src/core/agents/backend/AgentServiceRegistry.ts`：backend registry 实现
- `src/core/agents/backend/ClaudeCodeAdapter.ts`：Claude Code adapter
- `src/core/agents/backend/ClaudeProjectSkillDiscovery.ts`：Claude 项目 `.claude/skills` 文件系统 discovery helper
- `src/core/agents/backend/ClaudeProjectCommandDiscovery.ts`：Claude 项目 `.claude/commands` 文件系统 discovery helper
- `src/core/agents/backend/ClaudeProjectAgentDiscovery.ts`：Claude 项目 `.claude/agents` 文件系统 discovery helper
- `src/core/agents/backend/ClaudeCodeModelCatalog.ts`：Claude Code composer model catalog 与 effort variants projection
- `src/core/agents/backend/ClaudeCodeSdkLoader.ts`：官方 Claude Agent SDK dynamic import facade
- `src/core/agents/backend/ClaudeCodeOptionsBuilder.ts`：Claude SDK options 形状 builder
- `src/core/agents/backend/ClaudeCodeMcpConfigAdapter.ts`：OpenCodian MCP config 到 Claude SDK `mcpServers` 的配置桥接 helper
- `src/core/agents/backend/ClaudeCodeProcessResolver.ts`：Claude process/executable 解析 helper
- `src/core/agents/backend/ClaudeCodeStreamNormalizer.ts`：Claude SDK message 到 `StreamChunk` 的转换 helper
- `src/core/agents/backend/ClaudeCodePermissionBridge.ts`：Claude `canUseTool` / `AskUserQuestion` 到 OpenCodian permission/question host 的桥接 helper
- `src/core/types/chat.ts`：提供 `AgentBackendKind` 类型约束

## 维护约束

- 只聚合 backend 抽象层的公共导出，不在 barrel 中加入运行时逻辑
- 更新已实现 backend 时必须同步 `IMPLEMENTED_AGENT_BACKENDS`，避免设置页暴露尚未接入的 backend；新增 backend 进入列表前必须有 adapter、settings normalization、routing tests 和 runtime smoke 证据
- 新增 backend adapter 或共享类型时，只有需要成为跨目录公共 API 的符号才从这里导出
- 保持 type-only 导出与 value 导出分离，避免 barrel 引入不必要的运行时依赖

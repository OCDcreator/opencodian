# backend/index

> **源码**: `src/core/agents/backend/index.ts`
> **最近更新**: 2026-07-26 — `ClaudeProjectSettingsDiscovery` 保持只读 discover/open；创建与完整 settings mutation 已移交 `ClaudeSettingsSourceService`，barrel 不再导出旧的 `createClaudeProjectSettingsFile`。

> **新增导出**: `CodexProjectResourceDiscovery`（Codex 项目/全局 skills+agents discovery 与安全 CRUD）、`ClaudeCodeProcessMissingReason`、`AppServerSkill`/`AppServerListSkillsOptions`（经 CodexAppServerClient re-export）。

## 概述

`backend/index.ts` 是 agent backend 抽象层的 barrel 入口。它集中导出当前已实现 backend 列表、`AgentService` 契约、OpenCode adapter、Claude Code adapter 和 registry，供上层 runtime 与 UI 通过一个稳定路径接入多代理 backend 能力。

## 职责

- 导出 `IMPLEMENTED_AGENT_BACKENDS`，作为设置归一化与 UI 过滤的运行时白名单；当前包含 `opencode`、`claude-code` 与 `codex`
- 重新导出 `AgentService.ts` 中的核心接口、状态类型、共享 disposable 类型、chat/session 请求类型和可选 capability interface
- 导出 `OpenCodeAdapter` 作为当前 OpenCode backend 的 adapter 实现
- 导出 backend routing helper，供入口、聊天视图和发送管线按 conversation owner / active backend 做 capability narrowing
- 导出 Claude Code adapter、runtime catalog readback 类型、project skill/command/agent/settings discovery helper（settings helper 仅 discover/open）、model catalog projection、SDK loader、options builder、MCP config adapter、MCP elicitation bridge、process resolver、stream normalizer 与 permission bridge；`claude-code` 已可在设置中显式启用，默认仍保持 OpenCode
- 导出 `AgentServiceRegistry` 作为 adapter 注册与 active backend 解析 owner
- 导出 Codex adapter 骨架与 stream normalizer；`codex` 已加入 `IMPLEMENTED_AGENT_BACKENDS`，在 UI 暴露为用户可选后端
- 保持 type-only 导出与 value 导出分层，避免 barrel 额外引入运行时副作用

## 公共导出

- `IMPLEMENTED_AGENT_BACKENDS`: 已实现 backend kind 的 readonly tuple，用 `AgentBackendKind` 约束元素类型；当前为 `['opencode', 'claude-code', 'codex']`。
- `AgentServiceRegistry`: backend adapter 注册、启用状态和 active backend 解析 owner。
- `getConversationChatBackendService` / `getConversationSessionBackendService` / `getActiveSessionBackendService`: backend routing helper。
- `OpenCodeAdapter`: OpenCode backend 的 `AgentService` adapter 实现。
- `ClaudeCodeAdapter`: Claude Code official Agent SDK adapter，生产 runtime 通过 `ClaudeCodeSdkLoader` lazy-load 官方 SDK。
- `ClaudeCodeRuntimeCatalog` / `ClaudeCodeRuntimeCatalogCommand` / `ClaudeCodeRuntimeCatalogAgent`: Claude SDK `supportedCommands()` / `supportedAgents()` 的 sanitized readback 类型；只用于 runtime catalog 可见性，不代表命令执行或 agent authoring 能力。
- `ClaudeProjectSkillInfo` / `discoverClaudeProjectSkills`: Claude 项目 `.claude/skills/<name>/SKILL.md` 的只读文件系统 discovery 类型与扫描函数；用于 settings/chat discovery，不代表 SDK runtime 已加载或允许执行该 skill。
- `ClaudeProjectCommandInfo` / `discoverClaudeProjectCommands`: Claude 项目 `.claude/commands/<name>.md` 的只读文件系统 discovery 类型与扫描函数；用于 settings discovery。
- `ClaudeProjectAgentInfo` / `discoverClaudeProjectAgents`: Claude 项目 `.claude/agents/<name>.md` 的只读文件系统 discovery 类型与扫描函数；用于 settings discovery 和 `@agent` mention 候选来源。
- `ClaudeProjectSettingsInfo` / `discoverClaudeProjectSettings` / `openClaudeProjectSettingsFile`: 项目 `.claude/settings.json` 与 `.claude/settings.local.json` 的只读 strict-JSON 摘要和编辑器路径 helper；不创建文件、不执行 hooks。完整 Project/Local/Global/managed inventory、CAS、archive/restore 由未从 barrel 暴露的 `ClaudeSettingsSourceService` owner 负责。
- `readClaudeProviderConfigSnapshot` / `maskClaudeProviderConfigSnapshot` / `resolveClaudeProviderGlobalEffectiveValue`: 读取并掩码 user/project/local 三个 Claude settings 层及受限 shell 环境；只提供只读对照，不会写入 `~/.claude/**`。
- `applyClaudeProviderPreset` / `migrateClaudeProviderModels` / `validateClaudeProviderPreset`: 项目 provider preset 的受管键投影、单次旧 model migration 与行内校验。写入仅经安全原子写入落到 vault 的 local settings 文件，并保留未知键。
- `PromptSuggestionsReadbackProbeResult`: Claude Code `promptSuggestions` 选项 readback probe 结果类型；诊断专用，不验证实际 SDK emission。
- `SystemPromptLiveProbeResult`: Claude Code `systemPrompt` 选项 live behavior probe 结果类型；通过 nonce-bearing diagnostic query 验证同一条 preset-with-append SDK 路径确实影响模型响应。2026-06-04 将 System Prompt 矩阵分类从 `readback` 晋升为 `pass`，但最终 `pass` 依赖 readback wiring + same-path live proof 两层互补证据。
- `SystemPromptReadbackProbeResult`: Claude Code `systemPrompt` 选项 readback probe 结果类型；诊断专用，验证 settings→SDK option mapping，不声称行为验证。
- `PlanModeInstructionsReadbackProbeResult`: Claude Code `planModeInstructions` 选项 readback probe 结果类型；诊断专用，不验证实际 plan-mode behavior enforcement。
- `PlanModeInstructionsLiveProbeResult`: Claude Code `planModeInstructions` live probe 结果类型；通过计划权限模式、nonce-bearing diagnostic instructions 与自动工具批准验证 planModeInstructions 实际到达模型上下文并影响响应。
- `OutputStyleLiveProbeResult`: Claude Code `settings.outputStyle` live probe 结果类型；通过临时 `.claude/output-styles/<style>.md` custom style file、diagnostic outputStyle override 和 nonce recall 验证 fresh diagnostic query 行为。诊断专用，不证明 active-session live mutation 或当前保存 style name 有效。
- `SandboxReadbackProbeResult`: Claude Code `sandbox` 选项 readback probe 结果类型；诊断专用，不验证实际 OS-level sandbox enforcement 行为。
- `DebugFileReadbackProbeResult`: Claude Code `debugFile` 选项 readback probe 结果类型；诊断专用，验证 settings→SDK option mapping。
- `DebugFileLiveProbeResult`: Claude Code `debugFile` live probe 结果类型；2026-06-06 新增，验证 CLI 子进程在共享文件系统上实际创建非空 debug 文件。整体能力已从 readback 晋升为 pass。
- `StrictMcpConfigReadbackProbeResult`: Claude Code `strictMcpConfig` 选项 readback probe 结果类型；诊断专用，不验证实际 MCP config validation 行为。
- `DebugReadbackProbeResult`: Claude Code `debug` 选项 readback probe 结果类型；诊断专用，不验证实际 CLI debug log emission 行为。
- `Context1mBetaReadbackProbeResult`: Claude Code `betas` 选项 readback probe 结果类型；诊断专用，不验证实际 beta 可用性。
- `JsRuntimeReadbackProbeResult`: Claude Code `executable` 选项 readback probe 结果类型；诊断专用，不验证实际运行时选择行为。
- `LoadTimeoutReadbackProbeResult`: Claude Code `loadTimeoutMs` 选项 readback probe 结果类型；诊断专用，不验证实际超时行为。
- `buildClaudeCodeModelSelectorProviders` / `CLAUDE_CODE_EFFORT_VARIANTS` / `CODEX_EFFORT_VARIANTS`: Claude Code composer model aliases、SDK supported-model projection 与 effort variants helper；`CODEX_EFFORT_VARIANTS` 提供 Codex reasoning-effort levels（`minimal`/`low`/`medium`/`high`/`xhigh`）供 chat toolbar effort selector 使用。
- `loadClaudeCodeSdk` / `buildClaudeCodeOptions` / `adaptMcpConfigForClaude` / `buildClaudeCodeElicitationQuestionRequest` / `resolveClaudeCodeProcess` / `createClaudeCodeStreamNormalizer` / `createClaudeCodePermissionBridge`: Claude Code Phase 1 前置 SDK loading、options、MCP config adapter、MCP elicitation request/content mapping、process、stream 转换与 permission/question bridge helper。
- `AgentService` / `AgentServiceInfo` / `AgentConnectionStatus` / `Disposable` / `StatusChangeHandler`: backend 抽象层核心契约与共享类型。
- `AgentChatSendRequest`: backend-neutral chat 发送请求类型。
- `AgentChatCapability` / `AgentSessionCapability` / `AgentAuthCapability` / `AgentBranchCapability` / `AgentConfigCapability` / `AgentMcpCapability` / `AgentModelCapability` / `AgentPermissionCapability` / `AgentQuestionCapability` / `AgentTodoCapability` / `AgentToolCapability`: 可选 capability interface。
- `CodexAdapter` / `CodexFactory` / `CodexAdapterOptions`: Codex SDK adapter 骨架，实现 AgentChatCapability + AgentSessionCapability；DI seam 支持测试注入。
- `CodexApprovalKind` / `CodexApprovalRequest` / `CodexApprovalDecision` / `CodexApprovalBridgeHost`: Codex server-request 审批 bridge 类型（Round 5）。`CodexAdapter.setApprovalHost(host)` 通过这些类型把 `execCommandApproval` / `applyPatchApproval` server-request 接到 UI-facing host 回调；仅 wire 两种最窄审批形状 + 四个标量 ReviewDecision，运行时触发证明仍待后续。
- `CodexApprovalHostContext` / `CodexApprovalCardRenderer` / `CodexApprovalResolutionResult` / `createCodexApprovalBridgeHost` / `buildCodexApprovalQuestionRequest` / `mapCodexApprovalResolution`: Codex 审批 UI host seam（Round 6）。`createCodexApprovalBridgeHost(getContext)` 返回一个动态读取 context 的 `CodexApprovalBridgeHost`；`buildCodexApprovalQuestionRequest` 把 `CodexApprovalRequest` 翻译为 `QuestionRequest`，`mapCodexApprovalResolution` 把 `showQuestionDialog` 结果映射回 `CodexApprovalDecision`；chat view 通过 `installCodexApprovalHostContext()` 把 `approvalCardRenderer` 挂到 plugin 的 context 上。
- `CodexStreamNormalizer` / `CodexStreamNormalizerOptions` / `createCodexStreamNormalizer`: Codex SDK ThreadEvent → StreamChunk 转换器。

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
- `src/core/agents/backend/ClaudeCodeElicitationBridge.ts`：Claude SDK `onElicitation` request/content 到 OpenCodian `QuestionRequest` 的 shape mapping helper；仅证明 wiring，不代表真实 MCP server roundtrip 已 pass
- `src/core/agents/backend/ClaudeCodeProcessResolver.ts`：Claude process/executable 解析 helper
- `src/core/agents/backend/ClaudeCodeStreamNormalizer.ts`：Claude SDK message 到 `StreamChunk` 的转换 helper
- `src/core/agents/backend/ClaudeCodePermissionBridge.ts`：Claude `canUseTool` / `AskUserQuestion` 到 OpenCodian permission/question host 的桥接 helper
- `src/core/agents/backend/CodexAdapter.ts`：Codex SDK adapter 骨架（Chat + Session）
- `src/core/agents/backend/CodexCliResolver.ts`：用户安装 Codex CLI 的显式路径 / GUI PATH / Windows npm shim 解析；不读取插件私有 runtime
- `src/core/agents/backend/CodexDefaultApprovalHost.ts`：Codex 审批 bridge 的默认 host 实现；连接 adapter 的 `setApprovalHost` 到 view 的 question/inline-card UI
- `src/core/agents/backend/CodexStreamNormalizer.ts`：Codex SDK ThreadEvent → StreamChunk 转换器
- `src/core/agents/backend/CodexAppServerClientTypes.ts`：从 `CodexAppServerClient` 拆出的纯 wire 类型模块（thread/model/account/MCP/review 等），由 `CodexAppServerClient` 通过 `export *` 重新导出
- `src/core/agents/backend/CodexAppServerTransport.ts`：从 `CodexAppServerClient` 拆出的基类，负责 app-server 进程生命周期与 JSON-RPC 2.0 plumbing；`CodexAppServerClient extends CodexAppServerTransport`
- `src/core/agents/backend/CodexAppServerClientNormalization.ts`：从 `CodexAppServerClient` 拆出的 transcript 归一化纯函数模块（`normalizeThreadList` / `normalizeTurnsToPreviewMessages`）
- `src/core/types/chat.ts`：提供 `AgentBackendKind` 类型约束

## 维护约束

- 只聚合 backend 抽象层的公共导出，不在 barrel 中加入运行时逻辑
- 更新已实现 backend 时必须同步 `IMPLEMENTED_AGENT_BACKENDS`，避免设置页暴露尚未接入的 backend；新增 backend 进入列表前必须有 adapter、settings normalization、routing tests 和 runtime smoke 证据
- 新增 backend adapter 或共享类型时，只有需要成为跨目录公共 API 的符号才从这里导出
- 保持 type-only 导出与 value 导出分离，避免 barrel 引入不必要的运行时依赖

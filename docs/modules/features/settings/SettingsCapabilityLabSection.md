# SettingsCapabilityLabSection

> **源码**: `src/features/settings/SettingsCapabilityLabSection.ts`
> **状态**: [REVIEW]

## 概述

`SettingsCapabilityLabSection` 是 Debug 分区 `capability-lab` 二级标签的诊断/实验面板 owner。它提供十个诊断面板，用于检查 Claude Code SDK 能力对等状态，所有面板均标记为 ⚠️ DIAGNOSTIC / EXPERIMENTAL / NOT STABLE，不连接稳定设置持久化。大多数交互仍是只读或 dry-run；sessionStore proof 只会写入插件内存里的 diagnostic store，并通过 Diagnostic Store 列表和 readback 证明隔离路径可读，不会改稳定设置或普通 chat UI。

设计原则：不把未验证能力包装成稳定 UI。允许最小的 diagnostic-only runtime proof，但不能把 hooks / sessionStore 伪装成 stable/completed。structured output 的 transcript 渲染与持久化已稳定，但 authoring/triggering 仍为 diagnostic-only；Capability Lab 只证明边界，不把诊断态升级成正式产品面。

## 诊断面板

| 面板 | 功能 | 数据来源 |
|------|------|----------|
| Capability Matrix | 静态 SDK 能力对等矩阵；`userSurface` 支持 `settings`（稳定设置控制）、`diagnostic`（实验性表面）、`hidden`（未暴露）和 `chat`（普通聊天交互表面）四种分类 | 代码检查 + `getClaudeCodeAdapter()` |
| JSONL History Browser | 浏览本地 JSONL 或 diagnostic store 会话历史，支持 import / mirror proof | `adapter.listSessions()` / `getSessionMessages()` / `importSessionToStore()` / `runDiagnosticPrompt()` |
| Subagent Browser | 列出/检查子代理转录 | `adapter.listSubagents()` / `getSubagentMessages()` |
| Rewind Dry-Run Preview | 预览文件检查点回退（不执行） | `adapter.rewindFiles(dryRun: true)` |
| Structured Output Playground | 启动 runtime-only outputFormat probe 并展示 `backend_event`；探针支持双路径检测：首选 `structured_output` backend_event，若无则回退检测 text chunk 中的合法 JSON | `adapter.runDiagnosticPrompt()` |
| Fork Session Diagnostic | Provider-owned 诊断探针：选择一个 Claude 会话并执行 fork，输出分叉后的 session ID 和标题 | `adapter.listSessions()` / `adapter.forkSession()` |
| Resume Session Diagnostic | Provider-owned 诊断探针：选择一个 Claude 会话并以 `resumeSessionId` 运行诊断 prompt；只有 resulting session id 等于请求的 source session id 时才标 pass，并输出文本预览 | `adapter.listSessions()` / `adapter.runDiagnosticPrompt({ resumeSessionId })` |
| Session Detail Inspection | Provider-owned 诊断探针：选择一个 Claude 会话并调用 `getSession()`，输出 raw session 字段（sessionId, summary, lastModified, messageCount 等）| `adapter.listSessions()` / `adapter.getSession()` |
| Backend Routing Verification | Provider-owned 诊断探针：显示活跃后端、已注册适配器、会话后端分布，验证 `listSessions()` + `getSession()` 通过 provider-owned 路由路径工作，并额外验证 `listBackendSessions()` + `getBackendSessionPreview()` + `readBackendSessionTitle()` + `readBackendSessionShareUrl()` 通过 registry 路由层工作 | `AgentServiceRegistry` / `adapter.listSessions()` / `adapter.getSession()` / `listBackendSessions()` / `getBackendSessionPreview()` / `readBackendSessionTitle()` / `readBackendSessionShareUrl()` |
| Discovery & Status | hooks/plugins/skills/agent-definitions/fallback-model 状态概览，附带 SessionStart hook runtime proof 和 Fallback Model wiring proof；Plugins、Skills 和 Agent Definitions 使用 `getPluginCount()` / `getSkillCount()` / `getAgentDefinitionCount()` 显示配置/发现计数，并通过 `getPluginsList()` / `getSkillsList()` / `getAgentDefinitionsList()` 在 notes 中显示配置名称列表，但始终保持 Discovery Only，不标为 Exposed；Fallback Model 行显示当前配置值和 "Run Fallback Model Proof" 按钮。Permission Approval / AskUserQuestion / Structured Output 三行显示为 Exposed + Ordinary chat verified，并明确不再声称 composer placeholder discoverability 已实现。`/json` discoverability 在本轮保持“未实现”（maintainability / owner-boundary blocker）。**Diagnostic Stream Controls** 子区提供四个诊断/实验性开关（Hook event stream、Forward subagent transcript、Subagent progress summaries、File checkpointing）的 toggle 控制，这些开关已从稳定 Claude Code 设置迁移至此，仍通过 `plugin.settings.backendSettings.claudeCode` 持久化，但仅在诊断探针和流日志中生效，不影响稳定聊天行为。File checkpointing 开关为实验性，启用后可供 rewind dry-run 预览使用，但无稳定 rewind UI。新增 **Run Environment Variables Proof** 按钮，改为 nonce env + env-path 注入，并要求 Bash 执行 `touch "$OPENCODIAN_ENV_PROOF_PATH"`；分层展示 readback / tool_use / env 派生文件副作用 / assistant text 证据，`pass` 只在 env 派生文件副作用命中时成立 | `hasCapability()` + adapter.capabilities + `adapter.runDiagnosticPrompt()` |
| Permission Approval Discovery | Discovery & Status 面板中的 exposed 行：Claude `canUseTool` approval bridge 已接入普通聊天路径的共享权限卡片 UI；无独立 Claude permission 设置页。新增 **Trigger Live Permission Card** 确定性 harness：直接调用 `ClaudeCodePermissionBridge.canUseTool()` 绕过模型，复用真实共享权限卡片 UI；若聊天视图已激活则弹出真实 permission card，用户批准/拒绝后返回结果并标记 `pass`；若 renderer 未注册则标记 `boundary` 并提示打开聊天视图。新增 **Launch Ordinary Chat Permission Proof**：通过真实聊天管道发送文件创建 prompt，临时覆盖 permissionMode 为 `plan`，模型调用工具时触发权限卡片，用户批准后流继续，目标文件成功创建 | `ClaudeCodePermissionBridge.canUseTool()` / `sendPipelineRuntime.sendMessage()` |
| AskUserQuestion / Elicitation Discovery | Discovery & Status 面板中的 exposed 行：AskUserQuestion answer bridge 与 `onElicitation` callback 已接入普通聊天路径的共享提问对话框。新增 **Trigger Live Question Dialog** 确定性 harness：直接调用 `ClaudeCodePermissionBridge.canUseTool('AskUserQuestion', …)` 绕过模型，复用真实共享提问对话框；若聊天视图已激活则弹出真实 question dialog，用户回答/取消后返回结果并标记 `pass`；若 renderer 未注册则标记 `boundary` 并提示打开聊天视图 | `ClaudeCodePermissionBridge.canUseTool()` |
| MCP Servers Discovery | Discovery & Status 面板中的 exposed/discovery 行：显示 adapter 已加载 MCP server 数量；MCP authoring 在共享 Settings > MCP 标签，Claude Code Tools 标签提供运行时刷新 | `adapter.getMcpServerCount()` |
| Plugins Discovery | Discovery & Status 面板中的 detection-only 行：显示 adapter 已加载 plugin 数量及名称列表（如 `2 plugin(s): my-plugin, other-plugin`），不提供 authoring | `adapter.getPluginCount()` + `adapter.getPluginsList()` |
| Skills Discovery | Discovery & Status 面板中的 detection-only 行：显示 adapter 已加载 skill 数量及名称列表（如 `3 skill(s): skill-a, skill-b`），`skills: 'all'` 时显示 "All skills enabled"，不提供 authoring | `adapter.getSkillCount()` + `adapter.getSkillsList()` |
| Agent Definitions Discovery | Discovery & Status 面板中的 detection-only 行：显示 adapter 已配置 agent definition 数量及名称列表（如 `2 agent definition(s): agent-a, agent-b`），`agent` 与 `agents` 同时存在时合并显示，不提供 authoring | `adapter.getAgentDefinitionCount()` + `adapter.getAgentDefinitionsList()` |

## 依赖注入

通过 `CapabilityLabDeps` 接口接收外部依赖：

- `plugin`: OpenCodianPlugin 实例
- `createSectionHeading`: 共享标题创建回调

## 核心逻辑

### Capability Matrix

`buildMatrixRows()` 静态评估 24 项 Claude Code SDK 能力（Hooks、File Checkpoint、JSONL History、Session Store、Skills、Plugins、MCP Servers、Allowed Tools、Disallowed Tools、Turn/Budget Limits、Environment Variables、Fallback Model、Permission Approval、AskUserQuestion / Elicitation、Agents、Agent Definitions、Structured Output、Subagent Transcript、Include Hook Events、Import Session、Fork Session、Resume Session、Session Detail、Backend Routing），每项包含 SDK Exposed、Adapter Wired、Runtime Proof 和 Stable UI 四个维度。多数 Runtime Proof 默认为 `untested`，在对应诊断面板执行实时调用后更新为 `pass`、`fail`、`wiring`、`boundary` 或 `readback`。Allowed Tools、Disallowed Tools、Turn/Budget Limits 标记为 `Settings` + `Readback`，表示 Stable Settings Readback Proof 已验证选项被正确构建并传入 SDK，但行为验证（SDK/模型实际遵守约束）尚未完成。**Environment Variables** 已升级为 `Settings` + `Verified`：通过 diagnostic bypass path（`_diagnosticBypassPermissions: true`）实现运行时行为证明，Layer 1-4 全部 PASS，证明 env vars 传播到 Claude/Bash 子进程；作用域边界明确：证明 env 传播，不证明权限审批 UX。Permission Approval 标记为 `Chat` + `Verified`，表示已通过普通聊天端到端 proof：launcher 临时覆盖 permissionMode 为 `plan`，通过真实聊天管道发送文件创建 prompt，模型调用 ExitPlanMode、Bash (mkdir) 和 Write 工具，每个工具调用都触发 `data-permission-card` 权限卡片，用户点击 "允许一次" 后流继续，目标文件成功创建。AskUserQuestion / Elicitation 标记为 `Chat` + `Verified`，表示已通过普通聊天端到端 proof：模型调用 AskUserQuestion，问题对话框渲染，用户回答后流继续。Structured Output 标记为 `Chat` + `Verified`，表示 `/json` 前缀触发器在普通聊天中工作：前缀被剥离，固定 JSON schema 被注入 outputFormat，重复 raw JSON 被抑制，结构化输出 badge 在流中和重载后均正确渲染。新增确定性 live UI harness（Trigger Live Permission Card / Trigger Live Question Dialog）可直接调用 `ClaudeCodePermissionBridge.canUseTool()` 绕过模型，复用真实共享 UI；若聊天视图已激活则标记 `pass`，若 renderer 未注册则标记 `boundary`。已添加 `data-permission-card` / `data-permission-action` 和 `data-question-card` / `data-question-action` 选择器到权限/问题 inline card DOM，供验证稳定定位。MCP Servers 标记为 `Settings` + `Verified`，表示 runtime passthrough 已有正向 proof。Fallback Model 标记为 `Settings` + `Wiring`，因为行为证明已明确失败（无效主模型时 SDK 返回 400 而非 fallback）；Stable Settings Readback Proof 可以验证 fallbackModel 选项被正确传入 SDK，但这不改变总体 `wiring` 分类。`File Checkpoint / Rewind` 标记为 `Diagnostic` + `Untested`：开关已从稳定设置移除，仅在 Capability Lab 诊断流控制区可用，且无稳定 rewind UI。`Subagent Transcript / Progress` 与 `Include Hook Events` 标记为 `Diagnostic` + `Untested`，因为这些开关只喂给 diagnostic/experimental event stream，不构成完整 transcript/progress UI 或 hook authoring 产品面。`Agent Definitions` 只表示 SDK `agent` / `agents` runtime-only 透传已接线，仍是 Hidden/Untested，不代表 agent authoring UI 已完成；`Session Store` 也只是隔离的 diagnostic store proof，不是正式会话存储产品面。

`buildMatrixRows()` 还包含 MCP Servers 行，标记为 SDK exposed + adapter wired、runtime proof `pass`、user surface `settings`；MCP runtime passthrough 已有正向 proof，共享 Settings > MCP 标签提供 authoring，Claude Code Tools 标签提供运行时刷新。

### 诚实性审计

单元测试中新增 `audits capability matrix for honest classifications across all 24 rows` 用例，显式枚举每行的预期 `runtimeProof` 和 `userSurface`，并强制执行两条不变规则：
1. 恰好五行标 `Verified`（MCP Servers、Permission Approval、AskUserQuestion / Elicitation、Structured Output、Environment Variables）——任何把未验证行提升为 `Verified` 的改动都会使测试失败；这五行均已有运行时端到端 proof（Environment Variables 通过 diagnostic bypass path 的分层行为证明）；
2. 恰好六行标 `hidden`（Hooks、Session Store、Skills、Plugins、Agent Definitions、Import Session to Store）——任何把 hidden 行暴露到 settings/diagnostic 的改动都会使测试失败。

该审计测试确保 matrix 静态评估不会随代码演进意外漂移，未来若要晋升某行的 classification，必须同时更新测试中的预期映射并给出明确理由。

### Runtime Proof 更新

`updateRuntimeProof()` 在诊断面板执行后更新页面内嵌标记，支持五种状态：`pass`（运行时验证通过）、`fail`（运行时验证失败）、`untested`（未测试）、`wiring`（仅验证选项被 SDK 接受，未验证真实行为）、`boundary`（工具边界被触发但诊断路径缺少 UI 上下文，无法完成完整交互链）。不跨标签持久化——矩阵行是静态的，运行时证明反馈只在浏览器区域展示。

### Diagnostic Session Store

文件内部持有一个 plugin-scoped `CapabilityLabSessionStore`，实现 SDK `SessionStore` 所需的 `append` / `load` / `listSessions` / `listSubkeys`，用于 Capability Lab 的 mirror/import/list/load proof。Mirror probe 使用 `runDiagnosticPrompt({ sessionStore, sessionStoreFlush: 'eager' })` 写入后，会切到 Diagnostic Store、重新列出并选中返回的 session，再通过 `getSessionMessages(sessionId, { sessionStore, limit: 50, includeSystemMessages: false })` 渲染消息预览作为 readback proof；如果 readback 没有返回任何消息，则 Session Store proof 失败。它是内存态、plugin-owned 的诊断 adapter，不是稳定数据层。
该内存 store 现在也有直接单测，覆盖 append/load 往返、重复 append、listSessions mtime、listSubkeys、空 store 隔离和 projectKey 隔离，但这些测试只证明诊断 store 行为，不把它升级成正式存储产品。

### Adapter 获取

`getClaudeCodeAdapter()` 从 `plugin.agentServiceRegistry` 获取 `'claude-code'` 注册的 adapter 并窄化类型为 `ClaudeCodeAdapter`。如果 adapter 不可用，相关面板显示 "not available" 提示。

Discovery 面板在 adapter 可用时调用 `adapter.getMcpServerCount()`、`adapter.getPluginCount()`、`adapter.getSkillCount()` 和 `adapter.getAgentDefinitionCount()` 显示当前已加载 MCP server / plugin / skill / agent definition 数量，并通过 `getPluginsList()` / `getSkillsList()` / `getAgentDefinitionsList()` 在 notes 中显示配置名称列表；adapter 不可用时显示 detection unavailable。这些检测均为只读，不写入设置，也不创建/编辑对应配置。Skills 的 `getSkillCount()` 在 `skills` 选项为 `'all'` 时返回 `-1`，面板会显示 "All skills enabled" 而非具体数量。MCP notes 指向 Claude Code settings 的 Tools tab runtime refresh 控件，已加载 server 时显示 `Exposed`。Permission Approval 与 AskUserQuestion / Elicitation 也显示 `Exposed`，标记 bridge/seam 已接入普通聊天路径的共享 UI。Skills / Plugins / Agent Definitions 的可见只读摘要在 Capability Lab Discovery 和 Claude Code settings 的 SDK Foundations tab 中显示，但即使有配置名称也保持 `Discovery Only`，不使用 active/exposed chip 样式。Capability matrix 中 Skills、Plugins 和 Agent Definitions 仍保持 `runtimeProof: 'untested'` 与 `userSurface: 'hidden'`；当前名称列表只是配置摘要诊断，不是 runtime proof，也不是 authoring UI。

## 导入关系

```text
上游: node:fs (existsSync, rmSync), node:os (tmpdir), node:path (join), obsidian (Notice, Setting), ../../core/agents/AgentCapability (BackendCapabilities, hasCapability), ../../core/agents/backend/ClaudeCodeAdapter, ../../i18n (t), ../../main (OpenCodianPlugin), ../../shared (createLogger, getVaultBasePath)
下游: src/features/settings/SettingsTabbedRenderer.ts
```

## 关键方法

| 方法 / 导出 | 说明 |
|-------------|------|
| `SettingsCapabilityLabSection` | 诊断面板 owner 类 |
| `constructor(deps)` | 接收 `CapabilityLabDeps` |
| `dispose()` | 空实现，预留清理 |
| `attachTabbed(containerEl, secondaryTabId)` | 渲染完整诊断面板 |
| `renderCapabilityMatrix()` | 渲染能力矩阵表格 |
| `buildMatrixRows(adapter)` | 构建静态能力矩阵行 |
| `renderHistoryBrowser()` | 渲染 JSONL 历史浏览器 |
| `renderSubagentBrowser()` | 渲染子代理浏览器 |
| `renderRewindDryRun()` | 渲染 rewind dry-run 预览 |
| `renderStructuredOutputPlayground()` | 渲染结构化输出实验场 |
| `renderForkProbe()` | 渲染 Fork Session 诊断探针（provider-owned, diagnostic only） |
| `renderResumeProbe()` | 渲染 Resume Session 诊断探针（provider-owned, diagnostic only） |
| `renderSessionDetailProbe()` | 渲染 Session Detail 诊断探针（provider-owned, diagnostic only） |
| `renderBackendRoutingProbe()` | 渲染 Backend Routing 诊断探针（provider-owned, diagnostic only） |
| `renderDiscoveryStatus()` | 渲染发现/状态面板 |
| `runPermissionApprovalProof()` | 运行 Permission Approval 诊断探针：使用可能触发工具调用的 prompt 运行诊断 prompt，检查输出中是否出现 `tool_use` 和 `tool_result` chunks。由于工具调用是非确定性的，该探针无论是否捕获到工具调用都标记为 `wiring`，并诚实说明这不证明 Obsidian 权限卡片 UI 的端到端交互 |
| `runAskUserQuestionProof()` | 运行 AskUserQuestion 诊断探针：使用可能触发 AskUserQuestion 工具调用的 prompt 运行诊断 prompt，检查输出中是否出现 `AskUserQuestion` tool_use chunks。由于工具调用是非确定性的，该探针无论是否捕获到工具调用都标记为 `wiring` 或 `boundary`，并诚实说明这不证明 Obsidian 提问对话框的端到端交互 |
| `injectSyntheticStreamingContext()` | **Diagnostic-only helper**：为当前活跃的 OpenCodian 聊天标签页注入一个临时的 synthetic streaming assistant message element，使共享 inline card renderers 获得 DOM 目标，无需真实模型流。通过运行时反射访问 chat view 私有方法获取 tab runtime state，创建临时 div 并设置 `runtime.streamingMessageEl`，返回 cleanup 函数。严格限定在 harness 范围，不污染稳定聊天路径。若聊天视图未打开或内部结构不可访问则返回 `success: false`。成功注入后会通过 `getTabRuntimeState(tabId)` 回读验证 `streamingMessageEl` 是否确实写入，并返回 `diagnostics` 对象（含 `tabId`、`verified`、`previousStreamingMessageEl`、`runtimeKeys`、`isStreaming`、`messagesContainerConnected`、`messagesContainerChildCount`），用于运行时排查 boundary 原因 |
| `runLivePermissionCardHarness()` | **确定性 live UI harness**：先调用 `injectSyntheticStreamingContext()` 创建临时 streaming 上下文，然后直接调用 `ClaudeCodePermissionBridge.canUseTool()` 触发真实共享权限卡片 UI，不依赖模型。验证 bridge → host → renderer → user → result 完整链条。若 synthetic context 注入失败（聊天视图未激活）则标记 `boundary`；若 bridge 调用成功（无论用户选择 allow/deny/reject 或 cancel）均标记 `pass`，因为任何非异常结果都证明 UI 渲染并完成了交互闭环。cleanup 在 finally 中执行，确保临时 element 被移除、runtime state 被恢复。注入后会输出 `tabId`、`verified`、`isStreaming` 等诊断字段，帮助定位 boundary 原因 |
| `runLiveQuestionDialogHarness()` | **确定性 live UI harness**：先调用 `injectSyntheticStreamingContext()` 创建临时 streaming 上下文，然后直接调用 `ClaudeCodePermissionBridge.canUseTool('AskUserQuestion', …)` 触发真实共享提问对话框，不依赖模型。验证 bridge → host → question renderer → user → result 完整链条。若 synthetic context 注入失败（聊天视图未激活）则标记 `boundary`；若 bridge 调用成功（无论用户选择 allow/deny 或 cancel）均标记 `pass`。cleanup 在 finally 中执行，确保临时 element 被移除、runtime state 被恢复。注入后会输出 `tabId`、`verified`、`isStreaming` 等诊断字段，帮助定位 boundary 原因 |
| `runStreamingContextProbe()` | **Streaming Context 隔离探针**：不经过 bridge → host 链条，直接通过运行时反射获取 `StreamingInlineCardRenderer` 实例并调用 `createStreamingInlineCard()`，验证 synthetic streaming context 是否足以让 renderer 创建卡片。若直接调用成功但 live harness 仍失败，说明 blocker 在上游（bridge/host/tabId 不匹配）；若直接调用也失败，说明 synthetic context 本身仍缺少 renderer 所需的某个 runtime 前提。用于精确收敛 boundary 位置。**重要限制**：该探针仅验证共享 streaming insertion path 和 permission host seam (`collectToolApproval`)，因此只标记 **Permission Approval** 为 `pass`；它**不**验证 question bridge 路径，因此**不会**标记 **AskUserQuestion / Elicitation** 为 `pass`。Question bridge 的证据必须来自独立的 `runLiveQuestionDialogHarness()` DOM/runtime 证明 |
| `runFallbackModelProof()` | 运行 Fallback Model behavior 诊断探针：使用故意无效的主模型 `model: 'opencodian-invalid-model-test-xyz123'` 配合有效 fallback 模型启动诊断 prompt，通过检查返回的 `message_metadata` chunk 中的 `modelId` 来验证 SDK 是否真的发生了 fallback 切换；只有在检测到查询成功且使用的模型不是无效主模型时，才会标记为 `pass`，否则保持 `wiring` 或标记 `fail`。`extractModelFromDiagnosticResult()` 辅助方法从 chunks 和 rawMessages 中提取模型标识 |
| `runStableSettingsReadbackProof()` | **Stable Settings Readback Proof**：运行一个最小诊断 prompt 以触发 `buildDiagnosticSdkOptions()`，然后通过 `adapter.inspectLastDiagnosticSdkOptions()` 读取实际构建的 SDK options 的安全副本，验证 Allowed Tools、Disallowed Tools、Turn/Budget Limits、Environment Variables 和 Fallback Model 是否被正确映射到 options 形状中。每个 capability 只显示一条明确的 readback 结果（带 capability 名称，不匿名重复刷 marker）。Allowed Tools、Disallowed Tools、Turn/Budget Limits 如果配置非空则标记为 `readback`。Environment Variables 标记为 `pass`，因为其 runtime 行为已通过独立 diagnostic bypass path 分层证明。Fallback Model 虽然可以验证选项被传入 SDK，但总体分类保持 `wiring`，因为行为证明已明确失败（SDK 在无效主模型时返回 400 而非 fallback）。该证明区分了 **runtime-readback verified**（选项确实被构建并传入 SDK）和 **behavior verified**（SDK/模型实际遵守了该约束），是诚实的中间状态升级。如果没有任何设置被配置，输出提示用户去设置页配置后再运行 |
| `runEnvironmentVariablesProof()` | **Environment Variables 分层行为证明**：向稳定 Claude env 设置临时注入唯一 nonce（`OPENCODIAN_ENV_PROOF_*`）和唯一路径（`OPENCODIAN_ENV_PROOF_PATH`，值由 `os.tmpdir()` + nonce 派生，避免 mac-only `/tmp` 硬编码），运行诊断 prompt 强制请求 Bash 执行 `touch "$OPENCODIAN_ENV_PROOF_PATH"`。**权限路径**：使用 `_diagnosticBypassPermissions: true` 标志让诊断 prompt 以 `bypassPermissions` 模式运行，跳过 `canUseTool` / `onElicitation` 接线，使 Bash 子进程在没有聊天流式 UI / 权限卡片宿主可用时仍能执行。作用域边界：这证明 env 传播到 Claude/Bash 子进程，**不**证明权限审批 UX（权限审批由普通聊天 + live harness 路径独立证明）。方法在运行前后清理 probe 文件，并在 `finally` 恢复原 env，不修改 `permissionMode` |
| `inspectLastDiagnosticSdkOptions()` | 通过 adapter 暴露的诊断方法，返回最后一次诊断 prompt 构建的 SDK options 的**深拷贝副本**（使用 `structuredClone` 或 JSON fallback）。这是 runtime readback 的基础：不依赖静态代码检查，而是验证真实运行时构建的 options 形状；返回副本确保诊断 UI 不会意外污染 adapter 内部状态 |

## 数据属性标记

所有面板和控件使用 `data-diagnostic="true"` 属性标记，便于样式和测试区分诊断性 UI。

## CSS 类命名

样式由 `src/style/components/settings-capability-lab.css` 持有，使用 `opencodian-capability-lab-*` 前缀：

- `.opencodian-capability-lab-banner` — 顶部实验性警告横幅
- `.opencodian-capability-lab-summary` — 诊断边界摘要条，明确只读、dry-run 与运行时证明不持久化
- `.opencodian-capability-lab-table-shell` — 能力矩阵横向滚动容器
- `.opencodian-capability-lab-matrix` — 能力矩阵表格；最后一列使用 `User Surface` 标记 `Settings` / `Diagnostic` / `Hidden`，避免把未验证能力包装成稳定 UI
- `.opencodian-capability-lab-chip` — 状态芯片
- `.opencodian-capability-lab-controls` — 控件容器
- `.opencodian-capability-lab-output` — 输出区域
- `.opencodian-capability-lab-preview-list` / `.opencodian-capability-lab-preview-row` — 只读消息预览列表，避免 history browser 退化成整块 JSON 墙
- `.opencodian-capability-lab-error` — 错误提示
- `.opencodian-capability-lab-proof-marker` — 运行时证明标记

## 注意事项

- sessionStore import / mirror proof 会写入隔离的 diagnostic store；mirror proof 必须完成 Diagnostic Store list/select/readback 并读到至少一条消息才算通过。这不属于稳定插件状态，也不等于开放正式 import/restore UI
- `buildMatrixRows()` 的评估基于代码检查，不是运行时探测
- Structured Output 与 Hooks proof 都通过 `runDiagnosticPrompt()` 直接观察 backend_event；普通 `OpenCodianView` 仍不会把这些事件渲染进稳定 transcript。structured output 的 transcript 渲染已稳定，但 authoring/triggering 仍只在诊断面板里可见。`runStructuredOutputProbe()` 支持双路径检测：首选 `structured_output` backend_event，若 SDK 未 emit 该事件，则回退检测 text chunk 中的合法 JSON。fallback 检测不再使用宽松的字段存在性检查，而是要求 JSON 严格满足 schema 边界：`status` 必须是 `"ok"` 或 `"error"`，`surface` 必须是 `"diagnostic"`，`confidence` 必须是有限数字且范围在 `[0, 1]`。不满足这些条件的 JSON（例如 `confidence: 1.5` 或 `status: "partial"`）不会被接受为 fallback structured output，探针会诚实标记为 fail。`tryParseFallbackStructuredOutput()` helper 负责集中 fallback 解析与验证，降低 `runStructuredOutputProbe()` 的圈复杂度。
- Discovery 面板使用 `hasCapability()` 检查 adapter 声明的能力
- 文件使用 `eslint-disable max-lines` 注释，因为十个诊断面板共享同一诊断边界
- Fork Session 诊断探针是 provider-owned 的诊断界面，不是稳定的跨后端 fork UI。它只直接调用 Claude Code adapter 的 `forkSession()`，不触碰权威同步、diff、子会话图或通用 `getSession` 语义
- Resume Session 诊断探针同样是 provider-owned 的诊断界面，不是稳定的 resume-at / resume product surface。它验证 `runDiagnosticPrompt({ resumeSessionId, _diagnosticResumeAt: true })` 能否把 SDK `options.resume` 打通到诊断 query，并要求返回的 `result.sessionId` 等于请求的 source session id；如果 SDK 返回不同 session id，探针会标记失败，避免把 fresh session 误报为 resume proof。`_diagnosticResumeAt` 是显式诊断标志，resume-at 必须在此标志为 `true` 时才被接受，防止误用于稳定聊天路径。这不等于普通聊天或正式恢复 UI 已完成。
- Session Detail 诊断探针是 provider-owned 的诊断界面，不是稳定的跨后端 session-detail object contract。它调用 `adapter.getSession()` 并展示原始字段，仅用于验证 `getSession()` 在 Claude Code runtime 上可执行，不代表任何后端通用 session shape
- Backend Routing 诊断探针是 provider-owned 的诊断界面，验证后端路由基础设施工作正常。它显示活跃后端、已注册适配器和会话后端分布，并通过 `listSessions()` + `getSession()` 验证 provider-owned 路由路径，同时通过 `listBackendSessions()` + `getBackendSessionPreview()` + `readBackendSessionTitle()` + `readBackendSessionShareUrl()` 验证 registry 路由层（产品化的窄 seam）。不是稳定产品界面
- Backend Routing 诊断探针读取已注册适配器时使用 `AgentServiceRegistry.listAll()` 公开接口，不再依赖 registry 私有 `adapters` map 的实现细节
- Rewind Dry-Run 预览的 `runRewindDryRun()` 方法调用 `adapter.rewindFiles(sessionId, userMessageId, { dryRun: true })` 并渲染结果或错误+提示；该调用路径已有单元测试覆盖（成功渲染 + 失败错误提示），不改变 rewind 仅诊断、非稳定产品的事实
- Subagent Browser 的 `loadSubagents()` 和 `loadSubagentMessages()` 方法已有完整单元测试覆盖：会话刷新、子代理列表渲染、空列表处理、列表加载失败、子代理消息加载、消息加载失败、运行时证明 pass/fail，共 8 个测试用例
- Discovery 面板里的 Hooks / Agent Definitions / Session Store 条目保持 `Discovery Only`，只表示诊断观察，不是稳定产品面；Hook proof 现在会同时展示 SessionStart 事件和 hook event timeline，并在成功时同时更新 `Hooks` 和 `Include Hook Events` 的运行时证明，但仍只属于诊断验证。`Include Hook Events` 标记为 pass 是诚实的：该 proof 显式设置 `includeHookEvents: true`，然后真实捕获到 `backend_event` + `event: 'hook'` 的流事件；如果没有 `includeHookEvents`，这些 hook 事件不会出现在诊断输出中，因此这是真正的运行时依赖证明
- Discovery 面板里的 Plugins 条目使用 `adapter.getPluginCount()` 动态显示配置/发现状态：有 plugins 时显示计数和名称列表，但状态仍是 "Discovery Only"，不使用 active/exposed chip；该检测为只读，不提供 plugin authoring，也不是 runtime proof
- Discovery 面板里的 Skills 条目使用 `adapter.getSkillCount()` 动态显示配置/发现状态：有 skills 时显示计数和名称列表，`skills: 'all'` 时显示 "All skills enabled"，但状态仍是 "Discovery Only"；该检测为只读，不提供 skill authoring，也不是 runtime proof
- Discovery 面板里的 Permission Approval / AskUserQuestion / Elicitation 条目显示为 `Exposed`，当前文案为 “Ordinary chat verified / Chat-surface validated in Capability Lab harness”，不再保留 “Wired only” 旧描述。验证路径保持诚实边界：Capability Lab harness 与普通聊天证据证明了 chat surface 可交互，不把 `/json` composer discoverability 误报为已实现。MCP Servers 条目在有服务器加载时显示为 `Exposed`，运行时透传通过共享 Settings > MCP 标签管理，Claude Code Tools 标签提供刷新控件
- Capability Matrix 支持 `readback` runtime proof 状态，用于区分 **runtime-readback verified**（选项被构建并传入 SDK）和 **behavior verified**（SDK/模型实际遵守了约束）。`Allowed Tools`、`Disallowed Tools`、`Turn/Budget Limits` 在 Stable Settings Readback Proof 通过后标记为 `readback`。**`Environment Variables`** 已升级为 `pass`（`Verified`）：通过 diagnostic bypass path（`_diagnosticBypassPermissions: true`）实现运行时行为证明，Layer 1-4 全部 PASS，证明 env vars 传播到 Claude/Bash 子进程；作用域边界明确：证明 env 传播，不证明权限审批 UX。`runStableSettingsReadbackProof()` 为每个 capability 只输出一条明确的 readback 结果（带 capability 名称，不匿名重复刷 marker）。`Fallback Model` 的选项可以被 readback 验证，但总体分类保持 `wiring`，因为行为证明已明确失败（无效主模型时 SDK 返回 400 而非 fallback）；readback UI 会明确标注 "Option read back correctly, but overall capability remains wiring-only because behavior proof failed"
- Capability Matrix 中 `Subagent Transcript / Progress` 与 `Include Hook Events` 使用 `Diagnostic` surface：SDK Foundation 设置可以配置 options，但不表示普通聊天 transcript/progress 或 hook authoring 已稳定提供
- Subagent Transcript / Progress 的 runtime proof 遵循诚实性边界：`runSubagentStreamProof()` 只有在诊断流中真实捕获到 `subagent`、`tool_progress` 或含 `subagentId`/`agentId`/`progress` 的 backend_event 时才标记为 pass；仅成功运行 diagnostic prompt 且 SDK 接受了 `forwardSubagentText` / `agentProgressSummaries` options 但零子代理事件出现时，必须标记为 fail，不能把 option acceptance 伪装成 runtime proof。Discovery 控制区现在提供 `Run Subagent Stream Proof` 按钮，运行 diagnostic prompt 时启用 `forwardSubagentText` 和 `agentProgressSummaries`，成功后更新 `Subagent Transcript / Progress` 运行时证明；即使未捕获到子代理事件（单轮 prompt 不触发子代理生成），也会诚实标注 wiring 已验证
- Fallback Model proof 使用 behavior proof 方式：`runFallbackModelProof()` 使用故意无效的主模型 `model: 'opencodian-invalid-model-test-xyz123'` 配合有效 fallback 模型运行诊断 prompt，通过 `extractModelFromDiagnosticResult()` 检查返回的 chunks 和 rawMessages 中的模型标识；只有当查询成功且检测到的模型不是无效主模型时，才会标记为 `pass`（"✓ Runtime verified"）。如果查询成功但没有检测到可信的模型信号，保持 `wiring`（"⚠ Wiring only — not behavior verified"）。如果查询失败（即使配置了 fallback），标记为 `fail`。矩阵中 Fallback Model 行保持 `wiring` / `Settings`，因为行为证明已明确失败（无效主模型时 SDK 返回 400 而非 fallback）。Stable Settings Readback Proof 可以验证 `fallbackModel` 选项被正确传入 SDK，但这不改变总体 `wiring` 分类

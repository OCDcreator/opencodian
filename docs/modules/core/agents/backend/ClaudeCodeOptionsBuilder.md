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
- 只在 `sandbox.enabled === true` 时写入 `sandbox` 到 SDK options；除 `enabled`、`failIfUnavailable`、`autoAllowBashIfSandboxed` 外，还接线 `excludedCommands`、`allowUnsandboxedCommands`、`filesystem`（allowWrite/denyWrite/denyRead）、`network`（allowedDomains/deniedDomains）、`enableWeakerNestedSandbox`、`enableWeakerNetworkIsolation` 和 `ripgrep`（command/args）。分类为 readback：option wiring 已证明，OS 级 sandbox 强制执行无法从插件层独立验证
- 只在 `title` 非空且非 resume 时写入 `title` 到 SDK options；SDK 文档说明 title 仅在首次 query 生效，resume 时无效果。分类为 readback：option wiring 已证明，CLI subprocess 是否接受该 title 不从插件层独立验证
- 只在 `planModeInstructions` 非空且 trimmed 后非空时写入 `planModeInstructions` 到 SDK options；builder 本身不检查 `permissionMode`，因此非 plan 模式的 readback 也可能看到该字段存在。按 SDK 预期，仅当 `permissionMode` 为 `plan` 时消费这些指令，替换默认计划模式工作流内容；SDK 仍强制附加只读前言与 ExitPlanMode 协议尾部。分类为 readback：option wiring 已证明，实际计划模式行为无法从插件层独立验证
- 只在 `toolAliases` 非空时写入 `toolAliases` 到 SDK options；使用 `{ ...toolAliases }` 防御性复制，与 `env` 保持一致；将模型发出的工具名映射到规范工具名，在解析前生效。分类为 readback：option wiring 已证明，实际别名解析行为无法从插件层独立验证
- 只在 `settings.debug === true` 时写入 `debug` 到 SDK options；分类为 readback：option wiring 已证明，实际 CLI debug log 输出无法从插件层独立验证
- 只在 `settings.strictMcpConfig === true` 时写入 `strictMcpConfig` 到 SDK options；SDK 将其作为 `--strict-mcp-config` CLI 标志传递给子进程。分类为 readback（2026-06-06 审计硬化）：option wiring 已证明，但 actual MCP 配置验证行为位于编译后的 CLI binary，没有结构化信号确认严格验证是否已应用，且插件侧 MCP adapter 静默丢弃结构性 malformed 条目。仅在下一次查询或重启会话时生效
- 只在 `settings.debugFile` 非空且 trimmed 后非空时写入 `debugFile` 到 SDK options；使用 `trimOptionalString()` 与 `executablePath`/`model` 等字段保持一致。分类为 readback：option wiring 已证明，实际文件写入无法从插件层独立验证。设置调试文件路径会隐式启用调试日志，即使 `debug` toggle 为关闭状态。2026-06-03 曾修复过“文档先于 builder wiring” 的 truth drift，因此不要回退这条显式映射。仅在下一次查询或重启会话时生效
- 只在 `settings.enableContext1mBeta === true` 时写入 `betas: ['context-1m-2025-08-07']` 到 SDK options。分类为 readback（2026-06-06 审计硬化）：完整 SDK 路径已追踪——setting → buildClaudeCodeOptions → SDK Options.betas → ProcessTransport.initialize() → CLI `--betas` 标志（sdk.mjs: `if(J&&J.length>0)i.push("--betas",J.join(","))`）。SDK init 消息含 `betas?: string[]` 但插件未消费。Option wiring 到 CLI 子进程边界已证明；模型侧 beta 接受和 1M 上下文激活无法从插件层独立验证。不暴露通用 beta 管理功能。仅在下一次查询或重启会话时生效。2026-06-04 修复过“文档/matrix 声称已 wiring 但 builder 实际未映射”的 truth drift，因此不要回退这条显式映射
- 只在 `settings.jsRuntime` 非空时写入 `executable` 到 SDK options（值为 `'node' | 'bun' | 'deno'`）；空字符串 `''` 表示 auto，省略该选项让 SDK 自行选择。分类为 readback：option wiring 已证明，实际运行时选择取决于 SDK/CLI 版本、系统 PATH 和运行时安装情况，无法从插件层独立验证。不暴露运行时参数管理功能（`executableArgs`、`extraArgs` 明确未实现）。仅在下一次查询或重启会话时生效
- 只在 `settings.loadTimeoutMs` 为非 null 正整数时写入 `loadTimeoutMs` 到 SDK options。分类为 readback：option wiring 已证明，实际超时行为取决于 SDK/CLI 版本和运行时条件，无法从插件层独立验证。空值、非数字、零和负值均归一化为 `null` 并省略该选项。仅在下一次查询或重启会话时生效
- 只在 input 提供 `stderr` 回调时写入 `stderr` 到 SDK options；该回调接收 Claude Code subprocess 的原始 stderr 文本。分类为 readback：callback wiring 已证明，实际 stderr 发射取决于 SDK/CLI/runtime，可能不存在。所有 stderr 文本在展示前经过 `sanitizeDiagnosticReport` 消毒并截断至 240 字符。这不是稳定的原始日志产品面，仅供诊断探针使用
- 只在 input 提供非空 trimmed `sessionId` 时写入 `sessionId` 到 SDK options。分类为 pass（2026-06-02 live runtime proof：BUILD_ID `feature-phase0-capability.202606022121` 验证通过，requested `54d314f4-7624-4ed0-96fe-424cfaa82e86`，SDK 返回完全相同 id）。这不是稳定的产品面；普通 chat 路径永远不会注入自定义 session id，session identity 始终由 adapter 拥有。仅供 Capability Lab 诊断探针使用
- 只在 input 提供 `continue: true` 时写入 `continue` 到 SDK options。分类为 pass：两阶段诊断探针验证 SDK continue 语义（seed + continue，相同 session id + nonce recall）。这不是稳定的产品面；普通 chat 路径永远不会使用 continue
- 只在 input 提供非空 trimmed `resumeSessionAt` 时写入 `resumeSessionAt` 到 SDK options。分类为 pass：三阶段诊断探针验证 SDK resumeSessionAt 语义（alpha + beta + resume-at，相同 session id + alpha nonce recall）。这不是稳定的产品面；普通 chat 路径永远不会使用 resumeSessionAt
- 只在 input 提供 `forkSession: true` 时写入 `forkSession` 到 SDK options。分类为 pass：两阶段诊断探针验证 SDK forkSession 选项语义（seed + fork-on-resume，不同 session id + nonce recall）。这是 SDK 公共选项 `forkSession?: boolean`，与 provider-owned `adapter.forkSession()` 能力完全独立。这不是稳定的产品面；普通 chat 路径永远不会使用 forkSession
- 只在 `settings.askUserQuestionPreviewFormat` 为 `'markdown' | 'html'` 时写入 `toolConfig: { askUserQuestion: { previewFormat } }` 到 SDK options。**分类为 pass**（2026-06-07 live Obsidian proof，Outcome A — promoted from readback）：settings→SDK option wiring 已证明；真实 AskUserQuestion 工具输入到达时携带 `.preview` 字段，内容格式与设置一致（markdown 文本或 HTML 片段）；UI question（inline card 与 dock）在选项聚焦或悬停时以纯文本安全渲染 preview（HTML 不解析）；格式选择确实影响预览内容（markdown→Markdown 文本，html→HTML 片段）。HTML 预览以纯文本显示，不渲染富 HTML；预览仅在选项获得焦点或悬停时显示，不常驻在所有选项下方。默认空字符串 `''` 表示不请求预览（SDK 默认）。UI 位于 Tools 标签页下拉选择框，仅在下一次查询或重启会话时生效。这是 Claude-only 设置
- 只在 `settings.systemPrompt` 非空且 trimmed 后非空时，将 `systemPrompt` 写入 SDK options 的 preset-with-append 形状 `{ type: 'preset', preset: 'claude_code', append: instructions }`；空字符串时保留默认 `{ type: 'preset', preset: 'claude_code' }`。分类为 pass，但依据是两层互补证据：`runSystemPromptReadbackProbe()` 证明当前保存值已接入这条 preset-with-append 路径，`runSystemPromptLiveProbe()` 则通过 `_diagnosticSystemPrompt` 走同一路径注入 nonce-bearing diagnostic append，验证这条路径会影响一次新的诊断查询响应。这是 append-only seam，不会替换官方 preset；active session 不会被 live mutate。UI 位于 Model & Thinking 标签页，为文本区域输入，仅在下一次查询或重启会话时生效
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

- `promptSuggestions?: boolean` 已加入 Input 和 SDK Shape，wiring 逻辑与 `agentProgressSummaries` 一致（input 或 settings 任一为 true 即传入）。
- `continue?: boolean` 已加入 Input 和 SDK Shape，wiring 逻辑为：只在 `input.continue === true` 时传入 SDK options。分类为 pass（2026-06-02 live runtime proof：BUILD_ID `feature-phase0-capability.202606022255` 上，两阶段诊断探针确认 SDK 能继续同一 session、session id 精确匹配 `2a3b1082-64ba-4862-96a5-a14a2e01cc49`，并成功回忆前一轮 nonce）。这不是稳定的产品面；普通 chat 路径永远不会使用 continue，session 连续性始终由 adapter 拥有。仅供 Capability Lab 诊断探针使用。与 `resumeSessionId` 和显式 `sessionId` 都不兼容——adapter 会在诊断边界 guard 这两种组合。
- `resumeSessionAt?: string` 已加入 Input 和 SDK Shape，wiring 逻辑为：只在 `input.resumeSessionAt` 非空且 trimmed 后非空时传入 SDK options。分类为 pass（2026-06-03 live runtime proof：BUILD_ID `feature-phase0-capability.202606030008` 上，三阶段诊断探针确认 SDK 在 session `06e82771-6dba-43d1-8191-4d8d8439a3f4` 中按 alpha assistant message UUID `8a2e95c7-9625-4f5d-a875-12702430f85b` 恢复，并成功回忆 ALPHA 而非 BETA）。这不是稳定的产品面；普通 chat 路径永远不会使用 resumeSessionAt，session 连续性始终由 adapter 拥有。仅供 Capability Lab 诊断探针使用。与 `continue` 和显式 `sessionId` 都不兼容，且必须配合 `resumeSessionId` 使用——adapter 会在诊断边界 guard 这些组合。

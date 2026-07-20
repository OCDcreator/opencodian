# Settings Types and Defaults

> **源码**: `src/core/types/settings.ts`
> **状态**: [REVIEW]

## 概述

OpenCodian 的中央设置模式定义，包含 `OpenCodianSettings`、`DEFAULT_SETTINGS`，以及一组负责清洗历史配置和运行时输入的 `normalize*()` 辅助函数。它是设置 UI 与启动 bootstrap 的数据底座；具体的启动期 snapshot merge / migration orchestration 已收束到 `src/core/types/settingsLoadNormalization.ts`。

源码约 1396 行，是项目最大的类型定义文件。

## 导入关系

上游: 无外部依赖（纯类型 + 工具函数）
下游:
- 几乎所有模块（通过 `src/core/types/index.ts` 重导出）
- `src/main.ts`（加载/保存设置、主题迁移）
- `src/features/settings/OpenCodianSettings.ts`（设置 UI）
- `src/core/theme/index.ts`（主题解析）
- `src/features/chat/OpenCodianView.ts`（读取运行时设置）

## 核心类型 / 接口

### 顶层设置

| 类型 | 说明 |
|------|------|
| `OpenCodianSettings` | 完整设置接口（约 40 个字段） |
| `DEFAULT_SETTINGS` | 默认设置常量对象 |

`OpenCodianSettings` 现在包含 backend 管理字段：`activeBackend` 表示新会话默认 backend，`enabledBackends` 表示设置页当前启用的 backend 集合。Phase 0 默认值固定为 `opencode` / `['opencode']`，非 OpenCode backend 只作为 UI 可见性和后续迁移占位。

`backendSettings.claudeCode` 是 Claude Code 专属设置对象。它包含 executable path、显式 `settingSources`、Claude permission mode、thinking、effort、additional directories、model/fallback model、`allowedTools`/`disallowedTools`（工具策略）、`maxTurns`/`maxBudgetUsd`/`taskBudget`（限制项）、`env`（环境变量），以及 `enableFileCheckpointing`、`includeHookEvents`、`forwardSubagentText`、`agentProgressSummaries` 四个 SDK 诊断/后续能力开关。`fallbackModel` 为 readback only（选项接线和 same-model validation 已证明；自动 fallback 切换无法本地验证——阻塞于真实 API 过载 / HTTP 529 路径；invalid-primary 测试已失效），四个 SDK 诊断开关分别标记 `@experimental` / `@diagnostic`。`allowedTools` 为 readback only（auto-allow 快捷方式，非限制器，runtime options wiring 已证明，零 enforcement）；`disallowedTools` runtime behavior verified（init-catalog 确定性排除已验证）；`maxTurns` / `maxBudgetUsd` runtime behavior verified（`error_max_turns` + `error_max_budget_usd` 信号已观测）；`env` runtime behavior verified（env 传播到 Claude/Bash 子进程已证明，Layer 1-4）。`allowedTools`/`disallowedTools` 在 UI 层通过 `parseToolList()` 校验为 PascalCase 字母数字（`[A-Za-z][A-Za-z0-9]*`），非法名称被静默丢弃。`maxTurns`/`maxBudgetUsd` 在 UI 层通过 `parseNullablePositiveInteger()` / `parseNullablePositiveNumber()` 校验：前者只接受正整数（`/^\d+$/`），后者接受正数（`/^\d+(?:\.\d+)?$/`）；负数、零、非数字和空字符串均被静默丢弃为 `null`。`maxTurns`/`maxBudgetUsd` 与 `env` 已通过 Stable Settings Readback Proof 验证运行时回读（runtime readback verified），即 SDK options 从设置正确构建；`maxTurns`/`maxBudgetUsd` 的行为验证（SDK 实际执行 turn/budget 限制）已通过 2026-05-29 live runtime proof 确认（`error_max_turns` + `error_max_budget_usd` 信号），环境变量的行为验证（env 传播到子进程）已通过 2026-05-28 runtime proof 确认。`taskBudget` 为 readback only（2026-06-06 审计硬化）：SDK `@alpha` option wiring 已证明（`taskBudget: { total: number }` 正确传入 SDK options，以 `--task-budget` CLI 标志传递给子进程）。CLI binary 将其作为 `output_config.task_budget` 连同 beta header `task-budgets-2026-03-13` 发送给 API，模型用作行为 pacing（非硬性截止）。与 `maxTurns`（产生 `error_max_turns`）不同，没有结构化 enforcement 信号，无法独立验证。`debugChannels` 持久化产品级 Claude Code debug workbench 的通道开关：`runtime`、`sessions`、`stream`、`permissions`、`mcp` 默认启用，`experimental` 默认关闭；当前只是数据模型/default/normalizer，不做 UI 或 logger routing。`ClaudeCodeEffort` 跟随官方 CLI/SDK effort 值：`low` / `medium` / `high` / `xhigh` / `max`。默认 `settingSources` 是 `['project']`，但保存的空数组表示显式 none，不能被归一化回默认值。能力开关只证明 options wiring 和 diagnostic stream 接线，不代表 stable rewind、hook authoring、JSONL browser 或 subagent transcript UI 已完成。`enableFileCheckpointing` 注释已更新：`@experimental — SDK option wired but checkpoints never created in query() mode (upstream bug #236). Readback only; no stable rewind UI.`

`sandbox` 持久化 Claude Code sandbox 行为控制（`ClaudeCodeSandboxSettings`）：除 `enabled`、`failIfUnavailable`、`autoAllowBashIfSandboxed` 外，现包含 `excludedCommands`、`allowUnsandboxedCommands`、`filesystem`（allowWrite/denyWrite/denyRead）、`network`（allowedDomains/deniedDomains）、`enableWeakerNestedSandbox`、`enableWeakerNetworkIsolation` 和 `ripgrep`（command/args）。分类为 readback：SDK options wiring 已证明（设置通过 buildClaudeCodeOptions 传入 SDK `sandbox` 选项），OS 级进程隔离（bubblewrap/seccomp）由 CLI binary 内部实现，无法从插件层独立验证。UI 位于 Permissions 标签页。

`planModeInstructions` 为 readback only：当 `permissionMode` 为 `plan` 时，自定义指令通过 `buildClaudeCodeOptions` 传入 SDK `planModeInstructions` 选项，替换默认计划模式工作流内容；SDK 仍强制附加只读前言与 ExitPlanMode 协议尾部。实际计划模式行为无法从插件层独立验证。UI 位于 Permissions 标签页，为文本区域输入，仅在下一次查询或重启会话后生效。

`toolAliases` 为 readback only（2026-06-06 审计硬化）：通过 `buildClaudeCodeOptions` 传入 SDK `toolAliases` 选项，将模型发出的工具名映射到规范工具名，在解析前生效。**SDK 源码审计（browser-sdk.js）确认 toolAliases 是单向初始化参数**：`initialize()` 方法将其作为 `toolAliases: this.initConfig?.toolAliases` 转发给 CLI 子进程，无反馈事件或状态确认。别名解析发生在 CLI binary 的内部工具执行路径中，流式 `tool_use` 块仅暴露解析后的名称，无别名元数据。插件无法区分别名调用与直接规范调用，因此别名解析行为无法从插件层独立验证。默认空对象 `{}`。UI 位于 Tools 标签页，为高级文本区域输入，格式为每行 `key=value`（如 `Fetch=Read`），仅在下一次查询或重启会话后生效。

`debug` 为 readback only：通过 `buildClaudeCodeOptions` 传入 SDK `debug` 选项，要求 CLI 在查询执行期间发出调试日志。实际调试日志输出是 SDK/CLI binary 的内部行为，无法从插件层独立验证。默认 `false`。UI 位于 Runtime 标签页，为 toggle 开关，仅在下一次查询时生效。

`strictMcpConfig` 为 readback only（2026-06-06 审计硬化）：SDK 将其作为 `--strict-mcp-config` CLI 标志传递给子进程；实际验证位于编译后的 CLI binary 中。没有结构化信号确认严格验证是否已应用。插件侧 MCP adapter（ClaudeCodeMcpConfigAdapter.ts）会静默丢弃结构性 malformed 条目（返回 null），因此许多 malformed 配置从未到达 CLI。默认 `false`。UI 位于 Tools 标签页，为 toggle 开关，仅在下一次查询或重启会话时生效。此处不写入 `.claude/mcp.json`，也不提供 MCP 编写界面。

`debugFile` 为 readback only：通过 `buildClaudeCodeOptions` 传入 SDK `debugFile` 选项，要求 SDK 将 CLI 调试日志写入指定文件路径。实际文件写入是 SDK/CLI binary 的内部行为，无法从插件层独立验证。设置调试文件路径会隐式启用调试日志，即使 `debug` toggle 为关闭状态。默认空字符串 `''`。UI 位于 Runtime 标签页，为文本输入，仅在下一次查询或重启会话时生效。插件层不执行路径校验，也不执行文件系统写入。

`enableContext1mBeta` 为 readback only（2026-06-06 审计硬化）：通过 `buildClaudeCodeOptions` 传入 SDK `betas` 选项（值为 `['context-1m-2025-08-07']`），请求 1M 上下文窗口 beta header。完整 SDK 路径：setting → buildClaudeCodeOptions → SDK Options.betas → ProcessTransport.initialize() → CLI `--betas` 标志（sdk.mjs: `if(J&&J.length>0)i.push("--betas",J.join(","))`）。Option wiring 到 CLI 子进程边界已证明。SDK init 消息（`type:'system', subtype:'init'`）含 `betas?: string[]` 但插件未消费。实际 beta 可用性是 SDK/模型/Anthropic 侧的内部行为，无法从插件层独立验证。并非所有模型都支持此 beta。默认 `false`。UI 位于 Model & Thinking 标签页，为 toggle 开关，仅在下一次查询或重启会话时生效。不暴露通用 beta 管理功能。

`outputStyle` 通过 `buildClaudeCodeOptions` 传入 SDK `settings.outputStyle` 选项（值为 `string`），请求 Claude Code 以指定输出样式修改系统提示词。官方内置样式包括 `Default`、`Proactive`、`Explanatory`、`Learning`；用户也可以在 `.claude/output-styles` 或 `~/.claude/output-styles` 中创建自定义样式 markdown 文件。分类为 pass（2026-06-07 live behavior proof）：`runOutputStyleLiveProbe()` 创建临时 custom style file，经 SDK `settings.outputStyle` 选择后，模型回忆出未出现在用户 prompt 中的 nonce，证明 custom output style file 能影响 fresh diagnostic query。诚实边界：不证明 active-session live mutation，也不证明当前已保存的 style name 一定存在或有效。根据 SDK 文档，output style 是系统提示词的一部分，会在会话启动时读取；修改会在 `/clear` 或新的 Claude Code 会话后生效，已有活动或恢复会话可能继续使用原先的系统提示词。默认空字符串 `''`。UI 位于 Model & Thinking 标签页，为文本输入。

`askUserQuestionPreviewFormat` 为 **pass**（2026-06-07 live Obsidian proof，Outcome A — promoted from readback）：通过 `buildClaudeCodeOptions` 传入 SDK `toolConfig.askUserQuestion.previewFormat` 选项（值为 `'markdown' | 'html'`），请求 SDK 为每个 `AskUserQuestion` 选项包含预览文本。空字符串 `''` 表示不请求预览（SDK 默认）。**Live runtime proof (BUILD_ID feature-phase0-capability.202606070354)**：`previewFormat='markdown'` 时真实 AskUserQuestion 工具输入到达时所有选项携带 `.preview` 字段（完整 Markdown 内容）；`previewFormat='html'` 时到达 HTML 片段（`<div>`, `<h3>`, `<ul>/<li>`, inline CSS）。格式选择确实影响预览内容。插件 question UI（inline card 与 dock）会保留并安全显示 SDK 提供的预览文本：以纯文本形式渲染，HTML 不会被当作富 HTML 解析，避免 XSS 风险；预览仅在选项获得焦点或悬停时显示，不常驻在所有选项下方。UI 不依赖 inbound `AskUserQuestion` 输入回显 `previewFormat`，而是对 preview 文本做格式无关的纯文本展示。SDK 通过 `CLAUDE_CODE_QUESTION_PREVIEW_FORMAT` 环境变量将 `previewFormat` 传递给 CLI 子进程，修改模型看到的工具 schema 描述。Caveat：预览是否包含取决于模型——模型不一定会为每个问题都包含预览，但管道和格式差异已验证。默认 `''`（auto）。UI 位于 Tools 标签页，为下拉选择框（None / Markdown / HTML），仅在下一次查询或重启会话时生效。这是 Claude-only 设置，不暴露为 backend-agnostic 能力。

`jsRuntime` 为 readback only（2026-06-06 审计硬化）：通过 `buildClaudeCodeOptions` 传入 SDK `executable` 选项（值为 `'node' | 'bun' | 'deno'`），请求 SDK 使用指定的 JavaScript 运行时。空字符串 `''` 表示 auto（由 SDK 自行选择）。已验证内容：`settings.jsRuntime` → `normalizeClaudeCodeJsRuntime` → `buildClaudeCodeOptions` → SDK `Options.executable` 这一整条 settings→SDK 映射链；空/`node`/`bun`/`deno` 四种值的 normalization 和 readback probe 均已覆盖。未验证内容：插件层没有任何可观察信号确认 CLI 子进程实际使用了哪个运行时；init 消息没有 runtime metadata 字段，stderr 和工具输出也不会回显运行时选择。模型运行在远端，无法检查本地子进程的 `process.execPath`；Bash tool 生成的是新的 shell 进程，不是 CLI 进程本身；主机 PATH 检查只能证明安装，不能证明实际选择。`executablePath` / ProcessResolver 是独立能力，负责 Claude Code 二进制解析，而不是 JS runtime engine 选择。默认 `''`（auto）。UI 位于 Runtime 标签页，为下拉选择框，仅在下一次查询或重启会话时生效。不暴露运行时参数管理功能（`executableArgs`、`extraArgs` 明确未实现）。

`loadTimeoutMs` 为 readback only（2026-06-06 审计硬化）：通过 `buildClaudeCodeOptions` 传入 SDK `loadTimeoutMs` 选项（值为正整数），设置 sessionStore resume/continue 材料化期间 `sessionStore.listSessions()` 的超时时间（毫秒）。`null` 表示使用 SDK 默认超时（60000ms）。SDK 仅在 `(options.resume || options.continue) && options.sessionStore` 为真时使用此值（sdk.mjs `yj$` 函数），超时包装器为 `C4`（Promise.race + setTimeout，offset 154014）。没有 resume/continue + sessionStore 时超时代码路径永不执行。从插件层无法独立验证，因为诊断路径不使用 resume/continue 或 sessionStore。默认 `null`。@alpha。UI 位于 Runtime 标签页，为数字文本输入，仅在下一次查询或重启会话时生效。空输入、非数字、零和负值均归一化为 `null`。

`systemPrompt` 为 pass：通过两层互补证据成立。第一层是 readback proof：`runSystemPromptReadbackProbe()` 验证当前已保存的 `settings.systemPrompt` 会经由 `buildClaudeCodeOptions` 进入 SDK `systemPrompt` 选项；当非空时，使用 preset-with-append 形状 `{ type: 'preset', preset: 'claude_code', append: instructions }`；当为空时，使用默认 `{ type: 'preset', preset: 'claude_code' }`。第二层是 live behavior proof：`runSystemPromptLiveProbe()` 通过 `_diagnosticSystemPrompt` 走同一条 preset-with-append SDK 路径，注入 nonce-bearing diagnostic append，验证该路径确实会影响一次新的诊断查询响应。这是 append-only seam，不会替换官方预设；active session 不会被 live mutate。默认空字符串 `''`。UI 位于 Model & Thinking 标签页，为文本区域输入，仅在下一次查询或重启会话时生效。输入会被 trim，空白输入归一化为空字符串。

`autoTitle` 控制新 Claude Code 会话是否让 SDK 自动生成对话摘要标题。默认 `true`：会话标题为空字符串，首次查询不传 `title`，允许 Claude SDK 自行生成摘要。当 `false` 时，插件在 `createSession` 中存储固定标题 `"New Claude Code chat"`，并在首次查询时通过 `buildClaudeCodeOptions` 传入 SDK `title` 选项，这会跳过 Claude 的自动标题生成。此设置只影响新会话；已有会话不受影响。UI 位于 Conversation 设置的"会话标题"分组，为 toggle 开关。

### 服务器与安全

| 类型 | 说明 |
|------|------|
| `ServerMode` | `'local' \| 'remote'` |
| `ServerAuthType` | `'none' \| 'basic' \| 'bearer'` |
| `ServerConfig` | 服务器配置（`mode`, `local`, `remote`, `auth`） |
| `LocalServerConfig` | 本地服务器（`host`, `port`, `autoStart`, `executablePath`） |
| `RemoteServerConfig` | 远程服务器（`baseUrl`） |
| `ServerAuthConfig` | 认证配置（`type`, `username`, `password`, `token`） |
| `PermissionMode` | `'yolo' \| 'plan' \| 'normal'` |
| `PlatformBlockedCommands` | 平台分组黑名单（`unix`, `windows`） |
| `ApprovalDecision` | `'allow' \| 'allow-always' \| 'deny' \| 'cancel'` |

### 模型与对话

| 类型 | 说明 |
|------|------|
| `ModelSourceMode` | `'merge' \| 'local' \| 'server'` |
| `ModelProviderConfig` | 提供商配置（`id`, `name`, `apiKey?`, `baseUrl?`, `enabled`） |
| `TitleMode` | `'default' \| 'ai'` |
| `EffortLevel` | `'minimal' \| 'low' \| 'medium' \| 'high' \| 'xhigh'` |
| `ThinkingBudget` | `0 \| 1024 \| 4096 \| 8192 \| 16384` |
| `QuestionDisplayMode` | `'all' \| 'single'` |
| `QuestionCardPosition` | `'inline' \| 'above_input'` |
| `PluginIsolationMode` | `'default' \| 'pure'` |

### UI 与主题

| 类型 | 说明 |
|------|------|
| `TabBarPosition` | `'input' \| 'header' \| 'below-header'` |
| `BelowHeaderTabBarLayout` | `'grid' \| 'vertical'` |
| `ChatScrollMode` | `'natural' \| 'sticky-basic' \| 'sticky-mask'` |
| `InputPanelThemeId` | 输入面板主题 ID（`preset`, `glass-refraction-*`, `liquid-glass-*`） |
| `LiquidGlassAdapterId` | `'shuding' \| 'nikdelvin' \| 'shudingDiamond'` |
| `InputPanelActionButtonStyleId` | `'default' \| 'etched'` |
| `ChatAppearanceSettings` | 完整外观设置（8 个子对象） |
| `PartialChatAppearanceSettings` | 外观设置的部分覆盖类型 |
| `ThemeSettings` | `{ activePresetId, customAppearanceOverrides }` |
| `ThemePresetId` | 12 个预设 ID 的联合类型 |
| `ThemePresetDefinition` | 预设完整定义 |
| `ThemeStyleId` | `'glass' \| 'flat' \| 'soft' \| 'sharp'` |

### 外观子设置

| 类型 | 说明 |
|------|------|
| `ChatAppearanceLayoutSettings` | 布局（`messagesPaddingTop`, `messagesPaddingX`） |
| `ChatAppearanceStickySettings` | 吸顶区（`headerGap`, `maskHeight`, `maskBlur`） |
| `ChatAppearanceBackgroundSettings` | 背景图（`imagePath`, `fitMode`, `opacity`, `blur`, `depth`, `dim`, `edgeFade`, `saturation`, `brightness`, `focusX`, `focusY`） |
| `ChatAppearanceUserSettings` | 用户消息气泡，现含时间样式（`timeFontSize`, `timeFontWeight`, `timeColor`） |
| `ChatAppearanceAssistantSettings` | 助手消息气泡，现含 meta/time/modelId 样式（字号、字重、颜色） |
| `ChatAppearanceInputSettings` | 输入面板（`radius`, `backgroundOpacity`, `blur`, `shadowBlur`, `actionButtonStyle`, `contextRingStyle`, `enFontFamily`, `cnFontFamily`） |
| `ChatAppearanceScrollbarSettings` | 滚动条（`width`, `radius`, `trackOpacity`, `thumbOpacity`, `thumbHoverOpacity`, `edgePadding`, `shadowOpacity`） |
| `ChatAppearanceAdvancedSettings` | 高级（`customCssDeclarations`） |

`getDefaultChatAppearanceSettings().input.enFontFamily` 当前默认为 `newsreader`，让新装输入文本层使用 bundled Newsreader serif 字体；`cnFontFamily` 默认为空，继续由系统/Obsidian CJK fallback 接管。`normalizeFontFamilyValue()` 只做字符串清洗和长度限制，不强制 unknown id 回退，因此用户仍可在外观设置中选择 inherit、注册字体或自定义 font-family。

### 玻璃效果

| 类型 | 说明 |
|------|------|
| `InputPanelGlassRefractionVariantId` | `'glass' \| 'card' \| 'pill'` |
| `InputPanelGlassRefractionVariantSettings` | 单变体（`backgroundOpacity`, `blur`, `saturation`, `brightness`） |
| `InputPanelGlassRefractionSettings` | 玻璃折射效果（`glass`/`card`/`pill` 三种变体） |
| `InputPanelGlassRefractionSvgFilterPresetId` | `'none' \| 'subtle' \| 'strong'` |
| `InputPanelGlassRefractionSvgFilterSettings` | SVG 滤镜预设（`preset`, `subtleScale`, `strongScale`） |
| `InputPanelLiquidGlassSettings` | 液态玻璃效果（`shuding`/`nikdelvin`/`shudingDiamond` 三套参数） |

### 标签页持久化

| 类型 | 说明 |
|------|------|
| `PersistedTabState` | `{ tabs: PersistedTabEntry[], activeTabIndex }` |
| `PersistedTabEntry` | `{ id?, parentTabId?, conversationId, title, modelOverride }` |
| `PersistedTabModelOverride` | `{ provider, model }` |
| `capabilityLabSelectedBackend` | Capability Lab 独立 UI preference：非空 descriptor id 字符串或 `undefined`。它不改变 `activeBackend` 或运行时 backend；当前 descriptor 集负责判断持久化 id 是否可选，使未来 backend 只需新增 descriptor 与 renderer 即可保留选择。 |

### Provider 图标

| 类型 | 说明 |
|------|------|
| `ProviderIconEntryType` | `'mapped' \| 'builtin' \| 'url' \| 'file'` |
| `LobehubIconVariant` | `'auto' \| 'mono' \| 'color' \| 'brand' \| 'brand-color' \| 'text' \| 'text-cn' \| 'text-color' \| 'combine' \| 'avatar'` |
| `StaticLobehubIconVariant` | 去掉 `auto/combine` 后可直接映射静态资源的 variant |
| `ProviderIconResolvedFormat` | `'svg' \| 'png' \| 'webp' \| 'avatar'` |
| `ProviderIconEntry` | 图标条目（`id`, `type`, `source`, `variant?`, `resolvedVariant?`, `resolvedFormat?`, `mimeType?`, `cacheFileName?`, `addedAt`, `updatedAt?`） |
| `ProviderIconLibrary` | `Record<string, ProviderIconEntry[]>` |

## 关键方法

### 归一化函数

### 本地 OpenCode 可执行文件路径

`LocalServerConfig.executablePath` 是可选的本地 sidecar 启动覆盖项，默认空字符串。留空时 `LocalSidecarLauncher` 会继续使用平台内置候选路径和 `PATH`；填写后，该路径会优先于 macOS / Windows 默认候选。

| 方法 | 说明 |
|------|------|
| `normalizeEffortLevel(value)` | 归一化努力级别，`'max'` → `'xhigh'`，默认 `'high'` |
| `normalizeThinkingBudget(value)` | 归一化思考预算，支持字符串/数字输入 |
| `normalizeBackendSettings(value)` | 归一化 backend 专属设置对象，包含 Claude Code 和 Codex 后端设置 |
| `normalizeCodexBackendSettings(value)` | 归一化 Codex 后端设置（`apiKey` 字段） |
| `normalizeClaudeCodeBackendSettings(value)` | 归一化 Claude Code executable、setting sources、permission/thinking/effort、additional directories、model、allowedTools/disallowedTools、maxTurns/maxBudgetUsd、env、file checkpoint、hook event、subagent transcript/progress 和 debug channel 开关字段 |
| `normalizeClaudeCodeDebugChannelSettings(value)` | 归一化 Claude Code debug workbench channel record，未知 channel 丢弃，缺失 channel 回退默认值 |
| `normalizeClaudeCodeStringArray(value)` | 归一化字符串数组，trim 后去重、过滤空字符串和非字符串条目；用于 allowed/disallowed tools 时避免把带空白的工具名传入 SDK |
| `normalizeClaudeCodeNullablePositiveInt(value)` | 归一化可为空的正整数（如 maxTurns、taskBudget），返回 `number | null` |
| `normalizeClaudeCodeNullablePositiveNumber(value)` | 归一化可为空的正数（如 maxBudgetUsd），保留小数 |
| `normalizeClaudeCodeEnv(value)` | 归一化环境变量对象，过滤非字符串值 |
| `normalizeTabsEnabled(value)` | 归一化会话标签启用状态；只有明确 `false` 才禁用，未知值默认启用 |
| `normalizeCapabilityLabSelectedBackend(value)` | trim 后只接受 Claude Code、OpenCode、Codex 三个 backend id；未知或陈旧值回退 `undefined` |
| `normalizeTabBarPosition(value)` | 归一化标签栏位置 |
| `normalizeBelowHeaderTabBarLayout(value)` | 归一化下方标签布局 |
| `normalizeTitleMode(value)` | 归一化标题模式 |
| `normalizeQuestionDisplayMode(value)` | 归一化问题显示模式 |
| `normalizeQuestionCardPosition(value)` | 归一化问题卡片位置 |
| `normalizeInputPanelThemeId(value)` | 归一化输入面板主题（含废弃 ID 迁移） |
| `normalizeInputPanelActionButtonStyleId(value)` | 归一化按钮样式 |
| `normalizeContextRingStyleId(value)` | 归一化上下文圆环样式 |
| `normalizeFontFamilyValue(value)` | 归一化输入区英文字体 / 中文字体选择，未知或空值回退默认字体 |
| `normalizeChatAppearanceBackgroundFitMode(value)` | 归一化背景填充模式 |
| `normalizePluginIsolationMode(value)` | 归一化插件隔离模式 |
| `normalizeDisabledModelRefs(value)` | 清洗 `provider/model` 列表，去重并剔除非法引用 |
| `normalizeChatAppearanceSettings(appearance?)` | 归一化完整外观设置 |
| `normalizePartialChatAppearanceSettings(appearance?)` | 归一化部分外观覆盖 |
| `normalizeThemeSettings(value?)` | 归一化主题设置 |
| `normalizePersistedTabState(state?)` | 归一化标签页持久化状态 |
| `normalizeLobehubIconVariant(value)` | 归一化 LobeHub icon variant，未知值回退到 `auto` |
| `normalizeProviderIconLibrary(value)` | 归一化图标库 |
| `normalizeProviderIconResolvedFormat(value)` | 归一化 provider 图标命中格式 |
| `normalizeInputPanelGlassRefractionSettings(value?)` | 归一化玻璃折射设置 |
| `normalizeInputPanelGlassRefractionSvgFilterSettings(value?)` | 归一化 SVG 滤镜设置 |
| `normalizeInputPanelLiquidGlassSettings(value?)` | 归一化液态玻璃设置 |

### 默认值函数

| 方法 | 说明 |
|------|------|
| `getDefaultChatAppearanceSettings()` | 默认外观设置 |
| `getDefaultThemeSettings()` | 默认主题设置（`glass-classic`） |
| `getDefaultClaudeCodeDebugChannelSettings()` | 默认 Claude Code debug channel 开关，runtime/sessions/stream/permissions/mcp 开启，experimental 关闭 |
| `getDefaultInputPanelGlassRefractionSettings()` | 默认玻璃折射参数 |
| `getDefaultInputPanelGlassRefractionSvgFilterSettings()` | 默认 SVG 滤镜参数 |
| `getDefaultInputPanelLiquidGlassSettings()` | 默认液态玻璃参数 |
| `getDefaultBlockedCommands()` | 默认黑名单命令 |
| `getDefaultDebugModuleSettings()` | 默认模块级调试开关 |
| `getDefaultDebugLogPaths()` | 默认调试日志路径 |
| `getDefaultPersistedTabState()` | 默认标签页状态 |

### 工具函数

| 方法 | 说明 |
|------|------|
| `getServerBaseUrl(server)` | 根据模式构建服务器 URL |
| `isLocalServerMode(server)` | 判断是否为本地服务器模式 |
| `isThemePresetId(value)` | 类型守卫：是否为有效预设 ID |
| `isValidChatAppearanceCustomCssDeclarations(value)` | 验证自定义 CSS 声明安全性 |
| `getCurrentPlatformKey()` | 返回当前平台 key（`'unix' \| 'windows'`） |
| `getCurrentPlatformBlockedCommands(commands)` | 获取当前平台黑名单 |
| `getBashToolBlockedCommands(commands)` | 获取 Bash 工具黑名单（Windows 合并两套） |
| `getEnabledClaudeCodeDebugChannels(settings)` | 按稳定 channel 顺序返回已启用的 Claude Code debug channel ids |
| `normalizeBaseUrl(value)` | 去除 URL 尾部斜杠 |

## 最近值得注意的变化

### 模型禁用引用

`OpenCodianSettings` 现在新增了：

- `disabledModelRefs: string[]`

这个字段存储插件侧的模型级禁用列表，格式固定为 `provider/model`。`normalizeDisabledModelRefs()` 会：

- 只保留字符串项
- `trim()` 清理空白
- 过滤掉没有 provider 或 model 的脏值
- 去重，保证最终列表稳定

这让设置页可以把“provider 级开关”和“model 级禁用”分开表达。

### 项目插件禁用引用

`OpenCodianSettings.disabledPluginSpecs` 存储插件侧项目插件禁用列表，由插件管理设置页用于标记 config plugin 和 directory plugin 的启用状态。

### 聊天气泡元数据样式

`ChatAppearanceSettings` 最近扩展了两类样式字段：

- `user.time*`
- `assistant.meta*` / `assistant.time*` / `assistant.modelId*`

对应的归一化逻辑也新增了：

- `normalizeCssColorValue(...)`
- `normalizeFontWeightValue(...)`

因此这份文件现在不仅定义“有没有这个字段”，还负责把颜色、字号和字重收敛到安全范围。

### 安全设置的心智模型

当前安全相关字段里有一组需要特别注意的“插件侧 helper”语义：

- `permissionMode` 代表 **OpenCodian shorthand template**，用于把 3 套常见权限模板写入 `.opencode/opencode.json`
- `allowExternalAccess` 不会直接放行 `external_directory`；真正的 OpenCode 外部目录权限仍由 `.opencode` 规则决定
- `allowedExportPaths` 也不是运行时 allowlist，而是供 debug/export 与手动编辑规则时复用的路径列表

因此在设置 UI 中，真正的运行时权限真相源仍然是项目级 `.opencode/opencode.json`，而不是这些插件字段本身。

## OpenCodianSettings 字段参考

| 字段 | 类型 | 默认值 | 说明 |
|------|------|--------|------|
| `userName` | `string` | `''` | 用户名称 |
| `server` | `ServerConfig` | 本地模式 | 服务器配置 |
| `enableBlocklist` | `boolean` | `true` | 启用命令黑名单 |
| `allowExternalAccess` | `boolean` | `false` | 插件侧的外部访问偏好记录；不直接改写 OpenCode 运行时权限 |
| `blockedCommands` | `PlatformBlockedCommands` | 预定义 | 平台黑名单 |
| `permissionMode` | `PermissionMode` | `'yolo'` | OpenCodian 的权限模板选择（YOLO / ask-by-default / review） |
| `autoRestartOnPermissionChange` | `boolean` | `false` | 权限变更自动重启 |
| `modelSourceMode` | `ModelSourceMode` | `'merge'` | 模型来源模式 |
| `defaultProvider` | `string` | `'anthropic'` | 默认提供商 |
| `defaultModel` | `string` | `'claude-3-5-sonnet-20241022'` | 默认模型 |
| `titleMode` | `TitleMode` | `'default'` | 标题生成模式：首条消息标题，或优先等待 OpenCode 自动命名并在失败时使用备用模型的智能标题生成 |
| `questionDisplayMode` | `QuestionDisplayMode` | `'all'` | 问题显示模式 |
| `questionCardPosition` | `QuestionCardPosition` | `'inline'` | 问题卡片位置 |
| `showAnsweredQuestionCards` | `boolean` | `true` | 显示已回答问题卡片 |
| `aiTitleModel` | `string` | `''` | 智能标题无法从 OpenCode 获取标题时使用的备用标题模型 |
| `disabledModelRefs` | `string[]` | `[]` | 插件侧禁用的 `provider/model` 列表 |
| `disabledPluginSpecs` | `string[]` | `[]` | 插件侧禁用的项目插件 spec / 文件引用列表 |
| `renderUserMarkupAsCodeBlocks` | `boolean` | `true` | 用户标记渲染为代码块 |
| `pluginIsolationMode` | `PluginIsolationMode` | `'default'` | 插件隔离模式 |
| `providers` | `ModelProviderConfig[]` | Anthropic | 提供商列表 |
| `providerIconLibrary` | `ProviderIconLibrary` | `{}` | 图标库 |
| `providerIconColorMode` | `ProviderIconColorMode` | `'system'` | provider 图标颜色策略 |
| `providerIconDefaultVariant` | `LobehubIconVariant` | `'auto'` | LobeHub provider 图标默认 variant |
| `effortLevel` | `EffortLevel` | `'high'` | 努力级别 |
| `thinkingBudget` | `ThinkingBudget` | `4096` | 思考预算 |
| `excludedTags` | `string[]` | `[]` | 排除标签 |
| `mediaFolder` | `string` | `''` | 媒体文件夹 |
| `systemPrompt` | `string` | `''` | 系统提示词 |
| `allowedExportPaths` | `string[]` | `['~/Desktop', '~/Downloads']` | 保存的外部路径列表，供调试导出与手动规则编辑复用 |
| `enableTabs` | `boolean` | `true` | 是否显示会话标签控件并允许新标签打开子会话；禁用时保留 `tabState` 和会话数据 |
| `maxTabs` | `number` | `3` | 最大标签数 |
| `tabBarPosition` | `TabBarPosition` | `'below-header'` | 标签栏位置 |
| `belowHeaderTabBarLayout` | `BelowHeaderTabBarLayout` | `'grid'` | 下方标签布局 |
| `enableAutoScroll` | `boolean` | `true` | 启用自动滚动 |
| `chatFontSizePx` | `number` | `13` | 聊天正文的默认字体大小 |
| `chatScrollMode` | `ChatScrollMode` | `'sticky-mask'` | 滚动模式 |
| `inputPanelTheme` | `InputPanelThemeId` | `'preset'` | 输入面板主题 |
| `inputPanelGlassRefraction` | `InputPanelGlassRefractionSettings` | 默认 | 玻璃折射设置 |
| `inputPanelGlassRefractionSvgFilter` | `InputPanelGlassRefractionSvgFilterSettings` | 默认 | SVG 滤镜设置 |
| `inputPanelGlassRefractionGlassDefaultsVersion` | `number` | `2` | 玻璃默认值版本 |
| `inputPanelLiquidGlass` | `InputPanelLiquidGlassSettings` | 默认 | 液态玻璃设置 |
| `chatAppearance` | `ChatAppearanceSettings` | 默认 | 聊天外观 |
| `settingsPanelScrollTop` | `number` | `0` | 设置面板滚动位置 |
| `modelAvailabilitySectionOpen` | `boolean` | `true` | 模型“可用范围与目录”分区是否展开 |
| `modelToolsSectionOpen` | `boolean` | `true` | 模型“配置与缓存”分区是否展开 |
| `enableDebugLogging` | `boolean` | `false` | 启用调试日志 |
| `inlineSerializedDebugLogArgs` | `boolean` | `false` | 是否把 debug 的非字符串参数内联序列化到日志文本 |
| `debugModuleSettings` | `DebugModuleSettings` | 默认 | 模块级调试开关 |
| `debugRefreshIntervalMs` | `number` | `3000` | 相同高频日志 payload 的最小重复输出间隔 |
| `debugLogPaths` | `PlatformDebugLogPaths` | 默认 | 调试日志路径 |
| `openInMainTab` | `boolean` | `false` | 在主标签页打开 |
| `tabState` | `PersistedTabState` | 默认 | 标签页状态 |
| `theme` | `ThemeSettings` | 默认 | 主题设置 |
| `locale` | `string` | `'en'` | 界面语言 |
| `hiddenSlashCommands` | `string[]` | `[]` | 隐藏的斜杠命令 |
| `slashCommandSkillMode` | `SlashCommandSkillMode` | `'direct'` | OpenCode skills 的斜杠命令调用模式 |

## 数据流

1. 插件加载 → `loadSettings()` 读取存储 → 各字段经 `normalize*()` 验证
2. 用户修改设置 → UI 调用 `normalize*()` → `saveSettings()` 持久化
3. 运行时读取设置 → 直接触发对应行为（服务器启停、主题切换等）

## 与其他模块的交互

- **几乎全部模块**: 通过重导出的类型和函数使用
- **StorageService**: 序列化/反序列化 `OpenCodianSettings`
- **Theme module**: 使用 `ChatAppearanceSettings`, `ThemeSettings`, `ThemePresetId` 等
- **ServerManager**: 使用 `ServerConfig`, `getServerBaseUrl()`
- **BlocklistChecker**: 使用 `PlatformBlockedCommands`, `enableBlocklist`

## 配置项

此模块本身是配置模式定义，不引入额外配置。

## 调试日志设置簇

调试相关字段现在成组工作，而不是只有单个 `enableDebugLogging`：

- `enableDebugLogging`
- `debugModuleSettings`
- `debugRefreshIntervalMs`
- `inlineSerializedDebugLogArgs`
- `debugLogPaths`

`normalizeModelProviderPluginDebugSettings()` 会统一负责这些字段的兼容与归一化，包括：

- 把模块开关补齐为完整布尔表
- 把高频日志刷新间隔限制到稳定范围
- 把 legacy `debugLogPath` 吸收到新的 `debugLogPaths`

## 注意事项

- `normalizeInputPanelThemeId()` 包含废弃 ID 迁移逻辑：
  - `'liquid-glass-rdev'` → `'liquid-glass-shuding'`
  - `'liquid-diamond-shuding'` → `'preset'`
- `isValidChatAppearanceCustomCssDeclarations()` 禁止花括号和 `<style>` 标签，防止 CSS 注入
- `normalizeFiniteNumberInRange()` 用于将数值夹紧到合法范围
- 颜色和字重现在也会被单独校验，不再只是“数字能过就行”
- `inputPanelGlassRefractionGlassDefaultsVersion` 用于版本化默认值迁移
- Windows 上 `getBashToolBlockedCommands()` 合并 unix + windows 两套黑名单
- `normalizeCompactionReservedTokens()` still exists as a reusable positive-integer normalizer, but compaction config defaults are no longer stored in `OpenCodianSettings`; compaction config is now project-scoped via `.opencode/opencode.json`
- `normalizeChatFontSizePx()` 会把值归一化到受支持的整数范围；无效输入回退到默认 `13`
- `hiddenSlashCommands` 存储用户隐藏的斜杠命令 ID
- `normalizeSlashCommandSkillMode()` 只接受 `'direct'` 或 `'skills-command'`，未知值回退到默认直显模式
- `modelAvailabilitySectionOpen` / `modelToolsSectionOpen` 属于设置页 UI 状态，和 `settingsPanelScrollTop` 一样会被持久化
- 归一化函数设计原则：未知值回退到默认值，而非报错
- `enableTabs` 是显示/入口开关，不是会话存储迁移开关；禁用时不能清空 `tabState`，以便重新启用后恢复原标签上下文

## 2026-04-23 Compaction config alignment

Compaction config is now project-scoped (`.opencode/opencode.json`). Ownership facts:
1. Compaction config source of truth is `.opencode/opencode.json`, not `OpenCodianSettings`.
2. `autoCompactionEnabled` and `compactionReservedTokens` were removed from `OpenCodianSettings` and its load normalization; `normalizeCompactionReservedTokens()` is retained as a reusable normalizer helper.
3. Manual `session.summarize()` remains a per-session action available through `OpenCodeService` session control, not managed by plugin settings.

## 版本迁移

- `inputPanelGlassRefractionGlassDefaultsVersion: 2` 表示当前玻璃默认值版本
- 未来版本升级时可通过比较版本号触发默认值迁移

## 2026-04-24 Dual-layout settings fields

New fields added to `OpenCodianSettings` for the dual-layout settings UI:

| 字段 | 类型 | 默认值 | 说明 |
|------|------|--------|------|
| `settingsLayoutMode` | `'classic' \| 'tabbed'` | `'tabbed'` | 设置页面布局模式 |
| `settingsTabbedPrimaryTab` | `string` | `'server'` | 标签模式下当前激活的一级标签 |
| `settingsTabbedSecondaryTabByPrimary` | `Record<string, string>` | `{}` | 每个一级标签上次选择的二级标签 |

New normalize functions added:

- `normalizeSettingsLayoutMode(value)` — validates and defaults to `'tabbed'`
- `normalizeSettingsTabbedPrimaryTab(value, fallback)` — validates string, falls back to given value, and migrates legacy `'language'` primary ids to `'general'`
- `normalizeSettingsTabbedSecondaryTabByPrimary(value)` — filters to `Record<string, string>` of trimmed non-empty entries, remaps legacy `{ language: 'general' }` memory to `{ general: 'language' }`, and downgrades stale `{ general: 'general' }` to `{ general: 'basic' }`

`DEFAULT_SETTINGS` defaults to `settingsLayoutMode: 'tabbed'` for new installs. Existing users are migrated to `'classic'` in `settingsLoadNormalization.ts` via `resolveInitialLayoutMode()`.

- `ClaudeCodeBackendSettings` 新增 `promptSuggestions: boolean` 字段（默认 false）。JSDoc 标注为 readback：SDK options wiring + pump callback 已证明，端到端建议传递未独立验证。normalization 使用 `candidate.promptSuggestions === true` 严格布尔检查。

- `OpenCodianSettings` 新增可选 `opencodeCapabilities?: OpenCodeCapabilitySettings` 字段（来自 `OpenCodeCapabilitySettingsMigration`），承载 SDK capability preferences 与 experimental gates。`DEFAULT_SETTINGS` 默认为 `undefined`，由 normalizer 处理默认值。不存储 live server availability、secrets 或原始 server payload。

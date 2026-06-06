# English Locale

> **源码**: `src/i18n/locales/en.ts`
> **最近更新**: 2026-06-06

## 概述

OpenCodian 的英文翻译表，导出 `enTranslations` 静态对象。本轮新增并扩展 `chat.backendSessions.*` 键（backend session browser modal：浏览/预览/恢复 backend sessions、preview transcript seeding、detail metadata、完整 transcript、preview/detail 导航）和 `settings.claudeCode.sessionBrowser.*`（settings 侧 browse-only session browser launcher：说明、按钮和 browse-only notice）以及 `settings.claudeCode.projectSettings.*` 键（含 `marketplacesSummary` / `noMarketplaces` / `boundaryNotice` 含 settingSources 要求说明）。 `chat.sessionSharing.*` 与 `settings.conversation.share.sharedSessions.*` / `settings.conversation.share.diagnostics.*`，用于当前会话分享状态、分享禁用提示、分享失败归一化说明、分享诊断、已分享会话列表、公开数量、刷新、完整预览、复制链接和取消分享操作；其中新增 `settings.conversation.share.sharedSessions.previewEmpty`，用于区分“后端不可预览”与“会话目前没有可预览消息”的中性空态。 同时保留 `settings.conversation.share.help.*`、`settings.security.blockedCommands.help.*` 与 `settings.projectConfigHelp.*`，用于会话分享模式和 `permission.bash` 帮助弹窗。

会话设置弹窗本轮还新增了 `chat.sessionSettings.modal.globalDefaultsGroup`、`globalDefaultsDesc` 和 `summary.*` 文案，用于 Display 分组下方的全局默认值摘要行与 “Open settings” 按钮。

本轮 cap-1 更新了 `settings.claudeCode.fallbackModel.desc`，加入 fallback 路径尚未经过运行时验证的诚实性提示，与 `ClaudeCodeBackendSettings` 类型接口上的 `@untested` 标记保持一致。

本轮新增 `chat.agentSelector.*` 键，供聊天输入框下方的主 Agent 下拉框使用，包括 trigger、轻量列表标题、OpenCode default 选项、default badge、description、loading/empty/load-failed 状态以及选中 tooltip。

最近一轮还重写了 `settings.security.*` 的权限文案：把原先容易误导成“上游原生 mode”的 wording 调整为 **OpenCodian permission template + config summary** 语义，并补齐了 security section 的 restart tooltip / notice keys。

2026-04-24 的本轮还补了一组 `settings.commands.*` / `settings.quickNav.commandsDesc` 文案，把 Commands settings 的心智模型对齐到当前 slash runtime truth：project-only command 只是“已写入项目配置、等待 runtime 暴露”的草稿，skill mode 只改变 `/skill` vs `/skills <skill>` 的入口形态，命令级 `Temperature` / `Top P` 则用 “hidden helper agent” 的 plain-language 语义解释。

同一天的后续 UI 微调还新增了 `settings.agents.editor.group.*` 文案，并把 `settings.agents.catalog.desc` 改成正向可见性语义，明确说明：agent catalog 中的子代理开关现在是 **on = visible in `@` menu / off = hidden**。

当前 A4 agent-surface 收尾又补了一组 `settings.agents.expert.*`、`settings.agents.workspace.*`、`settings.agents.guard.*`、`settings.agents.editor.select.runtimeSection` / `systemBadge` 以及 `settings.agents.tab.workspace` 文案，把 system-agent expert gate、Markdown workspace CRUD / status、runtime-system editor labels 和新的 workspace tab 都放进 locale，而不是继续在 settings owner 中硬编码文本。

2026-04-25 新增 `settings.server.tab.mcp` 和 `settings.server.mcp.*` 系列键，为早期的 `Server > MCP` 设置标签页提供 MCP 服务器概览、状态徽章和刷新操作的英文文案。

同日 M2 继续扩展 `settings.server.mcp.*` 键空间，新增 MCP 操作按钮（connect / disconnect / authenticate / clearAuth）、新增服务器表单（local / remote 类型切换、command / environment / url / headers / OAuth 等字段）、校验错误（nameRequired / nameDuplicate / commandRequired / urlRequired / urlInvalid / timeoutPositive / emptyKey）和操作反馈通知（added / addFailed / actionFailed）对应的英文文案。

2026-04-26 的 MCP settings UI 收口又补了一组 `settings.server.mcp.add.group.*` 和 `settings.server.mcp.add.type` 文案，用于把新增服务器表单重组为 `Basics` / `Connection` / `OAuth` 分组卡片，并把原先直接用标题占位的类型切换改成独立 `Type` 字段标签。随后 MCP management panel 又新增 `action.monitor/edit/delete`、`runtimeSwitch.*`、`ownership.*`、`editor.*`、`details.*`、`delete.confirm` 和 project config mutation notices，用于区分 runtime truth 与 project config truth。

同日 F2 新增 `settings.formatter.*` 和 `settings.quickNav.formatterDesc` 系列键，为 Formatter & Language Servers 一级设置页提供概览（runtime status / summary cards / detected formatter table）、配置（mode switch）和模式切换通知的英文文案；后续导航修正把该一级标题与 quick-nav 描述对齐到 formatter + language server 双入口。

同日 F3 扩展 `settings.formatter.config.*` 键空间，新增内置格式化器编辑（builtin list / action dropdown / override fields for command/environment/extensions）、自定义格式化器 CRUD（add / save / delete / nameConflict）、高级 JSON 编辑器（format / reload / save / invalidJson）和运行时离线提示对应的英文文案。

本轮继续扩展 `settings.formatter.overview.formatterList.*`，新增 detected formatter 表格的本地搜索标签、占位符和无匹配空态文案，用于支持按名称 / 扩展名快速筛选运行时 formatter 列表。

本轮补齐 `settings.formatter.tab.formatter`、`settings.formatter.tab.lsp` 与 `settings.formatter.lsp.*` 键空间，覆盖 Formatter 页中 Language servers 概览、模式切换、内置/自定义 LSP 编辑器、初始化 JSON、环境变量和高级 JSON 编辑器的英文文案，避免中文运行时回退到裸 translation key。随后新增 `settings.formatter.help.*`，用于 formatter / LSP mode 行的帮助按钮、普通用户能理解的解释弹窗，以及官方 Formatter / LSP 文档链接标签。后续又新增 `settings.formatter.builtinSearch.*`，为内置 formatter / LSP 长列表的自定义模糊搜索框、状态筛选、占位符、aria label、清除按钮、计数 chip 和无匹配空态提供英文文案；本轮补充 `settings.formatter.notice.restartFailed`，用于项目 formatter/LSP 配置保存后本地 OpenCode 自动重启失败的英文提示。

2026-04-26 navigation reorg added `settings.mcp.title`, `settings.mcp.tab.overview`, and `settings.quickNav.mcpDesc`, because MCP has been promoted to its own primary settings tab and classic quick-nav entry. `settings.server.tab.*` now only describes the remaining server secondary tabs (connection/auth/status).

本轮新增 `settings.style.input.contextRing.*` 键，为输入区样式设置里的上下文圆环样式下拉框提供英文标签、描述和 `Classic ring` / `Segmented ring` 两个选项。

本轮还新增 `settings.style.input.fontGroup.*` 8 个键，为输入区英文字体 / 中文字体下拉框提供英文分组、标签、描述和默认选项文案。

本轮还新增 `agentMention.menu.*` 系列键（`loading`、`empty`、`noMatches`、`loadFailed`），为 agent mention 自动补全菜单提供独立的状态文案，与 slash command 菜单的 `slashCommand.menu.*` 键分离。

本轮还新增 `slashCommand.sourceBadge.command`，让 chat slash menu 中 runtime-backed 普通命令以 `command` badge 展示；旧的 `runtime` 文案保留给需要表达运行时来源的其他上下文。

本轮新增 `settings.commands.catalog.chip.builtin` 和 `slashCommand.sourceBadge.builtin`，为 settings catalog 和 chat slash menu 中的内置命令提供 `Built-in` / `built-in` badge 文案。

本轮新增 `slashCommand.menu.hint`，用于在 slash command 一级补全框顶部提示用户“斜杠命令仅在输入框开头输入时生效”。

本轮新增 `slashCommand.mdCommand.prefix.user` / `project`，为 `.opencode/commands/*.md` markdown command 来源标签预留英文文案。

本轮新增 `modifiedFiles.*` 键，为聊天界面的 modified files 右侧面板提供标题、空状态、状态 badge 和 toggle tooltip 英文文案。

2026-05-11 还新增 `chat.tab.backToParent`，用于子会话 tab 激活时的 “Back to parent” 面包屑按钮文案；后续补充 `chat.tab.childOpenFailed`，用于子代理/子会话 tab 防御性打开失败时的通用 notice，避免误用 max-tabs 文案；并补充 `chat.fork.newTabDisabled`，用于禁用会话标签时解释 fork modal 为什么隐藏 new-tab 目标。同日 AskQuestion Dock polish 新增 `chat.question.collapse` 与 `chat.question.expand`，作为 above-input QuestionDock 折叠/展开图标按钮的 aria label。

2026-05-13 新增 `settings.skills.loading` / `settings.skills.count`、`settings.tools.group.*.desc`、`settings.tools.custom.desc`、`settings.acp.customAgent`、`settings.acp.preset.desc` 和 `settings.acp.command.empty`，服务 Skills / Tools / ACP Agents 设置页的分组化布局、空态和命令摘要。随后同日继续扩展 `settings.skills.create.*`、`settings.skills.modal.*`、`settings.skills.validation.*`、`settings.skills.notice.*` 以及 `settings.agents.editor.skillTool.*` / `settings.agents.editor.skillPermission.*`，用于技能 CRUD、Markdown 编辑/预览、官方格式校验、单技能权限和 agent 级 skill 覆盖 UI；其中 validation 文案覆盖 skill name 模式、父目录匹配、允许字段、description 尖括号 / 长度以及 compatibility 长度。随后又新增 `settings.skills.permission.help.*`，用于结果导向地解释 allow / ask / deny、默认权限和单技能覆盖，并链接 OpenCode Skills 官方文档。之后补充 `settings.skills.permission.inheritGlobal`、`settings.skills.permission.desc`、`settings.skills.permission.globalStatus.*`、`settings.skills.itemPermission.inherit`、`settings.skills.itemPermission.desc` 和权限写入后的 restart notice 文案，让 Skills UI 明确区分继承全局、当前全局权限、技能默认加载权限和单技能覆盖，并提示配置写入 `.opencode/opencode.json` 后会重启本地 OpenCode 服务；单技能继承选项使用 “Follow default” / “跟随上方默认”，避免配置术语压过用户理解。随后补充 `settings.skills.delete.confirm`，用于列表行删除当前 vault 内项目技能前的确认，并补充 `settings.skills.source.plugin`，把 OpenCode 插件包 cache 注入的技能显示为 “Plugin Packages”。本轮还补充 `settings.skills.notice.restartFailed`，用于项目技能文件保存/删除/刷新时重启本地 OpenCode 失败的提示；并新增 `settings.skills.tab.project` / `external`、`settings.skills.bulk.*`、`settings.skills.empty.project` / `external`，用于 Skills 设置页的“项目技能 / 外部技能”二级标签、批量权限、项目批量删除和分标签空态；后续布局整理新增 `settings.skills.external.*`，外部技能页保留刷新说明，批量权限下拉改为选择即应用，不再需要 `settings.skills.bulk.apply` 文案。本轮还新增 `settings.tools.custom.authoring.*`、`settings.tools.custom.create.*`、`settings.tools.custom.files.*`、`settings.tools.custom.source.*`、`settings.tools.custom.modal.*`、`settings.tools.custom.validation.*` 和 `settings.tools.custom.notice.*`，用于自定义工具文件 authoring：项目 `.opencode/tools` 新建/编辑/删除、全局 tools 只读展示、OpenCode 文档入口、源码校验和保存/删除通知。随后补充 `settings.tools.default.*`、`settings.tools.permission.inherit`、`settings.tools.permission.custom`、`settings.tools.custom.notice.restartFailed` 和工具权限 restart notice 文案，用于解释 `permission["*"]` 全局默认、OpenCode 默认值、单工具 Follow default / override / custom rules 关系，以及权限或工具文件写入后本地服务自动重启。随后新增 `settings.plugins.detectedCount` 与 `settings.plugins.path.*`，用于插件来源目录的检测数量与 path status chip。

源码约 2050 行。

本轮新增 `slashCommand.undo.*`、`slashCommand.redo.*`、`slashCommand.new.*`、`slashCommand.share.*`、`slashCommand.unshare.*` 系列 i18n 键，为 5 个新增 synthetic builtin slash commands 提供 description、notice 和状态文案。

本轮新增 `slashCommand.init.description`、`slashCommand.review.description`、`slashCommand.help.description`，为 OpenCode 内置运行时命令提供介绍语翻译；文案与 OpenCode 源码中的实际 description 对齐（init: "Guided AGENTS.md setup"、review: "Review changes [commit|branch|pr], defaults to uncommitted"、help: "Show OpenCode help"）。同时更新 `settings.commands.editor.description.placeholder` 为中文占位符。

本轮维护 `settings.model.providerDirectory.*` 键，为 settings/model 目录中的 provider directory 诊断提供英文 summary 与 badge 文案。它只表达 `provider.list()` 的 connected / listed 辅助状态，并把 listed outside catalog 作为诊断计数呈现，不改变 `config.providers()` 驱动的服务器目录或可选模型。

本轮更新 `settings.general.tab.backend` 与 `settings.backend.*` 键，为 Backend Management 面板提供英文标题、默认 backend 下拉、enabled backend 列表、Claude Code 可启用说明和启用状态标签；未来 backend 仍保留 Coming Soon 描述。

本轮还补充 `chat.empty.noBackend.*`、`chat.empty.backendOffline.*`、`chat.serverStatus.disabled` 与 `chat.serverPrompt.enableBackend`，用于聊天区区分“没有任何 enabled backend”与“backend 已启用但当前离线”两类状态，不再把两者都压成 generic offline wording。

本轮更新 `settings.claudeCode.*` 键，为 Claude Code Phase 1/2 配置面板提供英文文案，包括 section 标题/描述、Runtime / Model & Thinking / Permissions / Context & Sources / Tools / Limits 等标签、runtime ecosystem 只读摘要、executable path、authentication/environment hint、setting sources、project source file visibility、next-query/restart boundary、permission mode、model/fallback model、thinking/effort（含 `Extra high`）、additional directories、allowed/disallowed tools、max turns、max budget、env 和 runtime diagnostics；`claude-code` backend 已可在 Backend Management 中显式启用，但发送前仍需要官方 SDK 认证可用。另新增 `chat.serverStatus.backendConnected`、`chat.serverStatus.backendOffline` 和 `chat.serverStatus.openBackendSettings`，用于 Claude 等非 OpenCode backend 的 header 状态文案与 settings tooltip，避免复用 OpenCode server/remote copy。`chat.history.backendScope` 则用于 history dropdown 顶部显示当前 backend 的历史范围。

2026-05-23 继续新增并维护 `settings.claudeCode.mcpRuntime.*` 键，用于 Claude Code Tools 标签里的 MCP runtime 状态和刷新按钮；新增 `settings.claudeCode.mcpRuntime.loadedWithNames`，在 adapter 暴露 server names 时只读显示名称。2026-06-01 继续扩展同一键空间，新增 `inspectButton`、`statusLoading`、`statusUnavailable`、`statusFailed`、`statusEmpty`、`statusSummary`、`statusTools`、`statusNoTools` 和 `statusServerInfo`，用于 SDK `mcpServerStatus()` runtime readback。文案明确该操作只读取 runtime status，不 author `.claude/mcp.json`。

同日继续新增并维护 `settings.claudeCode.runtimeEcosystem.*` 键，用于 Claude Code Runtime 标签中的只读 runtime plugins / skills / agent definitions 摘要。文案明确这是 adapter runtime-only options 的状态披露，不提供 skills/plugins/agent-definition authoring。

本轮继续扩展 `settings.claudeCode.runtimeEcosystem.*` 键空间，新增 `agentDefinitions.empty` / `loaded` / `single`，用于 settings Runtime 标签中的只读 runtime agent definitions 摘要，与 plugins / skills 摘要对齐显示。文案明确这是 adapter runtime-only `agent` / `agents` options 的状态披露，不提供 agent authoring。

本轮新增 `settings.claudeCode.runtimeCatalog.*`、`settings.claudeCode.accountInfo.*`、`settings.claudeCode.contextUsage.*` 和 `settings.claudeCode.fileReadback.*` 键，用于 Claude Code Runtime 标签中的只读 runtime catalog / account info / context usage / runtime file readback surface。文案明确这是 sanitized/supporting evidence：runtime catalog 只展示 SDK `supportedCommands()` / `supportedAgents()` 回读的 command/agent 名称、描述、argument hint、aliases/model，不执行 slash command、不创建 agent、不保存 settings、不写 `.claude/**`；file readback 是 Settings UI 默认请求 `maxBytes: 4096`、encoding 使用 `utf-8`（adapter/SDK 可支持 `base64`），可展示 `absPath`、`contents`、`truncated`；这些 readback surface 不执行登录认证、不保存 settings、不写文件、不写 `.claude/**`，也不证明 File Checkpoint / Rewind 或 Fallback Model 行为。相关键覆盖 inspect/loading、empty/unavailable/failure、truncated 和 readback summary 状态。本轮继续新增 `settings.claudeCode.projectSkills.*`、`settings.claudeCode.runtimeCommands.*` 和 `settings.commands.catalog.chip.claudeRuntime`，用于 Runtime 标签只读扫描 `.claude/skills` 项目技能、展示 Claude SDK `supportedCommands()` 命令，并在 commands catalog 中显示 Claude runtime 来源 chip。

本轮更新 `settings.claudeCode.env.desc`，在环境变量描述中加入 POSIX 键名规范提示和未运行时验证的诚实性声明，与 `ClaudeCodeBackendSettings` 类型接口上的 `@untested` 标记保持一致。

本轮更新 `settings.claudeCode.allowedTools.desc` 和 `settings.claudeCode.disallowedTools.desc`，移除过时的“未运行时验证”声明，改为在 Tools 标签通过 `settings.claudeCode.proofStatus.tools` 共享 notice 统一标注 runtime readback verified 状态。`proofStatus.tools` 已更新为更明确的 readback-only 边界文案："Readback verified. Allowed Tools is a pre-allow / auto-approve shortcut — it is not a restrictor. Runtime evidence confirms zero enforcement: init catalog always unfiltered (34 tools), canUseTool non-functional in SDK query() mode. For deterministic built-in tool filtering, use Restricted Built-in Tools."

2026-05-29 本轮更新 `settings.claudeCode.proofStatus.limits`，从 readback 文案改为 behavior-verified 文案："Runtime behavior verified. Both maxTurns and maxBudgetUsd enforcement confirmed via live runtime proof (error_max_turns + error_max_budget_usd signals observed)."，反映 Turn/Budget Limits 已从 `readback` 晋升为 `pass`。对应的 `data-proof-state` 从 `"readback"` 改为 `"pass"`。

2026-05-28 本轮更新 `settings.claudeCode.maxTurns.desc`、`settings.claudeCode.maxBudgetUsd.desc`、`settings.claudeCode.env.desc`，移除过时的“wired but not yet runtime-verified”文案；新增 `settings.claudeCode.proofStatus.tools`、`settings.claudeCode.proofStatus.limits`、`settings.claudeCode.proofStatus.env` 三个共享 proof-status notice 键，用于在 Tools、Model & Thinking、Runtime 标签中 compact 地展示 runtime proof 状态。`proofStatus.env` 已更新为 "Settings→SDK mapping verified (readback supporting evidence). Live behavior proof (env propagation into Claude/Bash subprocesses, Layer 1-4) is verified in Capability Lab. Overall capability: verified (pass)."，反映 Environment Variables stable settings notice 是 readback supporting evidence，live behavior proof 已在 Capability Lab 验证（2026-06-02 truth-sync）。更新 `settings.claudeCode.fallbackModel.desc` 和 `settings.claudeCode.fallbackModel.boundaryNotice`，诚实标注“option wiring and readback are proven; automatic fallback behavior is unproven with the current SDK”。新增 `settings.claudeCode.proofStatus.fallbackModel`，用于 Model & Thinking 标签的 Fallback Model compact proof-status notice（`data-proof-state="readback"`），明确标注选项回读已验证但自动 fallback 行为未验证。2026-05-29 proof-status 从 `wiring` 晋升为 `readback`（`inspectLastDiagnosticSdkOptions()` 确认 model 和 fallbackModel 均正确到达 SDK）；行为 Blocker = SDK 不在 query boundary 验证 model 名称，无效主模型被接受无错误并回显相同无效字符串，未触发 fallback；fallback 是 overload-oriented，无法在本地模拟 real overload。

2026-06-04 新增 `settings.capabilityLab.proofs.systemPromptLive.*` locale keys，覆盖 System Prompt 实时行为证明按钮、运行中提示、标题、三段诚实边界文案、nonce/status/preview 标签，以及 pass/fail/thrown 提示，移除 Capability Lab 中该 proof 的硬编码英文。同步更新 `settings.claudeCode.systemPrompt.boundaryNotice`：稳定设置页现在明确说明 System Prompt 的 `pass` 依赖两类互补证据，而不是把诊断 live proof 误写成对“当前保存字符串本身”的直接 live 执行证明。

2026-05-28 SDK Foundations 诊断表面迁移：新增 `settings.claudeCode.diagnosticStreamMoved.title` / `.desc`，用于在稳定 SDK Foundations 标签中提示用户诊断流控制已迁移到 Capability Lab；新增 `settings.capabilityLab.diagnosticStreamControls.title` / `.description`，用于 Capability Lab 中 Diagnostic Stream Controls 子区的标题和说明。保留原有的 `settings.claudeCode.includeHookEvents.*`、`settings.claudeCode.forwardSubagentText.*`、`settings.claudeCode.agentProgressSummaries.*`，因为这些设置键仍然有效，只是 UI 表面从稳定设置迁移到了诊断面板。

2026-06-02 Continue diagnostic seam 又补了一组 `settings.capabilityLab.proofs.continue.*` 键，把 Continue proof 按钮、运行中提示、诊断边界说明、seed/continue session labels、yes/no 状态、pass/fail 文案和 thrown-error 提示收进 locale，避免在 Capability Lab 继续硬编码新增诊断 UI 文案。

2026-06-04 又新增 `settings.capabilityLab.proofs.stderr.*` 键，把 Stderr Diagnostic proof 的按钮、运行中、标题、readback/fail 提示和“隔离诊断查询 / 无持久 raw-log surface / 不写文件”诚实边界文案收进 locale。这样 Capability Lab 在英文和中文下都显示同一组 readback 语义，而不会在中文环境退回硬编码英文。

2026-06-04 继续新增 `settings.capabilityLab.proofs.planModeInstructions.*` 键（18+ proof keys 覆盖中英双语），把 Plan Mode Instructions readback proof 的按钮、运行中、标题、边界文案、生命周期边界、option-wired/permission-mode/setting-value/sdk-option/sdk-value/builder-wiring-nuance/value-match 状态行，以及 readback/fail/thrown 提示全部收进 locale。取代之前的硬编码英文，使 Capability Lab 在中文界面下同样显示明确的 readback 语义和生命周期边界（“Applies on the next query or restarted session only. Active sessions do not update live.”）。

2026-06-04 新增 `settings.capabilityLab.proofs.taskBudget.*` 键（17 个 proof keys，覆盖中英双语），把 Task Budget readback proof 的按钮、运行中、标题、诊断 readback 边界、生命周期边界、option-wired/setting-value/sdk-option/sdk-total/total-match 状态行，以及 readback/fail/thrown 提示全部收进 locale。这样 Capability Lab 在英文和中文界面下都能一致表达 `@alpha`、active-session 不会实时更新、以及“仅验证 settings→SDK option mapping”的诚实边界。
2026-06-04 继续新增 `settings.capabilityLab.proofs.toolAliases.*` 键（17 个 proof keys，覆盖中英双语），把 Tool Aliases readback proof 的按钮、运行中、标题、诊断 readback 边界、生命周期边界、option-wired/setting-empty/sdk-option/sdk-entry-count/defensive-copy/entries-match 状态行，以及 readback/fail/thrown 提示全部收进 locale，移除 Capability Lab 中该 proof 的硬编码英文。稳定 `settings.claudeCode.toolAliases.*` 文案本轮未改动，因为它已经匹配较新的 readback/lifecycle 诚实模式。
2026-06-06 审计硬化：`settings.claudeCode.toolAliases.boundaryNotice`、`settings.capabilityLab.proofs.toolAliases.boundary` 和 `settings.capabilityLab.proofs.toolAliases.readback` 已更新，明确引用 SDK 源码审计结果（browser-sdk.js `initialize()` 将 toolAliases 作为单向初始化参数转发，无反馈事件）和流式可观测性缺口（tool_use 块仅暴露解析后名称，无别名元数据），取代之前较模糊的 "internal claim" 措辞。

2026-06-06 AskUserQuestion Preview Format 产品化：新增并扩展 `settings.claudeCode.askUserQuestionPreviewFormat.*` 键（`name`、`desc`、`option.*` 3 个选项标签），以及 `chat.question.preview.*` 键（`labelMarkdown`、`labelHtml`），用于 Claude Code Tools 标签中稳定的 preview format 设置和 Question UI 中按格式标注的预览区。文案明确这是 Claude-only 设置，仅在下次查询或重启后生效，活跃会话不会实时更新；HTML 预览仅作纯文本展示，不做 rich HTML 解析。
2026-06-04 继续新增 `settings.capabilityLab.proofs.sandbox.*` 键（22 个 proof keys，覆盖中英双语），把 Sandbox readback proof 的按钮、运行中、标题、诊断 readback 边界、生命周期边界、option-wired/3 个 setting 状态/SDK option presence/3 个 SDK 子状态/3 个 match 状态，以及 readback/fail/thrown 提示全部收进 locale，移除 Capability Lab 中该 proof 的硬编码英文。同步收紧 `settings.claudeCode.sandbox.boundaryNotice` 与 `.lifecycleNotice`，稳定 Settings 文案现在明确写出“Readback only”与 active-session 不会实时更新的边界。
2026-06-04 继续新增 `settings.capabilityLab.proofs.debug.*` 键（16 个 proof keys，覆盖中英双语），把 Debug readback proof 的按钮、运行中、标题、诊断 readback 边界、生命周期边界、option-wired/setting-value/sdk-option/sdk-value/value-match 状态行，以及 readback/fail/thrown 提示全部收进 locale，移除 Capability Lab 中该 proof 的硬编码英文。后续又把该 proof 的 lifecycleBoundary 收紧为更保守的 next-query-only，和既有 `settings.claudeCode.debug.lifecycleNotice` 保持一致，不额外发明 restart 语义。
2026-06-04 同步收紧 `settings.claudeCode.planModeInstructions.lifecycleNotice`：稳定 Settings 文案不再只写“下次查询或重启后生效”，而是明确补出 active-session 边界，说明不能 live 变更 already-running session。
2026-06-03 调整 `settings.claudeCode.planModeInstructions.desc` 与 `.boundaryNotice`：稳定设置文案不再暗示插件层按 `permissionMode` 做写入门控，而是明确区分 SDK 使用条件（Plan permission mode）与当前 readback-only 边界（插件只验证 settings→SDK option wiring，实际 plan-mode behavior 未独立运行时验证）。

2026-05-28 文档更正：移除关于 `chat.input.placeholderJsonSuffix` 与 backend-aware composer placeholder 已落地的表述。当前实现未引入该 i18n 键，也未在输入框占位符中追加 `/json` discoverability 文案；discoverability 通过 composer capability hint 落地（`chat.input.capabilityHint.jsonLabel` + `chat.input.capabilityHint.jsonTooltip`，Claude Code backend 对用户显示 `Structured reply`，点击后底层仍插入 `/json `，OpenCode backend 不显示），并且仍然只覆盖固定 schema trigger，不暗示任意 schema authoring。

2026-05-24 新增 `settings.claudeCode.sdkStreamBoundary.*` 键，用于 SDK Foundations 中 hook/subagent stream 开关前的 diagnostic boundary notice，明确这些开关只驱动诊断/实验事件流，不提供稳定 hook authoring 或完整 subagent transcript/progress UI。

2026-05-27 新增 `settings.claudeCode.fallbackModel.boundaryNotice` 键，用于 Model & Thinking 标签中 fallback model 控件后的边界提示。文案说明 fallbackModel 的修改需要重启活跃 Claude Code 会话或开始新的查询,无法像主模型一样在已运行的流中实时更新。

本轮更新 `settings.claudeCode.model.desc` 和 `settings.claudeCode.fallbackModel.desc`，在主/备用模型描述中明确区分 live apply 与 restart-only 的产品边界，并提示用户通过下方 quick-select 下拉框选择模型。新增 `settings.claudeCode.model.quickSelectName` / `quickSelectDesc` 和 `settings.claudeCode.fallbackModel.quickSelectName` / `quickSelectDesc` 键，用于 Model & Thinking 标签中模型/备用模型的 quick-select 下拉框；保留 `settings.claudeCode.modelCatalog.quickSelectPlaceholder` 作为下拉框的默认占位文案。旧的 `modelCatalog.*` 系列键（refreshButton、loading、empty、error、useAsMain、useAsFallback）已随分离式目录列表的移除而废弃。

本轮还将 `chat.question.title` 调整为 backend-neutral 的 “Question from agent”，避免 Claude Code 的 AskUserQuestion / elicitation 复用统一 Question UI 时继续显示 OpenCode 专属标题。

2026-05-21 Debug IA 更新新增 `settings.debug.tab.plugin` / `opencode` / `claudeCode` / `export`、`settings.debug.modules.*` 来源分组说明、`settings.debug.modules.claudeCode.*` 和 `settings.debug.export.*` 文案，用于把插件内部诊断、OpenCode 后端诊断、Claude Code SDK 摘要诊断和导出/控制台帮助分开展示。后续 Claude Code 调试工作台又补充 `settings.debug.claude.*`，覆盖状态条、summary-only 隐私说明、模块总开关、六个日志通道、最近日志预览、复制当前 Claude 日志和复制 Claude 专属诊断报告。

## 导入关系

```text
上游: 无
下游: src/i18n/locales/index.ts, src/i18n/index.ts
```

## 核心类型 / 接口

```typescript
export const enTranslations: Record<string, string> = {
  'plugin.name': 'OpenCodian',
  'plugin.description': 'Use OpenCode AI assistant in Obsidian',
  'settings.server.title': 'Server',
  'settings.server.mode.name': 'Connection mode',
  // ... 约 400+ 个键
};
```

## 核心逻辑

### 英文基准键空间

该文件提供所有翻译键的英文实现。`src/i18n/index.ts` 会以英文表作为：
1. 类型推导来源（`TranslationKey = keyof typeof enTranslations`）
2. 最终回退来源（当前语言缺失时回退到英文）

因此它实际上承担"默认键集"的角色。

### 覆盖范围

当前键空间覆盖：

- 插件基础信息（`plugin.*`）
- 设置页各分组（`settings.server.*`, `settings.model.*`, `settings.style.*` 等）
- 会话与聊天交互（`chat.input.*`, `chat.context.*`, `chat.tab.*`, `chat.sessionSettings.*` 等）
- composer 主 Agent selector（`chat.agentSelector.*`）
- child-session tree UI（`chat.childSessionTree.*`）
- 权限 / question / 调试提示
- 主题与 Liquid Glass 参数说明（大量 `settings.style.input.liquidGlass.*` 键）
- 会话设置保存结果提示（`chat.sessionSettings.saved*`，区分普通保存、deferred backend apply 和 runtime reapply warning）

### 帮助文本

包含大量解释型长文本，如：
```typescript
'settings.style.input.liquidGlass.shuding.help.displacementScale':
  'This is the main "glass strength" slider. Higher bends the background more; lower looks calmer...',
```

这些键以 `.help.` 为前缀，用于设置面板的"用大白话解释"功能。

## 关键方法

| 方法 / 导出 | 说明 |
|-------------|------|
| `enTranslations` | 英文静态翻译表对象 |

## 数据流

不适用。该模块没有运行时流程；典型消费链路为 `t(key)` → 查英文表 → 返回文案或作为回退。

```
t('settings.server.started')
  → translations.en['settings.server.started']  // 英文值
  → 或 translations.zh[key]  // 如果当前是中文
```

## 与其他模块的交互

- 被 [locales/index.md](./index.md) 聚合
- 被 [i18n/index.md](../index.md) 用作默认回退语言和 `TranslationKey` 推导来源

## 配置项

无。

## 键前缀统计

| 前缀 | 用途 |
|------|------|
| `plugin.*` | 插件基本信息 |
| `settings.server.*` | 服务器设置 |
| `settings.model.*` | 模型设置 |
| `settings.conversation.*` | 对话设置 |
| `settings.security.*` | 安全设置 |
| `settings.ui.*` | UI 设置 |
| `settings.style.*` | 样式设置（含大量 Liquid Glass 帮助文本） |
| `settings.debug.*` | 调试设置（含 module toggles、refresh interval、诊断动作与 console help） |
| `settings.claudeCode.sessionBrowser.*` | Claude Code settings 中的 browse-only backend session browser launcher 文案 |
| `settings.user.*` | 用户设置 |
| `settings.plugins.*` | 插件管理 |
| `settings.quickNav.*` | 快速导航 |
| `chat.*` | 聊天界面 |
| `agentMention.menu.*` | Agent mention 自动补全菜单状态文案 |

## 注意事项

- 新增翻译键时，英文表与中文表必须同步保持键名一致
- 如果某个键只出现在中文表、不出现在英文表，类型安全和回退逻辑都会变差
- 帮助文本（`.help.` 键）通常为多行长文本，使用 `\n` 换行
- 参数插值占位符支持 `{paramName}` 与 `{{paramName}}`，新增键优先保持同一键在中英文中的占位符名称一致
- 本文件是 i18n 类型安全的基础，修改需谨慎

## Liquid Glass 帮助键

以下键专门服务于 Liquid Glass 设置帮助系统：
- `settings.style.input.liquidGlass.shuding.*.desc` — 参数描述
- `settings.style.input.liquidGlass.shuding.help.*` — 详细帮助
- `settings.style.input.liquidGlass.nikdelvin.*.desc`
- `settings.style.input.liquidGlass.shudingDiamond.*.desc`
- `settings.style.input.help.*` — 通用帮助

## 2026-04-23 Compaction config alignment

Compaction config is now project-scoped (`.opencode/opencode.json`). Ownership facts:
1. Compaction config source of truth is `.opencode/opencode.json`, not plugin settings or conversation session settings.
2. Locale keys for `autoCompactionEnabled` and `compactionReservedTokens` per-session overrides have been removed; new project-scoped compaction keys were added under `settings.conversation.compaction.*`.
3. Manual `session.summarize()` remains a per-session action, not managed by compaction locale keys.

## 2026-05-09 Session settings global defaults summary

The per-conversation session settings modal now displays read-only global-default summary rows. Locale additions under `chat.sessionSettings.modal`:

1. `globalDefaultsGroup`
2. `globalDefaultsDesc`
3. `summary.titleGeneration`
4. `summary.compaction`
5. `summary.projectLevel`
6. `summary.questions`
7. `summary.showAnswered`
8. `summary.hideAnswered`
9. `summary.rendering`
10. `summary.on`
11. `summary.off`
12. `summary.openSettings`

## 2026-06-06 Backend session detail and settings launcher

Backend session browser locale coverage expanded for inline detail mode and the Settings launcher:

1. `chat.backendSessions.detailTitle`, `detailLoading`, `detailMetadataUnavailable`, and `detailField.*` label metadata rows for id/backend/title/summary/timestamps/custom title/git branch/cwd/tag/file size.
2. `chat.backendSessions.detailTranscriptTitle`, `detailTranscriptNotice`, `detailTranscriptEmpty`, and `detailTranscriptCount` describe the full transcript panel.
3. `chat.backendSessions.previewNotice`, `viewDetails`, and `backToPreview` distinguish truncated preview mode from the full detail view.
4. `settings.claudeCode.sessionBrowser.launchName`, `launchDesc`, `launchButton`, and `browseOnlyNotice` power the Settings browse-only launcher.

## 2026-04-23 Conversation settings grouping

The main settings conversation section now uses nested blocks. Locale additions:
1. `settings.titleGeneration.groupDesc`
2. `settings.conversation.share.*`
3. `settings.conversation.display.*`
4. `settings.conversation.questions.*`
5. `settings.conversation.rendering.*`

## 2026-05-14 Conversation share settings

Project-scoped OpenCode share mode settings added locale keys under `settings.conversation.share.*`:

1. `projectNote` / `projectNoteDesc`
2. `mode.name` / `mode.desc`
3. `mode.manual` / `mode.auto` / `mode.disabled`
4. `saved` / `configUnavailable` / `saveFailed`

The tabbed settings layout also added `settings.conversation.tab.sharing`.

## 2026-05-14 Title generation wording

Title-generation labels now use user-facing names: "First message title" and "Smart title generation". The setting copy explains that smart generation waits for OpenCode first and only uses the backup model if OpenCode does not produce a title.

Additional session-settings summary copy explains the inherited title mode inside the per-conversation settings modal:
1. `chat.sessionSettings.modal.summary.titleGeneration.firstMessageDesc`
2. `chat.sessionSettings.modal.summary.titleGeneration.smartDesc`

The same wording now explicitly states that the backup title model is independent from OpenCode `small_model`.

## 2026-05-14 Security blocked commands wording

Security blocked command copy now explains that entries sync to OpenCode `permission.bash` deny patterns in the current project `.opencode/opencode.json`, not to an operating-system sandbox. Locale additions:

1. `settings.security.blockedCommands.syncUnavailable`
2. `settings.security.blockedCommands.syncFailed`

## 2026-04-23 Conversation compaction help modal

The conversation settings "project compaction" block now supports per-field help modals. Locale additions:
1. `settings.conversation.compaction.help.openDoc`
2. `settings.conversation.compaction.help.{whatItMeans|opencodeDefault|adjustmentEffect|moreNotes|tipsLabel}`
3. `settings.conversation.compaction.help.{auto|prune|tailTurns|preserveRecentTokens|reserved}.*`

## 2026-04-24 Settings dual-layout locale keys

New keys added for the tabbed settings layout:

- `settings.layoutMode.*` — layout mode dropdown labels (classic/tabbed)
- `settings.general.*` — General primary tab title, Basic/Language secondary labels, and classic-mode subgroup copy
- `settings.model.availability.desc` — now carries the old toggle-persistence explanation too, so the model availability header uses one merged sentence instead of two stacked descriptions
- `settings.language.tab.*` — language tab labels
- `settings.server.tab.*` — server secondary tab labels (connection/auth/status)
- `settings.model.tab.*` — model secondary tab labels (common/projectConfig/availability/tools)
- `settings.conversation.tab.*` — conversation secondary tab labels (title/compaction/display/questions/rendering)
- `settings.agents.tab.*` — agents secondary tab labels (default/catalog/editor/workspace)
- `settings.commands.tab.*` — commands secondary tab labels (mode/editor/catalog)
- `settings.plugins.tab.*` — plugins secondary tab labels (overview/global/projectDirectory/omo)
- `settings.security.tab.*` — security secondary tab labels (config/permissions/safety)
- `settings.ui.tab.*` — UI secondary tab labels (general)
- `settings.style.tab.*` — style secondary tab labels (presets/background/layout/user/assistant/input/scrollbar/advanced)
- `settings.debug.tab.*` — debug secondary tab labels (general/modules/logs/actions)

## 2026-05-14 Model disclosure keys

- `settings.model.smallModel.*` — Common-tab OpenCode `small_model` picker labels and empty state
- `settings.model.defaultChatModel.desc` — clarifies that the default chat model is an OpenCodian request default, not an automatic write to OpenCode project `model`
- `chat.modelSelector.currentTabOverrideTitle` — model selector tooltip that identifies the current-tab send override
- `settings.model.visualEditor.structuredOptions*` — structured common `models.<id>.options` controls before the raw key/value editor
- `settings.user.tab.*` — user secondary tab labels (profile/prompt/tags)

## 2026-05-15 Conversation tabs toggle

Added `settings.ui.enableTabs.name` and `settings.ui.enableTabs.desc` for the UI settings toggle that hides/disables conversation tab controls while preserving conversations, history, titles, and background task state.

## 2026-05-16 Plugin management controls

Plugin settings locale keys now cover the install section plus per-entry enable/disable, uninstall, and delete controls.

## 2026-05-17 Command catalog card UI

Added `settings.commands.catalog.*` keys for the card-based command catalog: `searchPlaceholder`, filter pills (`filterAll/filterSkills/filterCommands/filterEnabled/filterDisabled`), source/status chips (`chip.skill/chip.command/chip.project/chip.md-command/chip.subtask/chip.hidden/chip.unavailable`), multi-select batch actions (`selectedCount/batchEnable/batchDisable`), visibility / selection aria labels (`visibility.toggle` / `selection.toggle`), and `noResults` empty state.

## 2026-05-21 Claude Code environment status

Added `settings.claudeCode.environment.status` so the Claude Code Runtime tab can show the authentication/environment row as an explicit read-only SDK environment state instead of an empty setting row.

Added `settings.claudeCode.enableFileCheckpointing.*`, `settings.claudeCode.includeHookEvents.*`, `settings.claudeCode.forwardSubagentText.*`, and `settings.claudeCode.agentProgressSummaries.*` for Claude Code SDK foundation switches. The copy explicitly says these are SDK wiring / diagnostic foundations and that stable rewind, hook authoring, and full subagent transcript UI are not complete.

Claude Code no longer uses the overloaded `settings.claudeCode.tab.mcpAdvanced` label. Its dense advanced controls are split into `settings.claudeCode.tab.tools` and `settings.claudeCode.tab.limits`; diagnostic stream controls now live in Capability Lab, while the runtime ecosystem summary sits in the Runtime tab as a read-only discovery surface.

## 2026-05-22 Capability Lab diagnostic panel

新增 `settings.debug.tab.capabilityLab` 和 `settings.capabilityLab.*` 系列键，为 Debug 分区的 Capability Lab 二级标签提供英文文案。覆盖能力矩阵、JSONL 历史浏览器、子代理浏览器、rewind dry-run 预览、结构化输出实验场、会话分叉诊断探针、会话恢复诊断探针、会话详情检查和发现状态九个诊断面板。新增 `settings.capabilityLab.fork.*` 与 `settings.capabilityLab.resume.*`，明确把 Claude `forkSession()` 和 SDK `resume` 仅作为 provider-owned diagnostic probes 暴露，而不是稳定的跨后端 fork / resume-at UI。所有面板标记为 ⚠️ DIAGNOSTIC / EXPERIMENTAL / NOT STABLE，不连接稳定设置持久化。

新增 `settings.capabilityLab.sessionDetail.*`，为 Session Detail Inspection 诊断探针提供英文文案。该探针展示 `adapter.getSession()` 返回的 raw session 字段，是 provider-owned diagnostic，不代表稳定的跨后端 session-detail object contract。

新增 `settings.capabilityLab.backendRouting.*`，为 Backend Routing Verification 诊断探针提供英文文案。该探针验证后端路由基础设施工作正常，显示活跃后端、已注册适配器和会话后端分布，是 provider-owned diagnostic，不代表稳定的后端路由产品界面。

2026-05-24 调整 `settings.capabilityLab.history.description`，明确 JSONL History Browser 只提供 diagnostic store 的 import / mirror / readback probes，不提供稳定 delete 或 restore 操作，避免把 Session Store 诊断证明误读成正式历史管理能力。

## 2026-05-23 Unshare backend guard

新增 `settings.conversation.share.sharedSessions.unshareUnavailable` 键，用于当活跃后端已切换出 OpenCode 时，阻止设置页已分享会话列表中的取消分享操作，并给出用户可理解的提示。

新增 `settings.conversation.projectConfig.openCodeOnly` 键，用于当活跃后端已切换出 OpenCode 时，阻止设置页项目级 compaction / share 配置控件和分享诊断按钮继续执行 OpenCode-only 写入或检查路径；这只是 stale-control 防护，不表示 Claude Code 支持这些项目级 OpenCode 配置。

新增 `settings.server.mcp.notice.openCodeOnly` 键，用于当活跃后端已切换出 OpenCode 时，阻止 MCP settings 中旧 toolbar / server-card callback 继续执行 OpenCode-only runtime 或 project-config 操作；这只是 stale-control 防护，不表示 Claude Code 支持 MCP authoring 或 runtime controls。

新增 `settings.server.notice.openCodeOnly` 键，用于当活跃后端已切换出 OpenCode 时，阻止 Server settings 中旧 connection/auth/status callback 继续改写 OpenCode server settings 或调用 OpenCode server runtime；这只是 stale-control 防护，不表示 Claude Code 使用 OpenCode sidecar 管理面。

新增 `settings.tools.notice.openCodeOnly`、`settings.formatter.notice.openCodeOnly` 和 `settings.security.notice.openCodeOnly` 键，用于当活跃后端已切换出 OpenCode 时，阻止 Tools、Formatter/LSP、Security settings 中旧 callback 或已打开的 tool detail modal 继续执行 OpenCode-only 项目配置、`.opencode/tools` 文件写入/删除、OpenCode permission 同步或 runtime restart 操作；这只是 stale-control 防护，不表示 Claude Code 支持这些 OpenCode-owned 设置面。

## 2026-05-22 Structured output transcript rendering

新增 `chat.structuredOutput.label` 键，为 Claude Code structured output 在普通聊天 transcript 中的可折叠渲染提供标签文案。


本轮 capability-hint 现使用三组相关键：`chat.input.capabilityHint.json` 继续表示 capability 本身，`chat.input.capabilityHint.jsonLabel` 用于 Claude Code backend 激活时在 composer footer 的 send 按钮左侧显示 `Structured reply`，`chat.input.capabilityHint.jsonTooltip` 用于悬浮说明“固定结构返回结果、点击不会自动发送”。

- 本轮 prompt-suggestions 新增 `settings.claudeCode.promptSuggestions.name` 和 `settings.claudeCode.promptSuggestions.desc` 键，用于 Capability Lab 诊断流控制区域的 toggle 说明。
- 2026-06-04 进一步收紧 `settings.claudeCode.promptSuggestions.desc` / `.stableDesc`：稳定设置文案现在明确写成“显示在最后一条 assistant 消息下方”，不再含糊写成 composer/input-area suggestion。
- 2026-06-04 继续新增 `settings.capabilityLab.proofs.promptSuggestions.*` locale proof keys，把 Prompt Suggestions readback proof 的按钮、运行中、标题、readback/fail 提示、模型状态、blocker note，以及新增的 `lifecycleBoundary` / `uiLifecycleEvidence` 全部收进英文 locale。这样 Capability Lab proof 会明确写出“next query or restarted session only / active sessions do not update live”，并把聊天侧 supporting evidence 限定为 session-scoped chip、new-turn/backend-stop clear、click-insert-only，而不是把这些 UI 现象误写成 SDK behavior pass。

- 2026-06-04 stable settings 清理：`promptSuggestions.desc` 从 smoke-report 语气改为干净的用户面向文案（"Show follow-up suggestions after each assistant reply"），`stableDesc` 同步保留作向后兼容；稳定设置 UI 已不再引用 `stableDesc`，改用 `desc`。
- 2026-06-06 Prompt Suggestions 分类提升：`promptSuggestions.boundaryNotice` 从 "Readback only" 更新为 "Live verified"，反映整体能力已通过 live proof。`proofs.promptSuggestions.boundary` 文案更新为明确标注整体能力已 live-verified，probe 本身是 readback supporting evidence。矩阵行 `runtimeProof` 从 `'readback'` 晋升为 `'pass'`。
- 2026-06-06 Sandbox 审计与边界收紧：`sandbox.boundaryNotice` 更新为更精确的 readback 边界——补充 SDK `failIfUnavailable` 默认行为、无 init 事件/工具元数据/stderr 信号可确认激活、`CLAUDE_CODE_SANDBOXED` 环境变量仅限 assistant-worker 路径。分类保持 `readback`（完整 SDK 路径已追踪，无可观测信号）。
- 2026-06-06 Debug File 分类提升：新增 `runDebugFileLiveProbe()` live probe——创建临时目录、设置 debugFile 到临时路径、运行真实诊断查询、检查 CLI 子进程是否在共享文件系统上创建了非空文件。矩阵行 `runtimeProof` 从 `'readback'` 晋升为 `'pass'`。原有的 `runDebugFileReadbackProbe()` 保留为 supporting evidence。稳定设置 `debugFile.desc` / `debugFile.boundaryNotice` 同步更新为 live-verified 语义；Capability Lab 的 readback/live proof 文案改走 `settings.capabilityLab.proofs.debugFile.*` / `settings.capabilityLab.proofs.debugFileLive.*` locale keys。新增 `DebugFileLiveProbeResult` 类型和 `_diagnosticDebugFile` 请求覆盖字段。
- 2026-06-06 Task Budget / Load Timeout 审计硬化：`taskBudget.boundaryNotice` 更新为 source-backed readback 边界——SDK 以 `--task-budget` CLI 标志传递、CLI 作为 `output_config.task_budget` + beta header `task-budgets-2026-03-13` 发送、模型用作行为 pacing（非硬性截止）、没有结构化 enforcement 信号。`taskBudget.desc` 也同步收紧为 pacing guidance。`loadTimeoutMs.boundaryNotice` 更新为 source-backed readback 边界——SDK 仅在 `(resume || continue) && sessionStore` 时使用、超时包装器 `C4`（Promise.race + setTimeout）、没有 resume/continue 时超时代码永不执行；`loadTimeoutMs.desc` 也同步改成 sessionStore materialization 语义。两者保持 `readback`。
- 2026-06-06 Plan Mode Instructions 晋升：新增 `settings.capabilityLab.proofs.planModeInstructionsLive.*` 键（16 个 proof keys，覆盖中英双语）。与 System Prompt Live Proof 同模式：nonce 注入 + 计划权限模式强制 + 自动批准工具调用。Codex Test Vault 验证通过后，`settings.claudeCode.planModeInstructions.boundaryNotice` 也同步更新为“saved-value readback + same-capability live proof”的组合语义，不再停留在 readback-only 文案。新增 `_diagnosticPlanModeInstructions` 请求覆盖字段。
- 2026-06-06 Strict MCP Config 审计硬化：`strictMcpConfig.boundaryNotice` 更新为 source-backed readback 边界——SDK 以 `--strict-mcp-config` CLI 标志传递、实际验证位于编译后的 CLI binary、没有结构化信号确认严格验证是否已应用、插件侧 MCP adapter 静默丢弃结构性 malformed 条目。分类保持 `readback`。
- 2026-06-04 stable sharing/server wording 清理：新增 `settings.conversation.share.troubleshooting.summary`，并把 `settings.conversation.share.diagnostics.check` 改成更产品化的 “Check connectivity”；同时收紧 `settings.server.status.local*`、`settings.server.external.*`、`settings.server.conflict.*`、`settings.server.orphanRestarted.*`、`settings.server.status.refresh*` 与 `chat.serverStatus.{external,localManaged,localExternal}`，让 Sharing、Server > Status 和 chat header badge 都使用更稳定的用户语言，而不是 diagnostic-flavored wording。

# Chinese Locale

> **源码**: `src/i18n/locales/zh.ts`
> **状态**: [REVIEW]

## 概述

OpenCodian 的简体中文翻译表，导出 `zhTranslations` 静态对象。它覆盖插件设置、聊天交互、状态提示、帮助说明和 Liquid Glass 参数解释，是中文界面的主要文案来源。最近几轮先后扩展了会话设置弹窗分组布局相关键、项目级 compaction/share notice 键，以及主设置页 conversation section 的二级分组标题/描述键（会话标题、上下文压缩、会话分享、阅读与显示、提问交互、消息渲染）。本轮新增/扩展 `chat.sessionSharing.*` 与 `settings.conversation.share.sharedSessions.*` / `settings.conversation.share.diagnostics.*`，用于当前会话分享状态、分享禁用提示、分享失败归一化说明、分享诊断、已分享会话列表、公开数量、刷新、完整预览、复制链接和取消分享操作；其中新增 `settings.conversation.share.sharedSessions.previewEmpty`，用于区分“后端不可预览”和“会话暂时没有可预览消息”的中性空态。 同时保留 `settings.conversation.share.help.*`、`settings.security.blockedCommands.help.*` 与 `settings.projectConfigHelp.*`，用于会话分享模式和 `permission.bash` 帮助弹窗。

会话设置弹窗本轮还新增了 `chat.sessionSettings.modal.globalDefaultsGroup`、`globalDefaultsDesc` 和 `summary.*` 文案，用于 Display 分组下方的全局默认值摘要行与“打开设置”按钮。

本轮 cap-1 更新了 `settings.claudeCode.fallbackModel.desc`，加入 fallback 路径尚未经过运行时验证的诚实性提示，与 `ClaudeCodeBackendSettings` 类型接口上的 `@untested` 标记保持一致。

本轮新增 `chat.agentSelector.*` 键，供聊天输入框下方的主 Agent 下拉框使用，包括 trigger、轻量列表标题、OpenCode 默认值选项、default badge、description、加载/空态/失败状态以及选中 tooltip。

最近一轮还重写了 `settings.security.*` 相关文案：把原先容易让人误以为是上游原生“权限模式”的 wording，改成 **OpenCodian 权限模板 + 配置摘要** 语义，并补齐了 security section 的重启 tooltip / notice 键。

2026-04-24 的这一轮还补了一组 `settings.commands.*` / `settings.quickNav.commandsDesc` 文案，把 Commands settings 的说法对齐到当前 slash runtime truth：仅项目配置的 command 只是“已写入项目配置、等待 runtime 暴露”的草稿，skill mode 只改变 `/skill` 与 `/skills <skill>` 的入口形态，而命令级 `Temperature` / `Top P` 则用“隐藏辅助代理”的大白话来解释背后的实现。

同一天的后续 UI 微调还新增了 `settings.agents.editor.group.*` 文案，并把 `settings.agents.catalog.desc` 改成正向可见性语义，明确说明 agent catalog 中的子代理开关现在是 **开 = 在 `@` 菜单显示 / 关 = 隐藏**。

当前 A4 agent-surface 收尾还补了一组 `settings.agents.expert.*`、`settings.agents.workspace.*`、`settings.agents.guard.*`、`settings.agents.editor.select.runtimeSection` / `systemBadge` 以及 `settings.agents.tab.workspace` 文案，把 system-agent 专家模式、Markdown workspace CRUD / 状态、runtime/system editor 标签与新的 workspace 二级标签都收进 locale，避免继续在 settings owner 中硬编码用户可见文本。

2026-04-25 新增 `settings.server.tab.mcp` 和 `settings.server.mcp.*` 系列键，为早期 `Server > MCP` 设置标签页提供 MCP 服务器概览、状态徽章和刷新操作的中文文案。

同日 M2 继续扩展 `settings.server.mcp.*` 键空间，新增 MCP 操作按钮（连接 / 断开 / 认证 / 清除认证）、新增服务器表单（本地 / 远程类型切换、命令 / 环境变量 / URL / 请求头 / OAuth 等字段）、校验错误（nameRequired / nameDuplicate / commandRequired / urlRequired / urlInvalid / timeoutPositive / emptyKey）和操作反馈通知（added / addFailed / actionFailed）对应的中文文案。

2026-04-26 的 MCP 设置页布局收口又补了一组 `settings.server.mcp.add.group.*` 和 `settings.server.mcp.add.type` 文案，用于把新增服务器表单整理成 `基础信息` / `连接配置` / `OAuth` 分组卡片，并把原先直接借标题承载的类型切换改成独立 `类型` 字段标签。随后 MCP management panel 又新增 `action.monitor/edit/delete`、`runtimeSwitch.*`、`ownership.*`、`editor.*`、`details.*`、`delete.confirm` 和项目配置增删改通知，用于明确区分运行时真相与项目配置真相。

同日 F2 新增 `settings.formatter.*` 和 `settings.quickNav.formatterDesc` 系列键，为“格式化工具和语言服务”一级设置页提供概览（runtime status / summary cards / detected formatter table）、配置（mode switch）和模式切换通知的中文文案；后续导航修正把该一级标题与 quick-nav 描述对齐到 formatter + language server 双入口。

同日 F3 扩展 `settings.formatter.config.*` 键空间，新增内置格式化器编辑（builtin list / action dropdown / override fields for command/environment/extensions）、自定义格式化器 CRUD（add / save / delete / nameConflict）、高级 JSON 编辑器（format / reload / save / invalidJson）和运行时离线提示对应的中文文案。

本轮继续扩展 `settings.formatter.overview.formatterList.*`，新增已检测格式化器表格的本地搜索标签、占位符和无匹配空态文案，用于支持按名称 / 扩展名快速筛选运行时 formatter 列表。

本轮补齐 `settings.formatter.tab.formatter`、`settings.formatter.tab.lsp` 与 `settings.formatter.lsp.*` 键空间，覆盖 Formatter 页中语言服务概览、模式切换、内置/自定义 LSP 编辑器、初始化 JSON、环境变量和高级 JSON 编辑器的中文文案，避免中文运行时回退到裸 translation key。随后新增 `settings.formatter.help.*`，用于 formatter / LSP mode 行的帮助按钮、普通用户能理解的解释弹窗，以及官方 Formatter / LSP 文档链接标签。后续又新增 `settings.formatter.builtinSearch.*`，为内置 formatter / LSP 长列表的自定义模糊搜索框、状态筛选、占位符、aria label、清除按钮、计数 chip 和无匹配空态提供中文文案；本轮补充 `settings.formatter.notice.restartFailed`，用于项目 formatter/LSP 配置保存后本地 OpenCode 自动重启失败的中文提示。

2026-04-26 的导航重组又新增了 `settings.mcp.title`、`settings.mcp.tab.overview` 和 `settings.quickNav.mcpDesc`，因为 MCP 已提升为独立一级设置页，并在 classic 布局的 quick-nav 中单独露出。`settings.server.tab.*` 现在只描述剩余的服务器二级标签（连接 / 认证 / 状态）。

本轮新增 `settings.style.input.contextRing.*` 键，为输入区样式设置里的上下文圆环样式下拉框提供中文标签、描述和“经典圆环 / 刻度圆环”两个选项。

本轮还新增 `settings.style.input.fontGroup.*` 8 个键，为输入区英文字体 / 中文字体下拉框提供中文分组、标签、描述和默认选项文案。

本轮还新增 `agentMention.menu.*` 系列键（`loading`、`empty`、`noMatches`、`loadFailed`），为 agent mention 自动补全菜单提供独立的状态文案，与 slash command 菜单的 `slashCommand.menu.*` 键分离。

本轮还新增 `slashCommand.sourceBadge.command`，让聊天 slash menu 里的 runtime-backed 普通命令显示 `command` badge；旧的“运行时”文案保留给真正需要表达 runtime 来源的其他上下文。

本轮新增 `settings.commands.catalog.chip.builtin` 和 `slashCommand.sourceBadge.builtin`，为 settings catalog 和聊天 slash menu 中的内置命令提供“内置”badge 文案。

本轮新增 `slashCommand.menu.hint`，用于在 slash command 一级补全框顶部提示用户“斜杠命令仅在输入框开头输入时生效”。

本轮新增 `slashCommand.mdCommand.prefix.user` / `project`，为 `.opencode/commands/*.md` markdown command 来源标签预留中文文案。

本轮新增 `modifiedFiles.*` 键，为聊天界面的修改文件右侧面板提供标题、空状态、状态 badge 和 toggle tooltip 中文文案。

2026-05-11 还新增 `chat.tab.backToParent`，用于子会话 tab 激活时的“返回父会话”面包屑按钮文案；后续补充 `chat.tab.childOpenFailed`，用于子代理/子会话 tab 防御性打开失败时的通用 notice，避免误用最大标签数文案；并补充 `chat.fork.newTabDisabled`，用于禁用会话标签时解释 fork modal 为什么隐藏新标签目标。同日 AskQuestion Dock polish 新增 `chat.question.collapse` 与 `chat.question.expand`，作为 above-input QuestionDock 折叠/展开图标按钮的 aria label。

2026-05-13 新增 `settings.skills.loading` / `settings.skills.count`、`settings.tools.group.*.desc`、`settings.tools.custom.desc`、`settings.acp.customAgent`、`settings.acp.preset.desc` 和 `settings.acp.command.empty`，服务 Skills / Tools / ACP Agents 设置页的分组化布局、空态和命令摘要。同日随后继续扩展 `settings.skills.create.*`、`settings.skills.modal.*`、`settings.skills.validation.*`、`settings.skills.notice.*` 以及 `settings.agents.editor.skillTool.*` / `settings.agents.editor.skillPermission.*`，用于技能 CRUD、Markdown 编辑/预览、官方格式校验、单技能权限和 agent 级 skill 覆盖 UI；其中 validation 文案覆盖 skill name 模式、父目录匹配、允许字段、description 尖括号 / 长度以及 compatibility 长度。随后又新增 `settings.skills.permission.help.*`，用于结果导向地解释 allow / ask / deny、默认权限和单技能覆盖，并链接 OpenCode Skills 官方文档。之后补充 `settings.skills.permission.inheritGlobal`、`settings.skills.permission.desc`、`settings.skills.permission.globalStatus.*`、`settings.skills.itemPermission.inherit`、`settings.skills.itemPermission.desc` 和权限写入后的 restart notice 文案，让 Skills UI 明确区分继承全局、当前全局权限、技能默认加载权限和单技能覆盖，并提示配置写入 `.opencode/opencode.json` 后会重启本地 OpenCode 服务；单技能继承选项使用 “Follow default” / “跟随上方默认”，避免配置术语压过用户理解。随后补充 `settings.skills.delete.confirm`，用于列表行删除当前 vault 内项目技能前的确认，并补充 `settings.skills.source.plugin`，把 OpenCode 插件包 cache 注入的技能显示为“插件包”。本轮还补充 `settings.skills.notice.restartFailed`，用于项目技能文件保存/删除/刷新时重启本地 OpenCode 失败的提示；并新增 `settings.skills.tab.project` / `external`、`settings.skills.bulk.*`、`settings.skills.empty.project` / `external`，用于 Skills 设置页的“项目技能 / 外部技能”二级标签、批量权限、项目批量删除和分标签空态；后续布局整理新增 `settings.skills.external.*`，外部技能页保留刷新说明，批量权限下拉改为选择即应用，不再需要 `settings.skills.bulk.apply` 文案。本轮还新增 `settings.tools.custom.authoring.*`、`settings.tools.custom.create.*`、`settings.tools.custom.files.*`、`settings.tools.custom.source.*`、`settings.tools.custom.modal.*`、`settings.tools.custom.validation.*` 和 `settings.tools.custom.notice.*`，用于自定义工具文件 authoring：项目 `.opencode/tools` 新建/编辑/删除、全局 tools 只读展示、OpenCode 文档入口、源码校验和保存/删除通知。随后补充 `settings.tools.default.*`、`settings.tools.permission.inherit`、`settings.tools.permission.custom`、`settings.tools.custom.notice.restartFailed` 和工具权限重启通知文案，用于解释 `permission["*"]` 全局默认、OpenCode 默认值、单工具“跟随默认 / 覆盖 / 自定义规则”关系，以及权限或工具文件写入后本地服务自动重启。随后新增 `settings.plugins.detectedCount` 与 `settings.plugins.path.*`，用于插件来源目录的检测数量与路径状态 chip。

源码约 2050 行。

本轮新增 `slashCommand.undo.*`、`slashCommand.redo.*`、`slashCommand.new.*`、`slashCommand.share.*`、`slashCommand.unshare.*` 系列 i18n 键，为 5 个新增 synthetic builtin slash commands 提供 description、notice 和状态文案。

本轮新增 `slashCommand.init.description`、`slashCommand.review.description`、`slashCommand.help.description`，为 OpenCode 内置运行时命令提供介绍语翻译；文案与 OpenCode 源码中的实际 description 对齐（init: "初始化 AGENTS.md 设置向导"、review: "审查更改 [commit|branch|pr]，默认未提交更改"、help: "显示 OpenCode 帮助信息"）。同时更新 `settings.commands.editor.description.placeholder` 为中文占位符。

本轮维护 `settings.model.providerDirectory.*` 键，为 settings/model 目录中的 provider directory 诊断提供中文 summary 与 badge 文案。它只表达 `provider.list()` 的 connected / listed 辅助状态，并把 listed outside catalog 作为诊断计数呈现，不改变 `config.providers()` 驱动的服务器目录或可选模型。

本轮更新 `settings.general.tab.backend` 与 `settings.backend.*` 键，为 Backend Management 面板提供中文标题、默认 backend 下拉、已启用 backend 列表、Claude Code 可启用说明和启用状态标签；未来 backend 仍保留即将推出描述。

本轮还补充 `chat.empty.noBackend.*`、`chat.empty.backendOffline.*`、`chat.serverStatus.disabled` 与 `chat.serverPrompt.enableBackend`，让聊天区可以明确区分“尚未启用任何 backend”和“backend 已启用但当前离线”两类状态，而不是继续共用笼统的离线文案。

本轮更新 `settings.claudeCode.*` 键，为 Claude Code Phase 1/2 配置面板提供中文文案，包括 section 标题/描述、运行时 / 模型与思考 / 权限 / 上下文与来源 / 工具 / 限制等标签、runtime ecosystem 只读摘要、可执行文件路径、认证与环境提示、设置来源、项目来源文件可见性、下一次 query / 重启边界、权限模式、模型/备用模型、thinking/effort（含“特高”）、额外目录、allowed/disallowed tools、max turns、max budget、env 和运行时诊断；`claude-code` backend 已可在 Backend Management 中显式启用，但发送前仍需要官方 SDK 认证可用。本轮还补充 `chat.serverStatus.backendOffline` 和 `chat.serverStatus.openBackendSettings`，用于 Claude 等非 OpenCode backend 的 header 离线状态与 tooltip，避免继续写成 OpenCode server 文案。`chat.history.backendScope` 则用于 history dropdown 顶部显示当前 backend 的历史范围。

2026-05-24 新增 `settings.claudeCode.sdkStreamBoundary.*` 键，用于 SDK Foundations 中 hook/子代理 stream 开关前的诊断边界提示，明确这些设置只驱动诊断/实验事件流，不提供稳定 hook authoring 或完整子代理 transcript/progress UI。

2026-06-02 Continue 诊断 seam 又补了一组 `settings.capabilityLab.proofs.continue.*` 键，把 Continue proof 按钮、运行中提示、诊断边界说明、seed/continue 会话标签、yes/no 状态、pass/fail 文案和异常提示收进 locale，避免在 Capability Lab 继续硬编码新增诊断 UI 文案。

2026-06-04 继续新增 `settings.capabilityLab.proofs.stderr.*` 键，把 Stderr Diagnostic proof 的按钮、运行中、标题、readback/fail 提示，以及“隔离诊断查询 / 不暴露持久 raw-log surface / 不写入文件”的诚实边界文案收进中文 locale。这样 Capability Lab 在中文界面下也能保留和英文一致的 readback 语义，不会退回硬编码英文。

2026-06-04 继续新增 `settings.capabilityLab.proofs.planModeInstructions.*` 键（18+ proof keys 覆盖中英双语），把 Plan Mode Instructions readback proof 的按钮、运行中、标题、边界文案、生命周期边界、option-wired/permission-mode/setting-value/sdk-option/sdk-value/builder-wiring-nuance/value-match 状态行，以及 readback/fail/thrown 提示全部收进中文 locale。取代之前的硬编码英文，使 Capability Lab 在中文界面下同样显示明确的 readback 语义和生命周期边界（“仅在下次查询或重启会话后生效。活跃会话不会实时更新。”）。

2026-05-27 新增 `settings.claudeCode.fallbackModel.boundaryNotice` 键，用于 Model & Thinking 标签中 fallback model 控件后的边界提示。文案说明备用模型的修改需要重启活跃 Claude Code 会话或开始新的查询，无法像主模型一样在已运行的流中实时更新。

本轮更新 `settings.claudeCode.model.desc` 和 `settings.claudeCode.fallbackModel.desc`，在主/备用模型描述中明确区分实时应用与仅重启生效的产品边界，并提示用户通过下方 quick-select 下拉框选择模型。新增 `settings.claudeCode.model.quickSelectName` / `quickSelectDesc` 和 `settings.claudeCode.fallbackModel.quickSelectName` / `quickSelectDesc` 键，用于 Model & Thinking 标签中模型/备用模型的 quick-select 下拉框；保留 `settings.claudeCode.modelCatalog.quickSelectPlaceholder` 作为下拉框的默认占位文案。旧的 `modelCatalog.*` 系列键（refreshButton、loading、empty、error、useAsMain、useAsFallback）已随分离式目录列表的移除而废弃。

本轮新增 `settings.claudeCode.runtimeCatalog.*`、`settings.claudeCode.accountInfo.*`、`settings.claudeCode.contextUsage.*` 和 `settings.claudeCode.fileReadback.*` 键，用于 Claude Code Runtime 标签中的只读运行时目录 / 账号信息 / 上下文用量 / runtime 文件回读界面。文案明确这是已脱敏或只读的支持证据：runtime catalog 只展示 SDK `supportedCommands()` / `supportedAgents()` 回读的 command/agent 名称、描述、argument hint、aliases/model，不执行 slash command、不创建 agent、不保存设置、不写 `.claude/**`；file readback 是 Settings UI 默认请求 `maxBytes: 4096`、encoding 使用 `utf-8`（adapter/SDK 可支持 `base64`），可展示 `absPath`、`contents`、`truncated`；这些 readback surface 不执行登录认证、不保存设置、不写文件、不写 `.claude/**`，也不证明 File Checkpoint / Rewind 或 Fallback Model 行为。相关键覆盖检查/加载中、空状态/不可用/失败、截断和回读摘要状态。

本轮还将 `chat.question.title` 调整为后端无关的“Agent 提问”，避免 Claude Code 的 AskUserQuestion / elicitation 复用统一 Question UI 时继续显示 OpenCode 专属标题。

2026-05-21 Debug IA 更新新增 `settings.debug.tab.plugin` / `opencode` / `claudeCode` / `export`、`settings.debug.modules.*` 来源分组说明、`settings.debug.modules.claudeCode.*` 和 `settings.debug.export.*` 文案，用于把插件内部诊断、OpenCode 后端诊断、Claude Code SDK 摘要诊断和导出/控制台帮助分开展示。后续 Claude Code 调试工作台又补充 `settings.debug.claude.*`，覆盖状态条、summary-only 隐私说明、模块总开关、六个日志通道、最近日志预览、复制当前 Claude 日志和复制 Claude 专属诊断报告。

## 导入关系

```text
上游: 无
下游: src/i18n/locales/index.ts, src/i18n/index.ts
```

## 核心类型 / 接口

```typescript
export const zhTranslations: Record<string, string> = {
  'plugin.name': 'OpenCodian',
  'plugin.description': '在 Obsidian 中使用 OpenCode AI 助手',
  'settings.server.title': '服务器',
  'settings.server.mode.name': '连接模式',
  // ... 约 400+ 个键
};
```

## 核心逻辑

### 中文文案实现

该文件为英文键空间提供中文对应值，供 `setLocale('zh')` 后的全部界面使用。

2026-06-04 同步收紧 `settings.claudeCode.planModeInstructions.lifecycleNotice`：稳定 Settings 中文文案不再只写“下次查询或重启后生效”，而是明确补出 active-session 边界，说明无法 live 更改正在运行中的会话。
2026-06-04 新增 `settings.capabilityLab.proofs.taskBudget.*` 键（17 个 proof keys，覆盖中英双语），把 Task Budget 回读证明的按钮、运行中、标题、诊断 readback 边界、生命周期边界、option-wired/setting-value/sdk-option/sdk-total/total-match 状态行，以及 readback/fail/thrown 提示全部收进中文 locale。这样 Capability Lab 在中文界面下也能一致表达 `@alpha`、active-session 不会实时更新，以及“仅验证 settings→SDK option mapping”的诚实边界。
2026-06-04 继续新增 `settings.capabilityLab.proofs.toolAliases.*` 键（17 个 proof keys，覆盖中英双语），把 Tool Aliases 回读证明的按钮、运行中、标题、诊断 readback 边界、生命周期边界、option-wired/setting-empty/sdk-option/sdk-entry-count/defensive-copy/entries-match 状态行，以及 readback/fail/thrown 提示全部收进中文 locale，移除 Capability Lab 中该 proof 的硬编码英文。稳定 `settings.claudeCode.toolAliases.*` 文案本轮未改动，因为它已经匹配较新的 readback/lifecycle 诚实模式。
2026-06-04 继续新增 `settings.capabilityLab.proofs.sandbox.*` 键（22 个 proof keys，覆盖中英双语），把 Sandbox 回读证明的按钮、运行中、标题、诊断 readback 边界、生命周期边界、option-wired/3 个 setting 状态/SDK option presence/3 个 SDK 子状态/3 个 match 状态，以及 readback/fail/thrown 提示全部收进中文 locale，移除 Capability Lab 中该 proof 的硬编码英文。同步收紧 `settings.claudeCode.sandbox.boundaryNotice` 与 `.lifecycleNotice`，稳定 Settings 文案现在明确写出“仅为 readback”与 active-session 不会实时更新的边界。
2026-06-04 继续新增 `settings.capabilityLab.proofs.debug.*` 键（16 个 proof keys，覆盖中英双语），把 Debug 回读证明的按钮、运行中、标题、诊断 readback 边界、生命周期边界、option-wired/setting-value/sdk-option/sdk-value/value-match 状态行，以及 readback/fail/thrown 提示全部收进中文 locale，移除 Capability Lab 中该 proof 的硬编码英文。后续又把该 proof 的 `lifecycleBoundary` 收紧为更保守的“仅在下次查询时生效”，与既有 `settings.claudeCode.debug.lifecycleNotice` 保持一致，不额外发明“重启会话后生效”的已验证语义。
2026-06-03 同步了 `settings.claudeCode.planModeInstructions.desc` 与 `.boundaryNotice` 的中文文案：稳定设置面不再暗示插件层会按 `permissionMode` 决定是否写入该选项，而是明确区分 SDK 仅在计划权限模式下使用它，以及当前仍只是 settings→SDK option wiring 的 readback 证明。

### 帮助文案承载

除了普通 UI 标签外，这个文件还承载大量"解释型文案"，尤其是样式设置、主题背景与 Liquid Glass 参数的 plain-language help。

示例：
```typescript
'settings.style.input.liquidGlass.shuding.help.displacementScale':
  '这是最核心的"玻璃感强度"滑块。调高后，输入框后面的内容会被扭曲得更明显...',
```

### 翻译风格

- UI 标签：简洁、动词前置（如"发送消息"、"添加上下文"）
- 帮助文本：口语化、避免技术术语（如"调高后...会更明显"）
- 错误提示：明确、 actionable（如"请检查...后再试"）

## 关键方法

| 方法 / 导出 | 说明 |
|-------------|------|
| `zhTranslations` | 简体中文静态翻译表对象 |

## 数据流

不适用。运行时会在 `t(key)` 中按当前 locale 直接读取该字典。

```
setLocale('zh')
t('settings.server.started')
  → translations.zh['settings.server.started']  // "OpenCode 服务器已启动"
```

## 与其他模块的交互

- 被 [locales/index.md](./index.md) 聚合
- 被 [i18n/index.md](../index.md) 用于中文界面输出

## 配置项

无。

## 键前缀分布

| 前缀 | 数量级 | 说明 |
|------|--------|------|
| `settings.*` | 400+ | 设置界面（最大分组，含完整 debug logging 文案） |
| `chat.*` | 150+ | 聊天界面 |
| `plugin.*` | 2 | 插件基础信息 |

### 主要键域

- `settings.style.*` — 样式设置（含大量 Liquid Glass 参数说明）
- `settings.server.*` — 服务器设置（含帮助文本）
- `settings.model.*` — 模型设置
- `chat.context.*` — 上下文操作
- `chat.agentSelector.*` — composer 主 Agent 下拉框
- `chat.sessionSettings.*` — 会话级覆盖设置弹窗与保存结果提示（含 deferred backend apply notice）
- `chat.childSessionTree.*` — child-session tree header / open action / partial-graph 文案
- `chat.question.*` — 问题系统
- `chat.omo.*` — OMO 相关
- `agentMention.menu.*` — Agent mention 自动补全菜单状态文案（loading / empty / noMatches / loadFailed）

## 注意事项

- 中文文案应保持与英文键空间一一对应，不要单边新增键
- 该文件很长，修改时优先按前缀搜索已有键，避免重复定义或局部风格漂移
- 帮助文本通常比英文版本更长（中文表达更 verbose）
- 参数插值 `{param}` 与 `{{param}}` 在中文语境中同样适用，新增键需保持与英文表相同的占位符名称
- 保持与英文表键顺序一致，便于 diff 对比

## 说明型长文本组织

文件中的长文本主要分为：

1. **帮助文本**（`*.help.*`）: 多段落解释，用 `\n` 分隔
2. **描述文本**（`*.desc`）: 单行补充说明
3. **通知文本**: 带参数的提示信息
4. **选项标签**: 下拉菜单、单选按钮选项

## 同步检查清单

修改本文件时，请确保：
- [ ] 键名与 `en.ts` 完全一致
- [ ] 参数占位符 `{xxx}` / `{{xxx}}` 数量和名称一致
- [ ] 新增键同时在 `en.ts` 添加
- [ ] 帮助文本风格统一（口语化、第二人称）

## 2026-04-23 压缩配置对齐

压缩配置已改为项目级（`.opencode/opencode.json`）。Ownership facts:
1. 压缩配置真相源为 `.opencode/opencode.json`，而非插件设置或会话设置。
2. 会话级 `autoCompactionEnabled` / `compactionReservedTokens` locale 键已移除；新增项目级 `settings.conversation.compaction.*` 键。
3. 手动 `session.summarize()` 仍为 per-session 操作，不由本 locale 管理。

## 2026-05-09 会话设置全局默认摘要

会话级设置弹窗现在展示只读的全局默认值摘要行。`chat.sessionSettings.modal` 下新增：

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

## 2026-04-23 Conversation settings grouping

主设置页的 conversation section 现在拆成多层级 block。Locale 侧新增：
1. `settings.titleGeneration.groupDesc`
2. `settings.conversation.share.*`
3. `settings.conversation.display.*`
4. `settings.conversation.questions.*`
5. `settings.conversation.rendering.*`

## 2026-05-14 会话分享设置

项目级 OpenCode share mode 设置新增 `settings.conversation.share.*` 键：

1. `projectNote` / `projectNoteDesc`
2. `mode.name` / `mode.desc`
3. `mode.manual` / `mode.auto` / `mode.disabled`
4. `saved` / `configUnavailable` / `saveFailed`

Tabbed 设置布局同步新增 `settings.conversation.tab.sharing`。

## 2026-05-14 Title generation wording

标题生成相关文案现在使用面向用户的名称：“首条消息标题”和“智能标题生成”。设置说明会解释智能标题会先等待 OpenCode 自动命名，只有在 OpenCode 没有生成标题时才使用备用模型。

会话设置弹窗中的全局默认摘要也新增标题模式说明：
1. `chat.sessionSettings.modal.summary.titleGeneration.firstMessageDesc`
2. `chat.sessionSettings.modal.summary.titleGeneration.smartDesc`

同一组文案现在也明确：备用标题模型独立于 OpenCode `small_model`。

## 2026-05-14 Security blocked commands wording

Security blocked commands 文案现在明确说明条目会同步到当前项目 `.opencode/opencode.json` 的 OpenCode `permission.bash` deny pattern，而不是操作系统级沙箱。Locale 侧新增：

1. `settings.security.blockedCommands.syncUnavailable`
2. `settings.security.blockedCommands.syncFailed`

## 2026-04-23 Conversation compaction help modal

会话设置里的“上下文压缩（项目级）”现在也支持按字段打开帮助弹窗。Locale 侧新增：
1. `settings.conversation.compaction.help.openDoc`
2. `settings.conversation.compaction.help.{whatItMeans|opencodeDefault|adjustmentEffect|moreNotes|tipsLabel}`
3. `settings.conversation.compaction.help.{auto|prune|tailTurns|preserveRecentTokens|reserved}.*`

## 2026-04-24 Settings dual-layout locale keys

New Chinese keys added for the tabbed settings layout:

- `settings.layoutMode.*` — 布局模式下拉选项（经典/标签）
- `settings.general.*` — 通用一级标签标题、基础/语言二级标签，以及 classic 模式分组文案
- `settings.model.availability.desc` — 现在合并了原先 toggle 持久化说明，模型可用性头部改成一条合并文案，不再上下两句分开显示
- `settings.language.tab.*` — 语言标签页标签
- `settings.server.tab.*` — 服务器二级标签（连接/认证/状态）
- `settings.model.tab.*` — 模型二级标签（常用/项目配置/可用性/工具）
- `settings.conversation.tab.*` — 对话二级标签（标题/压缩/显示/提问/渲染）
- `settings.agents.tab.*` — 代理二级标签（默认/目录/编辑器/workspace）
- `settings.commands.tab.*` — 命令二级标签（模式/编辑器/目录）
- `settings.plugins.tab.*` — 插件二级标签（概览/全局/项目目录/OMO）
- `settings.security.tab.*` — 安全二级标签（配置/权限/安全）
- `settings.ui.tab.*` — UI 二级标签（通用）
- `settings.style.tab.*` — 样式二级标签（预设/背景/布局/用户/助手/输入/滚动条/高级）
- `settings.debug.tab.*` — 调试二级标签（通用/模块/日志/操作）

## 2026-05-14 模型完全披露文案

- `settings.model.smallModel.*` — Common 标签中的 OpenCode `small_model` 选择器文案与空态
- `settings.model.defaultChatModel.desc` — 说明默认聊天模型只是 OpenCodian 请求默认值，不会自动写入 OpenCode 项目级 `model`
- `chat.modelSelector.currentTabOverrideTitle` — 聊天模型选择器 tooltip，用于说明当前选择是当前标签发送覆盖
- `settings.model.visualEditor.structuredOptions*` — 原始 key/value 编辑器前的常见 `models.<id>.options` 结构化控件文案
- `settings.user.tab.*` — 用户二级标签（档案/提示词/标签）

## 2026-05-15 会话标签开关

新增 `settings.ui.enableTabs.name` 和 `settings.ui.enableTabs.desc`，用于 UI 设置里的“启用会话标签”开关。该文案说明禁用标签只隐藏/禁用标签控件，不清空会话、历史记录、标题或后台任务状态。

## 2026-05-16 插件管理控制

插件设置文案现在覆盖安装区，以及每个插件条目的启用/禁用、卸载和删除控制。

## 2026-05-17 命令目录卡片 UI

新增 `settings.commands.catalog.*` 系列键，用于卡片式命令目录：搜索占位符 (`searchPlaceholder`)、筛选标签 (`filterAll/filterSkills/filterCommands/filterEnabled/filterDisabled`)、来源/状态芯片 (`chip.skill/chip.command/chip.project/chip.md-command/chip.subtask/chip.hidden/chip.unavailable`)、多选批量操作 (`selectedCount/batchEnable/batchDisable`)、可见性 / 选择 aria 文案 (`visibility.toggle` / `selection.toggle`) 和无匹配空态 (`noResults`)。

## 2026-05-18 模型可用性批量按钮文案

`settings.model.availability.enableAllProviders` / `disableAllProviders` 的中文文案去掉“一键”，改为更短的“启用所有提供商 / 禁用所有提供商”，配合模型可用性工具行的同排布局。

## 2026-05-21 Claude Code 设置与状态文案

`settings.claudeCode.*` 现在覆盖 Runtime、Model & Thinking、Permissions、Context & Sources、Tools、Limits，以及 Runtime 标签里的只读 runtime ecosystem 摘要等 Claude Code 设置文案，包括 allowed/disallowed tools、max turns、max budget、env 等 SDK options UI。新增 `settings.claudeCode.environment.status`，让 Runtime 标签里的认证/环境行显示明确的只读 SDK 环境状态，而不是空设置行；新增 `chat.serverStatus.backendConnected`，用于 Claude Code 等非 OpenCode backend 的 header 状态文案，避免继续复用 OpenCode server/remote wording。

新增 `settings.claudeCode.enableFileCheckpointing.*`、`settings.claudeCode.includeHookEvents.*`、`settings.claudeCode.forwardSubagentText.*` 和 `settings.claudeCode.agentProgressSummaries.*`，用于 Claude Code SDK foundation 开关。文案明确这些只是 SDK wiring / diagnostic foundation，不把 stable rewind、hook authoring 或完整 subagent transcript UI 包装成已完成。

Claude Code 不再使用过载的 `settings.claudeCode.tab.mcpAdvanced` 标签；高级项拆分为 `settings.claudeCode.tab.tools` 和 `settings.claudeCode.tab.limits`，诊断流控制迁移到能力实验室，而 runtime ecosystem 摘要留在 Runtime 标签作为只读发现表面。

2026-05-23 继续新增并维护 `settings.claudeCode.mcpRuntime.*` 键，用于 Claude Code Tools 标签里的 MCP runtime 状态和刷新按钮；新增 `settings.claudeCode.mcpRuntime.loadedWithNames`，在 adapter 暴露 server names 时只读显示名称。2026-06-01 继续扩展同一键空间，新增 `inspectButton`、`statusLoading`、`statusUnavailable`、`statusFailed`、`statusEmpty`、`statusSummary`、`statusTools`、`statusNoTools` 和 `statusServerInfo`，用于 SDK `mcpServerStatus()` runtime readback。文案明确该操作只读取 runtime status，不写入 `.claude/mcp.json`。

同日继续新增并维护 `settings.claudeCode.runtimeEcosystem.*` 键，用于 Claude Code 运行时标签中的只读 runtime plugins / skills / agent definitions 摘要。文案明确这是 adapter runtime-only options 的状态披露，不提供 skills/plugins/agent-definition authoring。

本轮继续扩展 `settings.claudeCode.runtimeEcosystem.*` 键空间，新增 `agentDefinitions.empty` / `loaded` / `single`，用于 settings 运行时标签中的只读 runtime agent definitions 摘要，与 plugins / skills 摘要对齐显示。文案明确这是 adapter runtime-only `agent` / `agents` options 的状态披露，不提供 agent authoring。

本轮更新 `settings.claudeCode.env.desc`，在环境变量描述中加入 POSIX 键名规范提示和未运行时验证的诚实性声明，与 `ClaudeCodeBackendSettings` 类型接口上的 `@untested` 标记保持一致。

本轮更新 `settings.claudeCode.allowedTools.desc` 和 `settings.claudeCode.disallowedTools.desc`，移除过时的“尚未经过运行时验证”声明，改为在 Tools 标签通过 `settings.claudeCode.proofStatus.tools` 共享 notice 统一标注运行时回读已验证状态。`proofStatus.tools` 已更新为更明确的 readback-only 边界文案："回读已验证。Allowed Tools 是 pre-allow / auto-approve 快捷方式，不是可用性限制器。运行时证据确认零 enforcement：init catalog 始终未过滤（34 工具），canUseTool 在 SDK query() 模式下无效。如需确定性内置工具过滤，请使用 Restricted Built-in Tools。"

2026-05-29 本轮更新 `settings.claudeCode.proofStatus.limits`，从 readback 文案改为 behavior-verified 文案："运行时行为已验证。maxTurns 和 maxBudgetUsd enforcement 均已通过实时运行时证明确认（error_max_turns + error_max_budget_usd 信号已观测）。"，反映 Turn/Budget Limits 已从 `readback` 晋升为 `pass`。对应的 `data-proof-state` 从 `"readback"` 改为 `"pass"`。

2026-05-28 本轮更新 `settings.claudeCode.maxTurns.desc`、`settings.claudeCode.maxBudgetUsd.desc`、`settings.claudeCode.env.desc`，移除过时的“已连接但尚未经过运行时验证”文案；新增 `settings.claudeCode.proofStatus.tools`、`settings.claudeCode.proofStatus.limits`、`settings.claudeCode.proofStatus.env` 三个共享 proof-status notice 键，用于在 Tools、Model & Thinking、Runtime 标签中 compact 地展示运行时 proof 状态。`proofStatus.env` 已更新为 "设置→SDK 映射已验证（回读辅助证据）。实时行为验证（环境变量传播到 Claude/Bash 子进程，Layer 1-4）已在 Capability Lab 中确认。总体能力：已验证（pass）。"，反映 Environment Variables stable settings notice 是回读辅助证据，live behavior proof 已在 Capability Lab 验证（2026-06-02 truth-sync）。更新 `settings.claudeCode.fallbackModel.desc` 和 `settings.claudeCode.fallbackModel.boundaryNotice`，诚实标注“选项连接和回读已验证；当前 SDK 下自动回退行为尚未验证”。新增 `settings.claudeCode.proofStatus.fallbackModel`，用于 Model & Thinking 标签的 Fallback Model compact proof-status notice（`data-proof-state="readback"`），明确标注选项回读已验证但自动 fallback 行为未验证。2026-05-29 proof-status 从 `wiring` 晋升为 `readback`；行为 Blocker = SDK 不在 query boundary 验证 model 名称，无效主模型被接受无错误并回显相同无效字符串，未触发 fallback；fallback 是 overload-oriented，无法在本地模拟 real overload。

2026-06-04 新增 `settings.capabilityLab.proofs.systemPromptLive.*` locale keys，覆盖 System Prompt 实时行为证明按钮、运行中提示、标题、三段诚实边界文案、nonce/status/preview 标签，以及 pass/fail/thrown 提示，移除 Capability Lab 中这组 proof 的硬编码英文。同步更新 `settings.claudeCode.systemPrompt.boundaryNotice`：稳定设置页现在会明确说明 System Prompt 的 `pass` 依赖两类互补证据，而不是把诊断 live proof 误写成“当前保存字符串已经被直接 live 执行”的证明。

2026-05-28 SDK Foundations 诊断表面迁移：新增 `settings.claudeCode.diagnosticStreamMoved.title` / `.desc`，用于在稳定 SDK Foundations 标签中提示用户诊断流控制已迁移到能力实验室；新增 `settings.capabilityLab.diagnosticStreamControls.title` / `.description`，用于能力实验室中诊断流控制子区的标题和说明。保留原有的 `settings.claudeCode.includeHookEvents.*`、`settings.claudeCode.forwardSubagentText.*`、`settings.claudeCode.agentProgressSummaries.*`，因为这些设置键仍然有效，只是 UI 表面从稳定设置迁移到了诊断面板。

2026-05-28 文档更正：移除“`chat.input.placeholderJsonSuffix` 与后端感知输入框占位符已落地”的描述。当前实现并未新增该 i18n 键，也未在输入框占位符追加 `/json` 可发现性提示；discoverability 已通过 composer capability hint 落地（`chat.input.capabilityHint.jsonLabel` + `chat.input.capabilityHint.jsonTooltip`，Claude Code backend 对用户显示“结构化回复”，点击后底层仍插入 `/json `，OpenCode backend 不显示），且仍仅覆盖固定 schema trigger，不暗示任意 schema authoring。

## 2026-05-22 Capability Lab 诊断面板

新增 `settings.debug.tab.capabilityLab` 和 `settings.capabilityLab.*` 系列键，为 Debug 分区的"能力实验室"二级标签提供中文文案。覆盖能力矩阵、JSONL 历史浏览器、子代理浏览器、回退 dry-run 预览、结构化输出实验场、会话分叉诊断探针、会话恢复诊断探针、会话详情检查和发现状态九个诊断面板。新增 `settings.capabilityLab.fork.*` 与 `settings.capabilityLab.resume.*`，明确把 Claude `forkSession()` 和 SDK `resume` 仅作为 provider-owned 的诊断探针暴露，而不是稳定的跨后端 fork / resume-at UI。所有面板标记为 ⚠️ 诊断 / 实验 / 非稳定，不连接稳定设置持久化。

新增 `settings.capabilityLab.sessionDetail.*`，为会话详情检查诊断探针提供中文文案。该探针展示 `adapter.getSession()` 返回的原始 session 字段，是 provider-owned 诊断，不代表稳定的跨后端 session-detail 对象契约。

新增 `settings.capabilityLab.backendRouting.*`，为后端路由验证诊断探针提供中文文案。该探针验证后端路由基础设施工作正常，显示活跃后端、已注册适配器和会话后端分布，是 provider-owned 诊断，不代表稳定的后端路由产品界面。

2026-05-24 调整 `settings.capabilityLab.history.description`，明确 JSONL 历史浏览器只提供 diagnostic store 的导入、镜像和回读探针，不提供稳定的删除或恢复操作，避免把 Session Store 诊断证明误读成正式历史管理能力。

## 2026-05-23 取消分享后端守卫

新增 `settings.conversation.share.sharedSessions.unshareUnavailable` 键，用于当活跃后端已切换出 OpenCode 时，阻止设置页已分享会话列表中的取消分享操作，并给出用户可理解的提示。

新增 `settings.conversation.projectConfig.openCodeOnly` 键，用于当活跃后端已切换出 OpenCode 时，阻止设置页项目级 compaction / share 配置控件和分享诊断按钮继续执行 OpenCode-only 写入或检查路径；这只是 stale-control 防护，不表示 Claude Code 支持这些项目级 OpenCode 配置。

新增 `settings.server.mcp.notice.openCodeOnly` 键，用于当活跃后端已切换出 OpenCode 时，阻止 MCP settings 中旧 toolbar / server-card callback 继续执行 OpenCode-only runtime 或 project-config 操作；这只是 stale-control 防护，不表示 Claude Code 支持 MCP authoring 或 runtime controls。

新增 `settings.server.notice.openCodeOnly` 键，用于当活跃后端已切换出 OpenCode 时，阻止 Server settings 中旧 connection/auth/status callback 继续改写 OpenCode server settings 或调用 OpenCode server runtime；这只是 stale-control 防护，不表示 Claude Code 使用 OpenCode sidecar 管理面。

新增 `settings.tools.notice.openCodeOnly`、`settings.formatter.notice.openCodeOnly` 和 `settings.security.notice.openCodeOnly` 键，用于当活跃后端已切换出 OpenCode 时，阻止 Tools、Formatter/LSP、Security settings 中旧 callback 或已打开的 tool detail modal 继续执行 OpenCode-only 项目配置、`.opencode/tools` 文件写入/删除、OpenCode permission 同步或 runtime restart 操作；这只是 stale-control 防护，不表示 Claude Code 支持这些 OpenCode-owned 设置面。

## 2026-05-22 Structured output 会话渲染

新增 `chat.structuredOutput.label` 键，为 Claude Code structured output 在普通聊天 transcript 中的可折叠渲染提供中文标签文案。


本轮 capability-hint 现使用三组相关键：`chat.input.capabilityHint.json` 继续表示 capability 本身，`chat.input.capabilityHint.jsonLabel` 用于 Claude Code backend 激活时在 composer footer 的 send 按钮左侧显示“结构化回复”，`chat.input.capabilityHint.jsonTooltip` 用于悬浮说明“固定结构返回结果、点击不会自动发送”。

- 本轮 prompt-suggestions 新增 `settings.claudeCode.promptSuggestions.name`（提示建议）和 `settings.claudeCode.promptSuggestions.desc` 键，用于 Capability Lab 诊断流控制区域的 toggle 说明。
- 2026-06-04 进一步收紧 `settings.claudeCode.promptSuggestions.desc` / `.stableDesc`：稳定设置文案现在明确写成“显示在最后一条 assistant 消息下方”，不再笼统写成输入框区域建议。
- 2026-06-04 继续新增 `settings.capabilityLab.proofs.promptSuggestions.*` 这组中文 locale proof keys，把 Prompt Suggestions readback proof 的按钮、运行中、标题、readback/fail 提示、模型状态、blocker note，以及新增的 `lifecycleBoundary` / `uiLifecycleEvidence` 一起收进中文文案。这样 Capability Lab proof 会直接说明“仅在下次查询或重启会话时生效，活跃会话不会实时更新”，并把聊天侧 supporting evidence 限定为会话内 suggestion chip、新一轮或后端停止时清除、点击只插入不自动发送，而不会把这些 UI 现象误写成 SDK 行为已经 pass。

- 2026-06-04 stable settings 清理：`promptSuggestions.desc` 从 smoke-report 语气改为干净的用户面向文案（"在每条助手回复后显示后续建议"），`stableDesc` 同步保留作向后兼容；稳定设置 UI 已不再引用 `stableDesc`，改用 `desc`。
- 2026-06-04 stable sharing/server 文案清理：新增 `settings.conversation.share.troubleshooting.summary`，并把 `settings.conversation.share.diagnostics.check` 收口为“检查连接”；同时收紧 `settings.server.status.local*`、`settings.server.external.*`、`settings.server.conflict.*`、`settings.server.orphanRestarted.*`、`settings.server.status.refresh*` 与 `chat.serverStatus.{external,localManaged,localExternal}`，让 Sharing、Server > Status 和聊天头部状态 badge 都使用更稳定的用户语言，而不是 diagnostic 味太重的表述。

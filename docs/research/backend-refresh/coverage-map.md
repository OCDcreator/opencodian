# Coverage map — field families → source types → UI grouping

Purpose: account for EVERY UI-visible editable control of the six implemented backends, mapping each
field family to its source type and the settings UI group that renders it. Rows marked **wildcard** are
dynamic-schema controls (the field set is data-driven at runtime, not a fixed form).

Legend — Source types: `plugin-settings` (plugin data.json), `native-file` (backend-owned config file
edited through the backend's own service), `upstream-blob` (verbatim string validated server-side),
`app-server-routes` (state via backend process, not a file), `action` (login/OAuth/test buttons).

## claude-code

| Field family | Source type | UI grouping (settings tab) | Coverage |
|---|---|---|---|
| Runtime core (model/effort/thinking/permissionMode/settingSources/additionalDirs/systemPrompt/fallbackModel/autoTitle/outputStyle) | plugin-settings | Claude Code 主面板 | fixed rows (§A) |
| Tool policy (allowedTools/disallowedTools/restrictedBuiltinTools/toolAliases) | plugin-settings | Claude Code 工具组 | fixed rows |
| Limits (maxTurns/maxBudgetUsd/taskBudget) | plugin-settings | Claude Code 限制组 | fixed rows |
| Diagnostics (debug/debugFile/jsRuntime/loadTimeoutMs/strictMcpConfig/enableContext1mBeta/askUserQuestionPreviewFormat/includeHookEvents/forwardSubagentText/agentProgressSummaries/promptSuggestions/debugChannels/sessionTrace) | plugin-settings | Claude Code 诊断组 | fixed rows |
| Sandbox + sub-policies (12 fields) | plugin-settings | Permissions 面板 | fixed rows |
| env | plugin-settings | 环境组 | fixed rows |
| Provider presets (7 fields/preset) | plugin-settings → native-file projection (settings.json env) | Providers 面板 | structured rows (§E.4) |
| External settings common fields (9) | native-file (user/project/local) | Configuration 面板 common form | structured rows (§E.1) |
| External hooks (30 events × 5 handler types + matcher + common fields) | native-file | Configuration 面板 hooks builder | structured rows (§E.3) |
| External 全文件键 | native-file | Configuration 面板 advanced JSON textarea | **wildcard** |
| MCP servers | native-file (.mcp.json / settings mcpServers) via adapter | MCP adapter view（配置编辑不在 UI） | documented: read/probe only |
| Resources (commands/skills/agents markdown) | native-file | Resources 面板 | markdown editors |

## codex

| Field family | Source type | UI grouping | Coverage |
|---|---|---|---|
| Runtime (model/effort/sandboxMode/approvalPolicy/webSearchMode/networkAccessEnabled/additionalDirectories) | plugin-settings | Codex 主面板 | fixed rows (§A) + 热 mutators (§F) |
| executablePath / apiKey | plugin-settings | Codex 账户/连接组 | fixed rows |
| pricing (providerId/endpoint) | plugin-settings | Cost estimate 组 | fixed rows |
| sessionTrace | plugin-settings | Debug 面板 | fixed rows |
| Project config.toml (7 allowlisted keys) | native-file (<vault>/.codex/config.toml) | Codex 项目配置面板 | structured rows (§C) |
| config.toml 其余上游键 | native-file | **无 UI（forbidden/unknown 拒绝）** | documented deny, not wildcard |
| Plugins | app-server-routes (plugin/*) | Plugins 面板（browser/install/uninstall） | action rows |
| Resources (skills SKILL.md / agents *.toml) | native-file | Resources 面板 | markdown/toml editors |
| MCP servers 明细 + OAuth | app-server-routes | MCP detail modal | read + OAuth trigger, NOT editing |
| 全局 config.toml/auth.json | native-file (read-only summary) | Global summary 行 | read-only |

## pi

| Field family | Source type | UI grouping | Coverage |
|---|---|---|---|
| executablePath | plugin-settings | Pi 主面板 | fixed row (§A) |
| legacy defaults (provider/model/thinkingLevel) | plugin-settings | Pi 主面板 legacy 行 | fixed rows |
| native settings.json 51 fields (4 groups) | native-file (global/project settings.json) | Configuration 面板按 group 分表（model/execution/resources/advanced） | structured rows (§G) — **dynamic schema served by RPC** |
| advanced raw settings.json | native-file | advanced 组 raw editor | **wildcard** |
| models.json provider 级 (9 fields) | native-file (~/.pi/agent/models.json) | Providers 面板 provider editor | structured rows (§H) |
| models.json model 级 (13 fields/model) | native-file | Providers 面板 per-model details | structured rows |
| models.json 原生 JSON | native-file | Providers 面板 native textarea | **wildcard** |
| OAuth/API-key provider onboarding | native-file (models.json + auth storage) | Pi 主面板 account 组 | action + rows |
| MCP merge view (6 files) | native-file read-only | Pi MCP 行 | read-only documented |
| Workbench RPC (set_tools/get_tools/packages/login 等) | app-server-routes | PiWorkbenchModal | action rows（非 config 字段） |

## zcode

| Field family | Source type | UI grouping | Coverage |
|---|---|---|---|
| executablePath / model / thinkingLevel / mode | plugin-settings | ZCode 模型控件面板 | fixed rows (§A) + live catalog picker |
| inline completion model override | plugin-settings (inlineCompletionModelOverrides.zcode) | completion 组 + 通用 inline-edit 面板 | fixed row |
| 账户（desktop 行、bigmodel/zai 登录、状态） | action + native credentials file | ZCode 账户面板 | action rows (§F) |
| 共享个人 API provider (5 fields) | native-file（revision-guarded 共享配置） | ZCode 账户面板 provider 表单 | structured rows (§F) |

## dsh

| Field family | Source type | UI grouping | Coverage |
|---|---|---|---|
| transport / executablePath / workingDirectory / testConnection | plugin-settings + action | DSH 连接组 | fixed rows |
| mcpServers + advanced | plugin-settings + actual native mount readback | DSH MCP 工作区 | 引导声明、cwd/timeout/instruction/reconnect、高级 JSON、同一草稿校验与历史；保存、会话应用、在线确认分别表达。ACP 0.2.2-rc.1 仅消费基础声明，高级值保留供 Native 使用；ACP cwd 固定为会话目录，启动失败策略固定为 true |
| nativeConfig sparse overrides | typed vault settings + controlled patch + native effective observations | 模型／权限／上下文／工具／高级 | 20 个真实 namespace 的不可变 descriptor 注册表；无公共字段的服务不造控件；详见 backend-fields-dsh.md 与 DshNativeConfiguration |
| model/provider defaults and current-session model/effort | vault defaults + native/ACP session catalog | 模型页／聊天工具栏 | 默认与会话覆盖分开；目录未就绪与未知已保存值区分；ACP 启动路由及新会话 effort 独立验收 |
| credentials/header references | native credential service | 模型／provider 表单 | 单向密码输入与 configured/source/writable 元数据；header 引用在可信启动内存中物化，不进库／patch／历史 |
| permissions/Plan/Todo/Jobs/subagents/terminal | Native per-method capability + owner-scoped command/event | 聊天控制、会话工作台／高级限额 | 新建会话 Plan 默认与当前会话状态分开；Jobs 接现有逐轮内联状态与持久完成通知；生命周期、代际和未知状态不混用；不翻 OpenCode 专属 Subagents 标记。官方隔离终端 bundle 通过可信条目上下文解析并验证真实 PTY，不能从顶层服务缺席推为上游不可接入 |
| extensions/hooks | proven managed profile + native PluginManager/SettingsForms CAS | 配置与扩展 | 实际扩展管理与进度／取消；已加载公共 schema 的受限 set/unset；保护核心/秘密/原生桥依赖；选中、实际加载与操作结果分别表达 |
| args / env | plugin-settings | DSH 连接页高级启动折叠区 | args textarea + env 键值/password 控件；高风险标记，重连生效；连接备份不扩大到秘密配置 |

2026-11-09 DSH 全量接入的实际证据单独记录于 `.impeccable/review/dsh-complete-integration-20261109/`：281 个具体路径的公开 schema／启动物化／离线 effective 配置逐项核对通过；Native 核心 Kimi 修复复审 PASS 只覆盖该报告指定范围。原 2032 构建的实机重连与发送控件缺陷已保留，后续源码仍需新构建、全量门禁、真实 Native／ACP 模型和最终视觉复验。历史六后端验收不能替代本轮 DSH 验收。

## opencode2

| Field family | Source type | UI grouping | Coverage |
|---|---|---|---|
| mode / executablePath / baseUrl / password | plugin-settings | Server 面板 | fixed rows (§A) |
| permissionMode | plugin-settings | Server 面板 | fixed row |
| configContent overlay | upstream-blob (OPENCODE_CONFIG_CONTENT) | Server 面板 config editor（ProjectConfigFileWatcher 冲突检测） | **wildcard**（上游 schema 见 §C，server-side 校验） |
| OpenCode 1 legacy project config (opencode.json) | retired | 不属于 opencode2 面板 | documented dormant |

## Gaps that remain (honest)

1. Pi `SETTINGS_FIELDS` anchors official 0.73.1; CLI 1.5.0 may add fields the form does not list (raw
   JSON editor covers them; `sdkVersion` is returned so lag is detectable, not hidden).
2. OpenCode 2 `providers`/`formatter`/`lsp`/`mcp` server leaf keys documented as families + wildcard —
   full leaf enumeration was not exhaustively extracted from typings.
3. Codex global `~/.codex/config.toml` full key universe is upstream-defined and only summarized
   (model + redacted base URL) — deliberately not a plugin editing surface.
4. ZCode native runtime settings (app-server side, e.g. its own persisted prefs) are not enumerable from
   the plugin — only `runtime/capabilities`-advertised model/mode surfaces are typed.
5. DSH 的 Native 远端 MCP 连接状态、货币／配额在当前公共接口缺少确认源；历史子代理若无当前进程匹配释放事件，其无排队工作状态保持未知。ACP 缺少 Native 专属控制/有效值 RPC 的字段明确列限制，不能用 Native 成功替代。已加载扩展只有实际公共 schema 且持久写入所有权通过时才可编辑。当前实机验收与最终独立审查见 DSH integration evidence，不以表单覆盖量代替验证。

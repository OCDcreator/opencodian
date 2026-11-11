# Claude Code backend — full field inventory

Sources: `src/core/types/settings.ts` (`ClaudeCodeBackendSettings`, lines 839-1040 + defaults 1205-1257),
`src/core/agents/backend/claude/ClaudeCodeOptionsBuilder.ts` (single audited mapping boundary),
`ClaudeCodeAdapter.ts`, `ClaudeSettingsSourceService.ts`, `ClaudeProjectProviderConfig.ts`,
UI `src/features/settings/backends/claude/*`.

生效方式 legend: 热 = next query/turn; 会话 = next new session; 重启 = plugin reload required.
All plugin fields persist in plugin `data.json` under `backendSettings.claudeCode`.

## A. Plugin settings fields (supported; wired through `buildClaudeCodeOptions`)

生效方式 default for this backend: adapter holds a live settings reference and rebuilds SDK options at
every query spawn, so a saved change reaches the next query/turn. Exceptions noted per row.

| 字段名 | 作用（一句行为） | 默认值 | 取值范围 | 生效方式 | 风险 | 备注（proof 状态） |
|---|---|---|---|---|---|---|
| `executablePath` | 覆盖 Claude CLI 可执行文件路径（PathResolver 用） | `''` (auto: bundled CLI → PATH) | 任意路径串 | 重启（解析发生在每次 spawn，但 bundled 路径在 main.ts 构造时注入；自定义路径每 query 重新解析——实际为热/重启混合，标 重启 保守） | 中 | ProcessResolver reads settings each spawn |
| `settingSources` | 决定 CLI 读取哪些设置文件层（user/project/local） | `['project']` | 子集 of `user/project/local`（去重） | 热（下一 query） | 中 | 影响外部 settings 合并面 |
| `permissionMode` | 设置权限模式（default/acceptEdits/bypassPermissions/plan） | `'default'` | 4 值枚举（auto/normal/dontAsk 归一化） | 热 | 高（bypassPermissions 绕过全部确认并置 `allowDangerouslySkipPermissions`） | |
| `thinking` | 思考模式 adaptive/disabled/fixed(budgetTokens) | `{type:'adaptive'}` | 3 形状；fixed budgetTokens>0（floor int） | 热 | 低 | fixed 映射为 SDK `enabled` |
| `effort` | 推理强度 | `'medium'` | low/medium/high/xhigh/max（minimal→low） | 热 | 低 | |
| `model` | 主模型 | `''` (SDK 默认) | 任意模型串 | 热（诊断覆盖可优先） | 中（成本） | |
| `fallbackModel` | 主模型不可用时的 fallback 模型 | `''` | 任意模型串 | 热 | 低 | readback-only：自动切换未本地证明（HTTP 529 难复现） |
| `additionalDirectories` | 追加可访问目录 | `[]` | 去重非空路径 | 热 | 中（扩大文件访问面） | |
| `env` | 传给 Claude 进程的环境变量 | `{}` | string→string | 热（Layer1-4 传播已验证） | 高（可注入 ANTHROPIC_* 等敏感变量） | 优先级 processEnv < domainEnv < settings.env |
| `providers` (`ClaudeProviderSettings`) | 项目级 Anthropic 兼容 provider 预设，应用时写 ANTHROPIC_BASE_URL/AUTH_TOKEN/HAIKU_MODEL + extraEnv | official preset（全空） | presets[], activePresetId, lastAppliedManagedEnvKeys, modelMigrationDone | 应用时写项目 settings 文件 → 下一会话 | 高（authToken 凭据；写入 .claude/settings.json） | managed env keys 常量 `CLAUDE_PROVIDER_MANAGED_ENV_KEYS` |
| `allowedTools` | 免确认自动放行的工具名 | `[]` | PascalCase 字母数字 | 热 | 高（跳过人工确认） | readback-only：运行时未见强制（canUseTool 在 query() 模式不生效） |
| `disallowedTools` | 从上下文中整体移除的工具名 | `[]` | PascalCase | 热 | 中 | 运行时已验证（init catalog 过滤确定生效） |
| `restrictedBuiltinTools` | 内置工具白名单（非空时替换 SDK tools 预设；MCP 不受限） | `[]` | PascalCase | 热 | 高（砍掉工具改变能力面） | 覆盖 `tools: preset` |
| `maxTurns` | 单 query 最大轮数 | `null`（无限） | 正整数 or null | 热 | 低 | 运行时验证 error_max_turns |
| `maxBudgetUsd` | 单 query 最大美元预算 | `null` | 正数 or null | 热 | 低 | 运行时验证 error_max_budget_usd |
| `taskBudget` | 任务级 token 预算（SDK @alpha） | `null` | 正数 or null | 热 | 低 | readback-only：仅 `--task-budget` CLI flag + output_config，无结构化 enforcement 信号 |
| `enableFileCheckpointing` | SDK 文件 checkpoint（rewind 用） | `false` | bool | 热 | 低 | @experimental：SDK bug #236，query() 模式从不产生 checkpoint |
| `includeHookEvents` | 流中包含 hook 生命周期事件 | `false` | bool | 热 | 低 | @diagnostic |
| `forwardSubagentText` | 子代理文本/思考块转发进主流 | `false` | bool | 热 | 低 | @diagnostic |
| `agentProgressSummaries` | 子代理周期性进度摘要 | `false` | bool | 热 | 低 | @diagnostic；0.3.319 文档补充：非心跳，最长延迟 5 分钟 |
| `promptSuggestions` | 每轮后请求“下一句建议” | `false` | bool | 热 | 低 | readback-only；首轮/plan/API 错误时可能抑制 |
| `debugChannels` | 产品调试通道开关（logging 路由） | standard preset | 通道 map | 热 | 低 | |
| `sessionTrace` | Claude 会话 trace 诊断设置 | enabled standard | enabled/consolePreset/consoleChannels/storageDirectory | 热 | 低 | 独立于 debugChannels |
| `sandbox` (嵌套见 §B) | 子进程 OS 沙箱及子策略 | enabled:false | 见 §B | 热 | 高（安全边界） | readback：OS 级隔离未独立验证 |
| `planModeInstructions` | plan 模式 system-reminder 注入的自定义指令 | `''` | 任意串 | 热（注释明说 next query or restarted session） | 中 | readback-only |
| `toolAliases` | 工具名别名映射（模型发出的名字→规范名） | `{}` | string→string（normalize 过滤） | 热 | 中 | readback-only |
| `askUserQuestionPreviewFormat` | AskUserQuestion 选项预览格式请求 | `''`（不请求） | `''/markdown/html` | 热 | 低 | readback-only；HTML 渲染被禁用（安全） |
| `debug` | 请求 CLI debug 日志 | `false` | bool | 热 | 低 | readback-only |
| `debugFile` | CLI debug 日志写文件路径 | `''` | 任意路径 | 热 | 中（隐式开启 debug；无插件侧路径校验） | |
| `strictMcpConfig` | MCP 配置严格校验（--strict-mcp-config） | `false` | bool | 热 | 低 | readback-only；插件侧已静默丢畸形条目，多数畸形到不了 CLI |
| `enableContext1mBeta` | 请求 1M 上下文 beta header | `false` | bool | 热 | 低（成本可能上升） | 仅 `context-1m-2025-08-07` 一个 beta；`betas` 选项 |
| `jsRuntime` | 指定 CLI JS runtime | `''`（自动） | `''/node/bun/deno`（→SDK `executable`） | 热 | 低 | readback-only：无运行时信号可确认实际 runtime |
| `loadTimeoutMs` | sessionStore.listSessions 超时（仅 resume+sessionStore 时使用） | `null`（SDK 默认 60000） | 正整数 or null | 热 | 低 | @alpha；诊断路径从不触发该代码 |
| `outputStyle` | 输出风格（经 SDK `settings.outputStyle`） | `''` | 串（内置 Default/Proactive/Explanatory/Learning 或自定义名） | 会话（官方：session start / `/clear` 后生效；活跃/恢复会话保持旧 prompt） | 低 | live-proof 边界已记录 |
| `systemPrompt` | 追加到 claude_code preset 系统提示（append-only） | `''` | 任意串 | 热 | 中（影响模型行为基调） | preset+append 形状；0.3.267+ 首请求固化 append——插件已置 `snapshot:false` 保持每轮新鲜渲染 |
| `autoTitle` | 新会话是否让 SDK 自动生成标题 | `true` | bool | 会话（下一新会话；existing 不受影响） | 低 | false 时传 "New Claude Code chat" 显式标题 |
| `pricingProviderId` / `pricingEndpoint` | 计价 provider 别名/端点标识（仅算费用，不改流量） | `''` | 串 | 热（仅 UI 计算） | 低 | 不转发给 Claude Code |

### B. `sandbox` 子字段（`ClaudeCodeSandboxSettings`）

| 字段名 | 作用 | 默认值 | 取值范围 | 生效方式 | 风险 | 备注 |
|---|---|---|---|---|---|---|
| `sandbox.enabled` | 启用 OS 沙箱 | false | bool | 热 | 高 | |
| `sandbox.failIfUnavailable` | 沙箱不可用时失败而不是静默放行 | false | bool | 热 | 高（false=沙箱缺失时允许非沙箱执行） | 显式双向发送：SDK 缺省 fail-closed |
| `sandbox.autoAllowBashIfSandboxed` | 沙箱内 Bash 自动放行 | false | bool | 热 | 中 | |
| `sandbox.excludedCommands` | 永久绕过沙箱的命令 | `[]` | string[] | 热 | 高 | |
| `sandbox.allowUnsandboxedCommands` | 允许模型请求沙箱外执行（dangerouslyDisableSandbox 逃生口） | true | bool | 热 | 高 | false 时彻底禁用逃生口 |
| `sandbox.filesystem.allowWrite/denyWrite/denyRead` | 文件系统写/读策略路径 | `[]`/`[]`/`[]` | string[] | 热 | 中 | 合并所有 settings scope |
| `sandbox.network.allowedDomains/deniedDomains` | 出网域名白/黑名单 | `[]`/`[]` | string[]（支持通配） | 热 | 中 | denied 优先 |
| `sandbox.enableWeakerNestedSandbox` | 无特权 Docker 弱沙箱（Linux/WSL2） | false | bool | 热 | 高（降低安全性） | |
| `sandbox.enableWeakerNetworkIsolation` | (macOS) 沙箱内允许系统 TLS trust service | false | bool | 热 | 高 | Go 工具 + MITM 代理需要 |
| `sandbox.ripgrep.command/args` | 自定义 ripgrep 二进制 | `''`/`[]` | 串/串[] | 热 | 低 | |

### C. Hidden plugin fields — SDK options supported but intentionally UNEXPOSED in plugin UI

From `ClaudeCodeBackendSettings.sandbox` doc comment (settings.ts:906-929) — these are official SDK
fields the plugin classifies **unsupported (deliberately)** for general users; they remain configurable
via external managed/settings files:

`filesystem.allowRead`, `filesystem.allowManagedReadPathsOnly` (managed-only; "no effect via SDK options"),
`network.allowManagedDomainsOnly` (managed-only), `network.allowUnixSockets`, `network.allowAllUnixSockets`,
`network.allowLocalBinding`, `network.allowMachLookup`, `network.httpProxyPort`, `network.socksProxyPort`,
`ignoreViolations` (hides sandbox-escape evidence), `bwrapPath` (managed-only), `socatPath` (managed-only).

Additional SDK Options wired only from non-settings inputs (host-owned, not user settings):
`canUseTool`, `permissionPrompts` ('host'|'none' — SDK >= 0.3.263), `onElicitation`, `onUserDialog` +
`supportedDialogKinds` (SDK >= 0.3.2xx `request_user_dialog`), `hooks`, `sessionStore` + `sessionStoreFlush`
('batched'|'eager'), `outputFormat`, `persistSession`, `plugins`, `skills` ('all'|list), `agent`, `agents`,
`resume`/`resumeSessionAt`/`resumeDropsTurn` (0.3.319 新增类型字段，插件已在 OptionsBuilder 支持传参),
`forkSession`, `continue`, `sessionId`, `title`, `stderr`, `abortController`, `spawnClaudeCodeProcess`,
`mcpServers` (via `ClaudeCodeMcpConfigAdapter`), `includePartialMessages` (恒 true).

### D. External (settings-file) contract — read when included in `settingSources`

See `external-config-inventory.md` for the file list, write paths, and precedence
(managed 400 > cliArgs 300 > local 200 > project 100 > user 0; `CLAUDE_SETTINGS_PRIORITY` in
`ClaudeSettingsSourceService.ts:54`). Plugin-owned editors write `~/.claude/settings.json` (global,
allowlist-confined), `<vault>/.claude/settings.json` (project), `<vault>/.claude/settings.local.json`
(local); managed sources (managed-settings.d drop-ins, MDM) are read-only and never writable.

## E. External settings-file editor — structured fields (Claude Configuration section)

UI: `SettingsClaudeConfigurationSection`（scope selector user/project/local + 每文件编辑器；
`ClaudeSettingsCommonFieldsPresenter` 渲染 9 个受控字段 + 高级 raw JSON textarea + hooks builder +
历史/归档）。Write path: revision-guarded secure write via `ClaudeSettingsSourceService`（confined to
the slot's own `.claude` root; global `~/.claude/settings.json` writable only via allowlist per ADR-0001;
managed sources never writable）。生效：**热（下一 query）** — CLI 按 `settingSources` 在每次会话/查询
读取；project/local 源修改对现有活跃会话的生效边界由 CLI 决定（settings 文件字段大多在会话启动时读，
标记为 会话 保守）。Evidence: `ClaudeSettingsCommonFieldModel.ts`（SDK-grounded，字段行引用 sdk.d.ts
行号 model@4066, permissions.defaultMode@4052）。

### E.1 Common fields form (`CLAUDE_SETTINGS_COMMON_FIELDS`)

| 字段名 | 作用 | 默认值 | 取值范围 | 生效 | 风险 | scope·证据 |
|---|---|---|---|---|---|---|
| `model` | settings 层默认模型覆盖 | 未设 | 任意串 | 会话 | 中 | user/project/local·sdk.d.ts:4066 |
| `permissions.defaultMode` | 默认权限模式 | 未设 | acceptEdits/auto/bypassPermissions/default/dontAsk/plan（options 枚举） | 会话 | 高 | user/project/local·sdk.d.ts:4052 |
| `permissions.allow` | 允许规则 | 未设 | string[]（规则串） | 会话 | 高 | 同上 |
| `permissions.ask` | 询问规则 | 未设 | string[] | 会话 | 中 | 同上 |
| `permissions.deny` | 拒绝规则 | 未设 | string[] | 会话 | 中 | 同上 |
| `env` | 环境变量注入 | 未设 | string→string record | 会话 | 高 | 同上 |
| `cleanupPeriodDays` | 会话清理期（天） | 未设 | 整数 ≥1（min:1） | 会话 | 中（数据保留） | 同上 |
| `respectGitignore` | 尊重 .gitignore | 未设 | boolean | 会话 | 低 | 同上 |
| `includeGitInstructions` | 注入 git 指令 | 未设 | boolean | 会话 | 低 | 同上 |

### E.2 Advanced raw JSON editor（wildcard）

任意 settings.json 键的整文档覆写（带 inline 诊断 + 历史/归档）。覆盖面 = 上游 settings.md 全集
（UNKNOWN keys 透传给 CLI 校验）。生效：会话。风险：随键而定（最高 高）。

### E.3 Hooks builder（`ClaudeSettingsHookSchema.ts`，SDK/官方文档锚定 cliVersion 2.1.204 证据）

| 家族 | 字段 | 取值范围 | 生效 | 风险 |
|---|---|---|---|---|
| 事件（30） | PreToolUse, PostToolUse, PostToolUseFailure, PermissionRequest, PermissionDenied, UserPromptSubmit, PostToolBatch, Stop, StopFailure, SessionStart, SessionEnd, Setup, Notification, SubagentStart, SubagentStop, PreCompact, PostCompact, ConfigChange, FileChanged, InstructionsLoaded, UserPromptExpansion, Elicitation, ElicitationResult, TeammateIdle, TaskCreated, TaskCompleted, WorktreeCreate, WorktreeRemove, MessageDisplay, CwdChanged | 枚举 | 会话 | 高（hook 执行任意命令） |
| matcher | 事件对应 matcher 支持（tool/free/enum/file-list/error-type/none；none=不支持 matcher 恒触发） | 按 `CLAUDE_HOOK_EVENT_CATALOG` | 会话 | 中 |
| handler 公共字段 | `type`(required), `if`, `timeout`(number), `statusMessage`；`once` 有意缺席（settings 文件中无效） | 见 per-type | 会话 | 中 |
| command | `command`(required string), `args`(string[]), `async`(bool), `asyncRewake`(bool), `shell`(bash\|powershell) | 枚举 shell | 会话 | 高 |
| http | `url`(required), `headers`(record), `allowedEnvVars`(string[]) | — | 会话 | 高 |
| mcp_tool | `server`(required), `tool`(required), `input`(json-object) | — | 会话 | 中 |
| prompt | `prompt`(required), `model`, `continueOnBlock`(bool) | — | 会话 | 中 |
| agent | `prompt`(required), `model` | — | 会话 | 中 |

内部/未知 handler 字段（rewakeMessage、rewakeSummary）有意不在 schema/UI 中（documented absence）。

### E.4 Provider preset editor（providers section）

`ClaudeProviderSettings.presets[]` 每项编辑器：`name`, `baseUrl`, `authToken`(password), `model`,
`fallbackModel`, `haikuModel`, `extraEnv`（key=value 多行）。Apply = 写入选中 scope 的 settings 文件
（managed env keys 换取/清理，revision-guarded）。生效：应用后 会话（settings 文件读取边界）。
风险：高（凭据 + 请求路由改写）。官方内置 preset `official` 为不可删除的还原目标。

### E.5 Resources editors（commands / skills / agents）

Markdown 源编辑器（`SettingsClaudeResourcesSection`）：project（`.claude/commands`、`.claude/skills/<n>/SKILL.md`、
`.claude/agents/<n>.md`）与 global-enabled（`~/.claude/...`，allowlist）可写；global-discovered 只读。
Preview = Obsidian MarkdownRenderer（仅 Markdown）。生效：会话（CLI 启动时扫描）。风险：命令/代理
Markdown 注入指令（中—高）。`user` 源在设置中禁用 resource 编辑时明确提示。

## F. Coverage of UI-visible editable controls (summary)

Every Claude UI control is either a §A/§B plugin-settings row, a §E structured field above, or an
explicitly documented wildcard (advanced JSON editor). Controls that are NOT fields: readback/probe
panels (Capability Lab, session browser), account info rows, debug-channel toggles (§A `debugChannels`
map covers them), MCP adapter views.

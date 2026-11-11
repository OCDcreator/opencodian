# Pi backend — full field inventory

Sources: `src/core/types/settings.ts` (`PiBackendSettings` 1042-1057 + `normalizePiBackendSettings`),
`src/core/agents/backend/pi/PiAdapter.ts`, `PiRpcClient.ts` (`PiLaunchOptions` 41-61, spawn at 145+,
`resolvePiSdkCli` package-identity guard), `PiSessionRuntime.ts` (launch per session at ~35-41),
`PiMcpConfigService.ts` (external MCP merge), `PiProtocol.ts` (`get_config` document shape),
UI `src/features/settings/backends/pi/*` (SettingsPiSection / SettingsPiProvidersSection /
SettingsPiConfigurationSection / PiWorkbenchModal).

生效方式 legend: 热 = next turn within a live session; 会话 = next session (process spawn); 重启 = plugin reload.
Plugin fields persist under `backendSettings.pi`. Pi spawns ONE RPC process per session — settings are read
at spawn, so almost everything is 会话-scoped.

## A. Plugin settings fields (supported)

| 字段名 | 作用（一句行为） | 默认值 | 取值范围 | 生效方式 | 风险 | 备注 |
|---|---|---|---|---|---|---|
| `executablePath` | 自定义 pi CLI 路径；空=常见候选路径探测（找不到即报错，让用户自行安装） | `''` | 任意路径串；必须是官方包（`@earendil-works/pi-coding-agent` 或 legacy `@mariozechner/pi-coding-agent`）内的真实 CLI，shim/裸二进制被拒 | 会话（每次 spawn 重读） | 中 | `resolvePiSdkCli` 校验包归属，防伪造 |
| `provider` | 默认 provider（legacy 默认值；会话可覆盖） | `''`（跟随 Pi 自身默认） | 任意串 | 会话（launch options.provider）+ 热覆盖（`set_model`） | 低 | UI 中作为 legacy defaults 展示；native `get_config` 写入后会被清空（`['defaultProvider','defaultModel','defaultThinkingLevel']` 映射清理） |
| `model` | 默认模型 id | `''` | 任意串 | 会话（launch options.model）+ 热覆盖 | 低 | 同上 |
| `thinkingLevel` | 默认思考级别 | `''`（继承模型默认） | `''/off/minimal/low/medium/high/xhigh/max`（归一化丢弃未知值） | 会话（launch options.thinkingLevel）+ per-turn request.options.variant 覆盖 | 低 | SDK-reported levels for current model; no guessed variants（`get_thinking_levels`） |

### Per-request (chat) overrides — not settings but part of the same surface

`request.options.provider/model` (both-or-nothing; validated pair, `set_model` RPC before prompt),
`request.options.variant` (thinking level for that turn). 生效：热（下一 turn）。

## B. Pi provider/credential config (external file via SDK `get_config`, plugin-edited)

`SettingsPiProvidersSection` edits the structured **models.json** document through Pi's own
`get_config`/save RPC (`PiConfigurationDocument { path, value, revision }` — path comes from the SDK,
never hard-coded plugin-side). Shape: `providers: { <name>: { baseUrl, apiKey(表达式，password 输入),
headers?, compat?, modelOverrides?, models: [{id, name, baseUrl?, ...}] } }`. Global + project scopes
(`scopes: {global, project}` from `PiProtocol.ts:39`). 生效：Pi 下次进程 spawn（会话）。
风险：中（apiKey 凭据；baseUrl 指向第三方网关）。

OAuth/API-key provider onboarding lives in SettingsPiSection (oauth provider dropdown, providerId+API key
form) — writes through the same document. `pi.account`/`authConfigured` status rows reflect configured auth.

## C. MCP servers (external config, plugin read-only merge view)

`PiMcpConfigService` merges, lowest→highest precedence:
1. `~/.config/mcp/mcp.json`
2. `~/.agents/mcp.json`
3. `~/.agents/mcp/mcp.json`
4. `~/.pi/agent/mcp.json` (or `$PI_CODING_AGENT_DIR/mcp.json`)
5. `<vault>/.mcp.json`
6. `<vault>/.pi/mcp.json`

Read-only in the plugin: a declaration can only be *read* from the files the extension itself merges;
ancestor-directory discovery, `imports`/plugin config expansion are deliberately NOT mirrored.
生效：Pi 进程 spawn 时（会话）。风险：中（MCP 服务器执行任意命令）。

## D. Goal extension (driver: `@narumitw/pi-goal`)

`BackendGoalRuntime('pi', { source:'extension', driver:'@narumitw/pi-goal', actions:[set,edit,pause,resume,clear] })`.
Availability probed at runtime (`get_goal`); unavailable → goals fail closed with reason. npm latest
0.54.17 (2026-11-06). Not a settings field; surfaced as capability + extension status.

## E. Session store (plugin-owned)

`PiSessionStore` at `<vault>/.pi/opencodian-sessions/` (override: `options.sessionDirectory`). Bindings to
native session paths validated by `store.validateNativePath`. Not user-configurable via settings UI.

## F. Warm inline completion

`startInlineCompletionSession` re-reads the configured executable on each `reset()` — executable changes
apply on next completion-session reset. Timeout fixed `INLINE_COMPLETION_TURN_TIMEOUT_MS`.
Aux query sessions (inline edit) pass `systemPrompt/workingDirectory/model/turnTimeoutMs` and enforce
`set_tools` allowlist with `get_tools` readback mismatch rejection (fail-closed).

## G. Native settings.json dynamic schema (bundled service `get_configuration` fields)

Source of truth: `assets/pi/configuration.mjs` `SETTINGS_FIELDS` (bundled with the plugin; validated by
`validateSettings` on every `save_configuration`; served to the UI via `get_configuration` RPC as
`fields: PiSettingField[]`, rendered per group by `SettingsPiConfigurationSection`). Scope selector
global (`<agentDir>/settings.json`) / project (`<vault>/.pi/settings.json`); project inherits global per
field (shown as 继承 hint). Saves are revision-guarded; `.opencodian.bak` backup written first.
生效 for ALL rows below: **会话**（下次 Pi 进程 spawn 读取文件；UI 提供 Reconnect 按钮重建）。
这是本设置编辑器的持久化路径：`SettingsPiConfigurationSection.ts:240-258` 通过
`save_configuration` 保存，`:412-418` 为字段标记 `new-session`。Pi 原生协议支持在当前会话修改
steering/follow-up 模式，但本编辑器保存这两个字段时不调用该热修改能力；不得把原生 RPC 能力
当作设置页的保存后立即生效证明。
Scope column: SDK = read by Pi SDK at runtime; terminal/export/session-directory tags mark host-scope
fields the SDK consumes only in those contexts. Evidence: bundled service code + SDK-owned file storage.

Columns: 字段名 | 作用 | 默认值 | 取值范围 | 生效方式 | 风险 | scope·证据。
Defaults are **unset (继承 Pi 内建默认)** unless noted — the file only stores what the user saved
(UNKNOWN = Pi SDK internal default, not enumerated in plugin source).

### Group `model`

| 字段名 | 作用 | 默认值 | 取值范围 | 生效 | 风险 | scope·证据 |
|---|---|---|---|---|---|---|
| `defaultProvider` | 模型循环/新会话的默认 provider | 未设（SDK 内建） | 任意串 | 会话 | 低 | SDK·service.mjs |
| `defaultModel` | 默认模型 ID | 未设 | 任意串 | 会话 | 低 | SDK |
| `defaultThinkingLevel` | 默认思考等级 | 未设 | off/minimal/low/medium/high/xhigh/max（枚举） | 会话 | 低 | SDK |
| `enabledModels` | 模型循环（cycle_model）范围模式 | 未设 | string[]（模式串） | 会话 | 低 | SDK |
| `thinkingBudgets.minimal/low/medium/high` | 各等级思考 token 预算 | 未设 | 整数 ≥0（min:0 校验） | 会话 | 中（影响成本/质量） | SDK |

### Group `execution`

| 字段名 | 作用 | 默认值 | 取值范围 | 生效 | 风险 | scope·证据 |
|---|---|---|---|---|---|---|
| `transport` | 模型请求传输层 | 未设 | sse/websocket/auto（枚举） | 会话 | 低 | SDK |
| `steeringMode` | 纠偏消息投递策略 | 未设 | all/one-at-a-time | 会话（本 UI 保存后下一进程读取；可重连） | 低 | SDK；原生当前会话热修改能力与本编辑器的 `save_configuration` 路径分开 |
| `followUpMode` | 后续消息投递策略 | 未设 | all/one-at-a-time | 会话（本 UI 保存后下一进程读取；可重连） | 低 | SDK；原生当前会话热修改能力与本编辑器的 `save_configuration` 路径分开 |
| `compaction.enabled` | 自动压缩开关 | 未设 | boolean | 会话 | 中（上下文丢失风险） | SDK |
| `compaction.reserveTokens` | 压缩预留回复 token | 未设 | 整数 ≥0 | 会话 | 中 | SDK |
| `compaction.keepRecentTokens` | 压缩保留近期 token | 未设 | 整数 ≥0 | 会话 | 中 | SDK |
| `branchSummary.reserveTokens` | 分支摘要预留 token | 未设 | 整数 ≥0 | 会话 | 中 | SDK |
| `retry.enabled` | 自动重试开关 | 未设 | boolean | 会话 | 低 | SDK |
| `retry.maxRetries` | Agent 最大重试次数 | 未设 | 整数 ≥0 | 会话 | 低 | SDK |
| `retry.baseDelayMs` | 基础重试间隔 ms | 未设 | 整数 ≥0 | 会话 | 低 | SDK |
| `retry.provider.timeoutMs` | provider 请求超时 ms | 未设 | 整数 ≥0 | 会话 | 中 | SDK |
| `retry.provider.maxRetries` | provider SDK 重试次数 | 未设 | 整数 ≥0 | 会话 | 低 | SDK |
| `retry.provider.maxRetryDelayMs` | 服务端建议等待上限 ms（0=不限） | 未设 | 整数 ≥0 | 会话 | 低 | SDK |
| `shellPath` | Shell 可执行路径 | 未设 | 任意串 | 会话（bash 工具） | 中（命令执行面） | SDK |
| `shellCommandPrefix` | Shell 命令前缀 | 未设 | 任意串 | 会话 | 中 | SDK |
| `images.autoResize` | 附件/工具图片自动缩放 | 未设 | boolean | 会话 | 低 | SDK |
| `images.blockImages` | 禁止向模型发送图片 | 未设 | boolean | 会话 | 低 | SDK |

### Group `resources`

| 字段名 | 作用 | 默认值 | 取值范围 | 生效 | 风险 | scope·证据 |
|---|---|---|---|---|---|---|
| `npmCommand` | 包管理命令参数 | 未设 | string[]（每行一个 argv） | 会话 | 中（安装执行） | SDK |
| `packages` | 扩展包及资源过滤规则 | 未设 | JSON：string 源或 `{source,…}` 对象数组（validateSettings 校验） | 会话 | 高（任意扩展代码） | SDK |
| `extensions` | 扩展路径列表 | 未设 | string[] | 会话 | 高（任意扩展代码） | SDK |
| `skills` | 技能路径列表 | 未设 | string[] | 会话 | 中 | SDK |
| `prompts` | 提示模板路径列表 | 未设 | string[] | 会话 | 低 | SDK |
| `themes` | 主题资源路径 | 未设 | string[] | 会话 | 低 | scope: export |
| `enableSkillCommands` | 注册技能斜杠命令 | 未设 | boolean | 会话 | 低 | SDK |

### Group `advanced`

| 字段名 | 作用 | 默认值 | 取值范围 | 生效 | 风险 | scope·证据 |
|---|---|---|---|---|---|---|
| `hideThinkingBlock` | 隐藏思考块 | 未设 | boolean | 会话 | 低 | terminal |
| `branchSummary.skipPrompt` | 跳过分支摘要询问 | 未设 | boolean | 会话 | 低 | terminal |
| `sessionDir` | Pi CLI 会话目录 | 未设 | 任意串 | 会话 | 中 | session-directory |
| `theme` | 终端与 HTML 导出主题 | 未设 | 任意串 | 会话 | 低 | export |
| `quietStartup` | 隐藏终端启动信息 | 未设 | boolean | 会话 | 低 | terminal |
| `collapseChangelog` | 折叠更新日志 | 未设 | boolean | 会话 | 低 | terminal |
| `enableInstallTelemetry` | CLI 安装统计 | 未设 | boolean | 会话 | 中（遥测） | terminal |
| `terminal.showImages` | 终端显示图片 | 未设 | boolean | 会话 | 低 | terminal |
| `terminal.imageWidthCells` | 终端图片宽度（字符格） | 未设 | 整数 ≥0 | 会话 | 低 | terminal |
| `terminal.clearOnShrink` | 终端缩小时清空行 | 未设 | boolean | 会话 | 低 | terminal |
| `terminal.showTerminalProgress` | 终端进度指示 | 未设 | boolean | 会话 | 低 | terminal |
| `doubleEscapeAction` | 双击 Escape 行为 | 未设 | fork/tree/none | 会话 | 低 | terminal |
| `treeFilterMode` | 终端树默认过滤 | 未设 | default/no-tools/user-only/labeled-only/all | 会话 | 低 | terminal |
| `editorPaddingX` | 终端编辑器水平留白 | 未设 | 整数 0–3（min0 max3） | 会话 | 低 | terminal |
| `autocompleteMaxVisible` | 终端补全可见条目 | 未设 | 整数 3–20（min3 max20） | 会话 | 低 | terminal |
| `showHardwareCursor` | 显示硬件光标 | 未设 | boolean | 会话 | 低 | terminal |
| `markdown.codeBlockIndent` | 终端代码块缩进 | 未设 | 任意串 | 会话 | 低 | terminal |
| `warnings.anthropicExtraUsage` | Anthropic 额外用量提示 | 未设 | boolean | 会话 | 低 | terminal |
| `lastChangelogVersion` | 已读更新版本（只读） | 未设 | 任意串 | — | 低 | terminal·readOnly:true（applyChanges 拒绝编辑） |

Advanced group additionally renders a **raw JSON editor**（整文件 value 覆写，revision-guarded；wildcard
control）→ dynamic schema wildcard: 任何 settings.json 键（validateSettings 仅对已知路径做类型校验，
未知键允许存在但不受表单管理）。

## H. models.json nested field schema (provider/model editor, `save_model_configuration`)

File `<agentDir>/models.json`（agentDir = `$PI_CODING_AGENT_DIR` 或 SDK `getAgentDir()`，通常
`~/.pi/agent`）。UI: `SettingsPiProvidersSection`。Save：revision-guarded、锁文件、临时文件经
`ModelRuntime.create({modelsPath: 临时文件, refreshOnCreate:false, credentials 只读拒绝})` 验证后原子
rename；`.opencodian.bak` 备份。生效：**会话**（下次 spawn；UI 提供 Reconnect）。风险：**高**
（凭据 apiKey / baseUrl 指向任意网关）。

### Provider 级（providers.<name>）

| 字段名 | 作用 | 默认值 | 取值范围 | 生效 | 风险 | 证据 |
|---|---|---|---|---|---|---|
| `name` | 显示名（providerId 为键，创建后不可改） | 新建必填 | 任意串；禁 `__proto__/constructor/prototype` | 会话 | 低 | UI text |
| `baseUrl` | API 根地址 | 未设（继承模型级/内建） | 任意串 | 会话 | 高 | UI text |
| `api` | API 协议 | 未设（inherit） | openai-completions / openai-responses / anthropic-messages / google-generative-ai；未知值以选项透传保留 | 会话 | 中 | UI dropdown |
| `apiKey` | API key 表达式（password 输入） | 未设 | 任意串 | 会话 | 高 | UI password |
| `authHeader` | 鉴权头三态 | 未设（inherit） | inherit / true / false | 会话 | 中 | UI tristate |
| `headers` | 额外请求头 | 未设 | JSON object（wildcard） | 会话 | 中 | UI json |
| `compat` | 兼容性开关 | 未设 | JSON object（wildcard） | 会话 | 中 | UI json |
| `modelOverrides` | 模型覆盖 | 未设 | JSON object（wildcard） | 会话 | 中 | UI json |

### Model 级（providers.<name>.models[]）

| 字段名 | 作用 | 默认值 | 取值范围 | 生效 | 风险 | 证据 |
|---|---|---|---|---|---|---|
| `id` | 模型 ID | 新建必填 | 任意串 | 会话 | 中 | UI text |
| `name` | 显示名 | 未设 | 任意串 | 会话 | 低 | UI text |
| `baseUrl` | 模型级 API 根覆盖 | 未设 | 任意串 | 会话 | 中 | UI text |
| `api` | 模型级协议覆盖 | 未设 | 同 provider 级 4 枚举 + 透传 | 会话 | 中 | UI dropdown |
| `reasoning` | 推理能力三态 | 未设（inherit） | inherit / true / false | 会话 | 低 | UI tristate |
| `input` | 输入模态 | `['text']`（关闭图片时） | image 开 → `['text','image']` | 会话 | 低 | UI toggle |
| `contextWindow` | 上下文窗口 | 未设（UNKNOWN→运行时探测） | 数 ≥0 | 会话 | 中 | UI number |
| `maxTokens` | 最大输出 | 未设（UNKNOWN） | 数 ≥0 | 会话 | 中 | UI number |
| `cost.input/output/cacheRead/cacheWrite` | 每百万 token 成本 | 未设（成本显示 0） | 数 ≥0 | 会话（仅费用计算） | 低 | UI numeric ×4 |
| `thinkingLevelMap` | 思考等级映射 | 未设 | JSON object（wildcard，模型相关） | 会话 | 低 | UI json |
| `headers` / `compat` | 模型级头/兼容覆盖 | 未设 | JSON object | 会话 | 中 | UI json |

Plus **native JSON textarea**（整个 models.json 覆写；wildcard control，含 providers 结构内任意上游
字段——UNKNOWN 上游完整键集以 SDK 校验为准）。

Schema-version caveat (honest): bundled `SETTINGS_FIELDS` 注释锚定 official 0.73.1 Settings surface；
本机 CLI 已是 1.5.0。`get_configuration` 返回 `sdkVersion`，未知新增字段会以 raw JSON 编辑器兜底，
但表单行可能滞后于 SDK 新字段（documented lag, not hidden failure）。

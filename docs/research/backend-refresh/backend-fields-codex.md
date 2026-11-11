# Codex backend — full field inventory

Sources: `src/core/types/settings.ts` (`CodexBackendSettings` 805-837, defaults at `getDefaultCodexBackendSettings`),
`src/core/agents/backend/codex/CodexAdapter.ts` (snapshot options + `updateXxx` mutators, app-server thread/turn
options build at ~3486-3530), `AgentAdapterWiring.ts:84-109` (construction snapshot),
`SettingsCodexSection.ts::applyCodexRuntimeUpdates` (save-time runtime updates),
`CodexProjectConfigFormModel.ts` (project config.toml allowlist), `CodexCliResolver.ts`,
`CodexGlobalConfigSummaryReader.ts`.

生效方式 legend: 热 = next thread/turn boundary (runtime update mutator); 会话 = next session/thread;
重启 = plugin reload.

## A. Plugin settings fields (supported)

| 字段名 | 作用（一句行为） | 默认值 | 取值范围 | 生效方式 | 风险 | 备注 |
|---|---|---|---|---|---|---|
| `executablePath` | 自定义 Codex CLI 路径；空=PATH 发现（CodexCliResolver，绝不从插件私有路径发现） | `''` | 任意路径串 | 重启（解析在构造时一次） | 中 | resolution.mode 'missing' 会在 start() 直接抛错 |
| `apiKey` | OpenAI API key；回退 OPENAI_API_KEY env / ~/.codex/auth.json ChatGPT 登录 | `''` | 任意串（redaction 契约同其他密钥） | 重启（SDK client 构造一次；认证失败在 thread.runStreamed 时自然浮出） | 高（凭据） | auth 是 deferred 的——adapter 不预检 key |
| `model` | ThreadOptions.model → SDK `--model` / app-server thread.model | `''` (SDK 默认) | 任意模型串 | 热（save 时调 `updateModel`）→ 下一 thread | 低（成本相关=中） | 也可被聊天工具栏 per-session 覆盖 |
| `sandboxMode` | ThreadOptions.sandboxMode → `--sandbox`；app-server thread.sandbox + turn.sandboxPolicy | `'workspace-write'` | read-only / workspace-write / danger-full-access | 热 → 下一 thread/resume | 高（danger-full-access 关闭沙箱） | 现有缓存 thread 不受 update 影响 |
| `modelReasoningEffort` | → SDK `--config` / app-server turn.effort | `'medium'` | minimal/low/medium/high/xhigh/max/ultra/persistent | 热（save + 聊天工具栏均走 updateModelReasoningEffort）→ 下一 thread | 低 | 注释明说 "next thread boundary"，UI 必须诚实 |
| `additionalDirectories` | → SDK `--add-dir` 每路径 / app-server turn.sandboxPolicy.writableRoots（去重） | `''`（换行分隔串） | 换行分隔路径 | 热 → 下一 thread | 中（扩大写根） | |
| `networkAccessEnabled` | → turn.sandboxPolicy.networkAccess（仅 workspace-write 有意义） | `false` | bool | 热 → 下一 thread | 中（开网=中高） | |
| `webSearchMode` | → app-server thread.config.web_search / SDK `--config` | `'cached'` | disabled / cached / live | 热 → 下一 thread | 低 | |
| `approvalPolicy` | 服务器端审批策略覆写；`inherit`=不发覆写 | `'inherit'` | inherit / on-request / never（'untrusted' 已被上游 2026-08 移除，load 归一化到 'on-request'） | 热 → 下一 thread/resume；on-request 需 app-server+approval bridge，缺则 fail-closed | 高（never=不再询问） | wire union 仍是 'untrusted'\|'on-request'\|'never'，但插件永不发出 'untrusted' |
| `pricingProviderId` / `pricingEndpoint` | 计价 provider 别名 / 代理端点标识（仅算费用） | `''` | 串 | 热（仅 UI 成本计算） | 低 | Codex 连接配置仍在 config.toml |
| `sessionTrace` | Codex 会话 trace 诊断 | enabled standard + captureContent:true | enabled/consolePreset/consoleChannels/storageDirectory/captureContent | 热 | 低 | |

### Save-time application order (SettingsCodexSection)

`applyCodexRuntimeUpdates()` calls, in order: `updateAdditionalDirectories` → `updateNetworkAccessEnabled`
→ `updateSandboxMode` → `updateModelReasoningEffort` → `updateWebSearchMode` → `updateApprovalPolicy` →
`updateModel`. All take effect at the NEXT thread start/resume; cached threads are NOT retroactively
affected (adapter doc comments are explicit). `executablePath` and `apiKey` are NOT runtime-updatable →
plugin reload.

### Transport selection (context for 生效方式)

App-server is the PRIMARY chat transport (authoritative context usage); SDK is fallback when negotiation
fails. App-server client constructed at adapter `start()` with `codexPathOverride`, `workingDirectory`
(vault), `getExtraEnv`, wire-observer, reconnect callbacks. Settings changes to path/env therefore need
plugin reload; thread/turn options changes are hot at next thread.

## B. Hidden plugin options (adapter supports, not in settings UI)

These exist in `CodexAdapterOptions` / app-server types but are not user settings fields:
`workingDirectory` (always the vault), `codexPathOverride` (from CLI resolution), `getExtraEnv`
(R-F7 domain env; SDK stops inheriting process.env when `env` set — base is replicated under domain
overrides), `createCodex`/`createAppServerClient` (test factories), `tracePort`, approval-bridge
(`execCommandApproval`/`applyPatchApproval` + v2 `item/{commandExecution,fileChange,permissions}/requestApproval`,
`item/tool/requestUserInput`, `accept_with_execpolicy_amendment`), elicitation bridge, skills/changed
subscription, quota windows (`rate_limits` → session info windows), execpolicy amendment server-proposal
(v2 commandExecution).

## C. Project-level config.toml (external file, plugin-edited with allowlist)

File: `<vault-root>/.codex/config.toml`, surgical TOML editing preserving comments/order
(`CodexProjectConfigFormModel.ts`). Absence of a key = inherit global; the form never writes `inherit`.

| 允许键 | 类型/取值 | 默认（缺省=继承全局） | 生效方式 | 风险 |
|---|---|---|---|---|
| `model` | string | 继承 | 下一 codex 进程/会话读取 | 中 |
| `model_reasoning_effort` | minimal/low/medium/high/xhigh/max/ultra/persistent | 继承 | 下一会话 | 低 |
| `sandbox_mode` | read-only/workspace-write/danger-full-access | 继承 | 下一会话 | 高 |
| `approval_policy` | never/on-request/on-failure/untrusted（上游已退役 untrusted——表单仍允许写，运行时 0.15x+ 会硬失败） | 继承 | 下一会话 | 高 |
| `network_access` | bool | 继承 | 下一会话 | 中 |
| `web_search` | string enum (disabled/cached/live) | 继承 | 下一会话 | 低 |
| `additional_directories` | string[] | 继承 | 下一会话 | 中 |

Forbidden at project level (blocked with focused diagnostics): `model_provider`, `openai_base_url`,
`[model_providers.*]`, `auth`, `notification`, `telemetry`, `env_key`, `headers`, `query_params`,
any unknown key.

## D. Global Codex config (external, read-only summary)

`~/.codex/config.toml` (`$CODEX_HOME` honored) — read by `CodexGlobalConfigSummaryReader` (model, base URL
redaction of user-info/query/fragment). `~/.codex/auth.json` ChatGPT login is the auth fallback; plugin
never writes it. `~/.codex/agents/*.toml`, `~/.agents/skills/`, project `.agents/skills/` — discovery
(P0 read-only; see external-config file).

## E. Upstream retired/changed semantics already handled in plugin

- `approval_policy = "untrusted"`: removed by Codex CLI 0.15x (2026-08) — config load hard-fails if
  present; plugin normalizer migrates persisted 'untrusted' → 'on-request' on load and never emits it.
- App-server deprecation notices: adapter subscribes and surfaces one-time Notice + trace.
- execve-based CLI launcher (0.167.0 bin wrapper): transparent to the plugin (spawn shape unchanged).

## F. Additional UI-visible control surfaces (control enumeration, not new settings keys)

| UI surface (SettingsCodex*) | Editable? | What it writes | 生效 | Evidence |
|---|---|---|---|---|
| Main section: model dropdown + custom input | YES | `backendSettings.codex.model` | 热（updateModel → 下一 thread） | SettingsCodexSection |
| effort dropdown | YES | `modelReasoningEffort` | 热 | 同上 |
| sandbox dropdown / approval dropdown / web-search dropdown / network toggle / additional-dirs textarea | YES | 对应 settings 字段 | 热 | 同上 |
| executablePath / apiKey | YES | settings 字段 | 重启 | adapter 构造一次 |
| pricingProviderId / pricingEndpoint（CostEstimateSettingsRow 'codex'） | YES | settings 字段（仅成本计算） | 热（UI） | renderCostEstimateSettingsRow |
| Project config section（config.toml 表单） | YES | §C 允许键 | 下一 codex 会话 | CodexProjectConfigFormModel |
| Project config raw view / readback modal | read + refresh | —（CodexReadbackModal 为证据展示） | — | SettingsCodexReadbackControls |
| Plugins section | YES（install/uninstall） | app-server `plugin/*` 路由管理的已装插件目录（非 settings 文件） | 下一会话 | SettingsCodexPluginsSection |
| Resources section（skill/agent 编辑器） | YES | `<vault>/.agents/skills/<n>/SKILL.md`（markdown）、`<vault>/.codex/agents/<n>.toml`（toml+markdown 混合模式）；global-enabled 可写，global-discovered 只读 | 下一会话 | SettingsCodexResourcesSection |
| MCP detail modal | 只读 + OAuth 触发 | `triggerMcpServerOAuth(name,{scopes,timeoutSecs})`；server/tool/resource 明细、bearer token 掩码显示 | — | CodexMcpServerDetailModal |
| Account surface（ChatGPT/API 卡片 + refresh all） | 刷新/登出动作 | auth 状态展示；authSource 由 apiKey 有无推导 | — | SettingsCodexAccountSurface |
| Legacy credential control | 迁移期控件 | legacy 凭据迁移 | — | SettingsCodexLegacyCredentialControl |

Correction vs earlier draft: the plugins/resources/MCP surfaces were previously only implied; they are
now enumerated. The MCP modal does NOT edit config.toml `mcp_servers` — Codex MCP server authoring
remains an upstream CLI/config-file concern in this plugin build (no structured mcp_servers editor).

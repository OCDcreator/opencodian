# OpenCode 2 backend — full field inventory

Sources: `src/core/types/settings.ts` (`OpenCode2BackendSettings` 1153-1177 + normalizer),
`src/core/agents/backend/opencode/OpenCode2Adapter.ts` (connection key 117-121, local spawn 142-190,
permissionMode per turn 1160-1162, config overlay 614-648, aux isolation 715-725),
UI `src/features/settings/backends/opencode/SettingsBackendSection.ts` (server controls + config overlay
editor + ProjectConfigFileWatcher).

生效方式 legend: 热 = next turn; 重连 = server restart driven by connection key; 会话 = next session.
Plugin fields persist under `backendSettings.opencode2`.

## A. Plugin settings fields (supported)

| 字段名 | 作用（一句行为） | 默认值 | 取值范围 | 生效方式 | 风险 | 备注 |
|---|---|---|---|---|---|---|
| `mode` | local=插件拉起自有 `opencode2 serve --stdio` 子进程；remote=连接现有服务器 | `'local'`（归一化：仅显式 'remote' 保留） | `local / remote` | 重连（connection key 首项） | 低 | UI 暴露 |
| `executablePath` | 本地模式 CLI 可执行文件；空=`opencode2`（PATH） | `''` | 任意路径串 | 重连 | 中 | 本机 `opencode2` 与 `opencode` 均为 `@opencode/cli` 2.2.6 |
| `baseUrl` | remote 模式服务器 URL | `''` | `http(s)://…`（连接前正则校验） | 重连 | 中 | local 模式忽略（stdin 握手返回随机端口 URL） |
| `password` | remote 模式 Basic 认证密码；local 模式忽略并生成随机 32B base64url | `''` | 任意串 | 重连 | 中（凭据） | Auth header `opencode:<password>` |
| `permissionMode` | 会话权限模式 | `'inherit'` | `inherit / normal / yolo / plan`（其他值归一化为 inherit） | 热（每 turn：`applyPermissionMode(sessionId, mode)`，非 inherit 才发） | 高（yolo=自动放行） | |
| `configContent` | 原生 OpenCode 2 config overlay（JSON 串），经 `OPENCODE_CONFIG_CONTENT` env 注入自有进程；与 OpenCode 1 项目 config 完全分离 | `''` | 任意 JSON 串（trim 后非空才注入） | 重连（connection key 含此字段） | 中（覆盖服务端行为面） | 仅 local 模式可编辑（remote 明确报错）；保存经 ProjectConfigFileWatcher 冲突检测，失败回写 previous |

### Runtime version gate

`client.server.info().version.startsWith('2.')` else `Expected OpenCode 2 server, got X` — a hard
compatibility gate at connect. Local handshake waits 15s for the first JSON line `{url: http://127.0.0.1:port}`.

### Per-turn options (chat layer, not settings)

`request.options.agent`（switchAgent，subagent 模式拒绝为主代理）、`request.options.provider/model/variant`
（switchModel）、images（data: URI parts）、requestParts（agent/skill mentions）、goal objective
（`session.instructions.entry.put` + `goal` command + readback）——全部 热（下一 turn）。

### Aux isolation

Aux queries force local isolated CLI: `getSettings` 返回 `{...settings, mode:'local', permissionMode:'inherit'}`
的副本——aux 永不继承 remote/permission 设置（fail-closed isolation, OpenCode2Adapter.ts:715-725）。

## B. Hidden / not-exposed

- `OPENCODE_CONFIG_CONTENT` env var name is fixed; no other env passthrough except domain `extraEnv` (R-F7).
- `configContent` schema validation is delegated to the server (plugin stores the string verbatim; server
  rejects at session time). Plugin-side JSON validity is NOT enforced (UNKNOWN what subset of OpenCode 2
  config keys is valid — upstream-defined, see versions-and-upstream.md).
- Process exit → turns aborted with `transport.error` events, status 'error'; restart happens on next
  `start()` (lazy) — no auto-retry loop.

## C. OpenCode 2 native Config schema (`@opencode/schema` 2.2.6, upstream contract)

The plugin stores `configContent` **verbatim** and injects it via `OPENCODE_CONFIG_CONTENT`; schema
validation is server-side at session/serve time. The authoritative key set below is extracted from the
published `@opencode/schema@2.2.6` package (`dist/config.d.ts` + sub-modules) — the same contract the
local 2.2.6 CLI validates against. Effect for every row: **重连**（overlay 在进程 spawn 时注入；改动
进入 connection key → 下次连接生效）。Scope: upstream-only; the plugin UI is a raw JSON editor
(wildcard control) — no per-key form. Defaults are upstream-internal (UNKNOWN unless upstream docs state
them; absence of a key = server default).

### Top-level keys

| 字段名 | 作用 | 默认值 | 取值范围 | 生效 | 风险 |
|---|---|---|---|---|---|
| `$schema` | schema 声明 | 未设 | 任意串 | 重连 | 低 |
| `shell` | Shell 配置 | 未设 | 任意串 | 重连 | 中 |
| `model` | 默认模型（含 small/large 变体位） | 未设（服务器内建） | `providerID/model` 串或 `{providerID, model, variant?}` | 重连 | 中 |
| `default_agent` | 默认主代理 | 未设 | 任意串（须命中 agents） | 重连 | 中 |
| `update` | 自更新策略 | 未设 | disable/notify/auto | 重连 | 低 |
| `share` | 会话分享策略 | 未设 | manual/auto/disabled | 重连 | 中（auto=自动上传分享） |
| `enterprise.url` | 企业端点 | 未设 | URL 串 | 重连 | 中 |
| `username` / `timezone` | 用户/时区上下文 | 未设 | 任意串 | 重连 | 低 |
| `permissions` | 权限规则数组 | 未设 | `{action, resource, effect: allow\|deny\|ask}[]` | 重连 | 高 |
| `policies` | 策略规则数组 | 未设 | `{action: provider.use\|tool.use\|integration.connect\|integration.use\|mcp.use\|skill.use\|plugin.use\|websearch.use, resource, effect: allow\|deny}[]` | 重连 | 高 |
| `agents` | 自定义代理定义 | 未设 | `Record<name, ConfigAgent.Info>`（mode/model{providerID,model,variant}/system/description/color/hidden/disabled/steps/permissions[]） | 重连 | 中 |
| `snapshots` | 快照开关 | 未设 | boolean | 重连 | 低 |
| `watcher.ignore` | 文件监听忽略规则 | 未设 | 忽略模式（glob 串集） | 重连 | 低 |
| `formatter` | 格式化器 | 未设 | boolean 或 `Record<name, Entry>` | 重连 | 中 |
| `lsp` | LSP 服务器 | 未设 | boolean 或 `Record<name, {disabled:true} \| Server>` | 重连 | 中 |
| `media` | 媒体策略 | 未设 | `{image, max_width, max_height, auto_resize}` | 重连 | 低 |
| `tool_output` | 工具输出截断 | 未设 | `{max_bytes, max_lines}` | 重连 | 低 |
| `mcp` | MCP 服务器 | 未设 | `{timeout?, servers?: Record<name, {type:'local'\|'remote', …}>}`（tagged union：local=命令型，remote=URL 型；完整键集上游 Mcp.LocalConfig/RemoteConfig，UNKNOWN 细节） | 重连 | 高（命令执行/远程调用） |
| `compaction` | 压缩策略 | 未设 | `{auto, buffer, keep, tokens}` | 重连 | 中 |
| `skills` | 技能路径 | 未设 | string[] | 重连 | 中 |
| `commands` | 自定义命令 | 未设 | `Record<name, {agent?, description?, model?, providerID?, subagent?, subtask?, template?, variant?}>` | 重连 | 低 |
| `instructions` | 附加指令文件 | 未设 | string[] | 重连 | 中 |
| `references` | 引用资源 | 未设 | `Record<name, 串 \| Git \| Local>` | 重连 | 低 |
| `websearch` | 网页搜索 | 未设 | false 或 Info 对象 | 重连 | 中 |
| `plugins` | 插件 | 未设 | `(串 \| Entry)[]` | 重连 | 高（任意代码） |
| `worktree.directory` | worktree 目录 | 未设 | Trim 后串 | 重连 | 低 |
| `warming` | 预热 | 未设 | boolean 或 `{prompt, interval, duration}` | 重连 | 中（成本） |
| `providers` | 自定义 provider | 未设 | `Record<name, ConfigProvider.Info>`（settings/timeout/headerTimeout/chunkTimeout/cache{ttl,warming{interval,duration}}/transport/encoding + 每模型嵌套；完整叶子集 upstream-defined，UNKNOWN 全集） | 重连 | 高（凭据/网络） |
| `experimental` | 实验开关 | 未设 | `{all_flags, todo, image_generate, artifacts, codemode_vm, media_blob, portable_shell_scanner, background_compaction, location_idle_timeout, schedules, subagent_depth, part_rows, model{providerID,model,variant}}` | 重连 | 中（不稳定行为） |

Coverage note: this table enumerates the top-level Config keys of 2.2.6 and the nested key families for
agent/permission/policy/compaction/mcp/media/tool_output/warming/experimental/command extracted from the
published typings. Provider/model formatter/lsp leaf fields are documented as families with wildcard
(extraction of every nested leaf was not exhaustive — UNKNOWN leaves are accepted by the raw JSON editor
and validated server-side).

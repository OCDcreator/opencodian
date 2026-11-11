# ZCode backend — full field inventory

Sources: `src/core/types/settings.ts` (`ZCodeBackendSettings` 1059-1088 + normalizer),
`src/core/agents/backend/zcode/ZCodeRuntimeResolver.ts` (entry resolution, SPAWN_ARGS `['app-server','--stdio']`),
`ZCodeAdapter.ts` (`applyPersistedDefaults` at session materialization ~806; `setSessionMode` 1526+),
`ZCodeModelCatalog.ts` (live model/thinking/mode catalog + readback), `ZCodeAccountService.ts`
(shared login), `ZCodePersonalConfigService.ts` (shared personal API config),
UI `src/features/settings/backends/zcode/*` (SettingsZCodeSection, SettingsZCodeModelControls, SettingsZCodeAccounts).

生效方式 legend: 热 = live session mutation via native RPC with readback; 会话 = applied once at session
materialization; 重启 = plugin reload. Plugin fields persist under `backendSettings.zcode`.

## A. Plugin settings fields (supported)

| 字段名 | 作用（一句行为） | 默认值 | 取值范围 | 生效方式 | 风险 | 备注 |
|---|---|---|---|---|---|---|
| `executablePath` | 覆盖 ZCode 运行时入口：`zcode-agent` 原生二进制、`zcode.cjs` node bundle、或包含两者的目录；空=官方安装自动发现 | `''` | 任意路径（binary/bundle/dir；`~/` 展开入口） | 会话（每次 resolve；transport 按需 spawn） | 中 | 发现顺序：settings override → `GLM_BINARY_PATH` env → 官方 app 目录（macOS: `/Applications/ZCode.app/Contents/Resources/glm`，用户 `~/Applications`，Windows `%LOCALAPPDATA%/Programs/ZCode/resources/glm` 等，Linux `/opt/ZCode` 等）。node-bundle runner = 宿主 app 自己的 Electron（`ELECTRON_RUN_AS_NODE=1`），禁用 Obsidian 宿主 Electron；fallback 纯 `node` |
| `model` | 持久默认模型 `providerId/modelId`，在会话物化时应用一次 | `''`（inherit 运行时当前值） | 必须命中 live catalog（否则 saved-unknown 提示） | 会话（applyPersistedDefaults；对话内覆盖从不回写此默认） | 低 | 校验失败原因枚举：model-not-in-catalog / reasoning-required / reasoning-unsupported |
| `thinkingLevel` | 持久默认思考级别（使用前对照 live catalog 校验） | `''`（inherit） | live catalog 暴露的 reasoning levels（串） | 会话 | 低 | 不合法值在使用时被拒绝，非归一化丢弃 |
| `mode` | 持久默认权限模式 | `''`（runtime default） | `''/plan/build/edit/yolo/auto`（'auto' 仅存量值保留，UI 禁用不可新选） | 会话（applyPersistedDefaults）+ 热 `setSessionMode`（枚举校验） | 中（yolo=自动放行） | ZCode 0.16.9 已知怪癖：接受 plan 但把 base mode 投影为 build——adapter 以独立 plan-state 事件区分（`getEffectiveMode`），plan 需 native readback 确认，未确认则终端 error chunk |

### Live model surface (`ZCodeModelCatalog`)

`runtime/capabilities` handshake → model.available[]（providerId/modelId/label）、model.current
（providerId/modelId/reasoningLevel）、mode.current + allowed modes。`session/read` 只投影 current
model/mode，不会擦除更宽的 catalog（narrower projection merge preserved）。Model/thinking/mode mutations
are 热 (per live session) with confirmed/partial/unconfirmed readback kinds.

## B. Account / shared login (external to plugin settings)

`ZCodeAccountService` — "OpenCodian Official Login"（ADR-0003，与 CONTEXT.md 术语一致）：
- Credentials at `~/.opencodian/zcode/account/.zcode/v2/credentials.json`（`ZCODE_DATA_BASE_DIR` 注入），
  encrypted with `ZCODE_CREDENTIAL_SECRET`（缺省 fallback 派生自 platform+home+username）。
- Login providers allowed: `bigmodel`, `zai` only（`zcode-login-provider-invalid` otherwise）。
- OAuth flow: authorizeUrl surfaced, statuses signing-in/ready/logged_out; per-family
  `oauth:<family>:user_info` / `oauth:<family>:access_token` entries read back.
- All local vaults share this login; sign-out affects OpenCodian vaults on that machine. Independent of
  the ZCode desktop account.
- 生效：账户级（立即，影响下一会话/turn 的认证）。风险：高（凭据）。

## C. Shared personal API configuration (external, revision-guarded)

`ZCodePersonalConfigService` — revision-guarded edits to the SAME personal API config used by ZCode
desktop（CONTEXT.md "Shared Personal API Configuration"）: `providerConfigRules.providerRules`,
`modelConfigRules.providerModelRules` + `manualProviderModelRules`, `providerOrder`,
`defaultModelSelection`. Provider drafts constrained to `group === 'standard-personal'`,
`access.type === 'api-key'`, protocol ∈ `ZCODE_API_PROTOCOLS`. 生效：下一会话/进程读取配置时。
风险：高（API key、baseUrl、模型目录影响两个产品）。Editing affects both OpenCodian and ZCode desktop.

## D. Runtime/capability seams not exposed as settings (host-owned)

- SPAWN args fixed `app-server --stdio`; never configurable.
- `runtime/capabilities` handshake, reconnect/backoff budget, `skills/changed` subscription, native
  goal driver `dsh.native-goal`-style actions for zcode (set/edit/pause/resume/clear via native).
- Inline completion uses ZCode sessionless text-only path (`inlineCompletionModelOverrides.zcode`,
  separate from chat default model; completion settings live in the general inline-edit section).
- ZCodeDesktopTaskIndex reads the official desktop DB (bundle-derived path), read-only.
- Aux query sessions: `ZCodeAuxQuerySession` (+ `ZCodeAuxUnavailable` fail-closed marker).

## E. Known unknowns

- Native `zcode-agent` binary version floor: validated by handshake only; no version check. The bundled
  `zcode.cjs` on this machine could not yield its own version string from a minified grep (UNKNOWN).
- 'auto' mode enum value: persisted values are honored (rendered disabled in UI) but the native semantics
  of 'auto' vs runtime default are not documented in code comments (UNKNOWN beyond enum membership).

## F. UI-visible control enumeration (accounts + shared personal API form)

| UI surface | Editable? | Fields written | 生效 | Evidence |
|---|---|---|---|---|
| SettingsZCodeAccounts：desktop 关联提示行 | NO（只读说明） | — | — | SettingsZCodeAccounts.ts:43 |
| 登录按钮 bigmodel / zai | YES（动作） | 触发 native `zcode-login-*` OAuth 流程 → `~/.opencodian/zcode/account/.zcode/v2/credentials.json` | 立即（账户级） | 同上:92-94 |
| 账户状态行 | NO | 只读 snapshot（family·name 拼接） | — | 同上:89 |
| 共享个人 API provider 表单（add/edit） | YES | `name`(text), `protocol`(dropdown: openai-chat-completions/openai-responses/anthropic-messages), `baseUrl`(text), `apiKey`(password；已存在时占位“保留现有密钥”), `models`(多行 textarea) | revision-guarded 保存到共享配置文件 → ZCode 桌面与插件下一进程读取生效 | 同上:223-250 + ZCodePersonalConfigService |
| provider 列表行（删除/应用） | YES | remove(id, revision)（conflict 时提示 reload）；applyChanges 推送到运行时 | 下一会话/进程 | 同上:169,200 |

表单校验/拒绝：schemaVersion 1 gate、协议枚举白名单、`standard-personal` group + api-key access 类型
（ZCodePersonalConfigService.ts:36-52）；违反即 fail-closed 报错，不静默改写。

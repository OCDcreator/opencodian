# Owner: core.types

2026-11-13：Claude 原生权限值 `dontAsk`／`auto` 保留其独立语义，归一化不再把未预授权即拒绝的 `dontAsk` 转为 `bypassPermissions`；已有明确 bypass 值不反向猜测用户过去意图。全局默认和会话覆盖使用同一模式集合，运行时适用性与原生确认仍归 backend owner。ZCode 设置增加 guarded，保持未配置值继承与原有持久化边界。新增的原生事件信息只扩展共享流契约，不在类型层建立认证、配额或压缩的第二真值。

2026-11-10（DSH sessionTrace 设置契约）：`BackendSettings.dsh.sessionTrace` 增加持久化形状——`nativeEnabled` 与 `acpEnabled` 两个相互独立的 wire-trace 门（非 `false` 归 true）、`consolePreset`（仅 `'full'` 保留，其余归默认 `'standard'`）、按 `DSH_TRACE_CHANNEL_IDS` 重建的 `consoleChannels`（非 `false` 归 true）与 `storageDirectory`；`normalizeDshBackendSettings` 合流点始终填充默认值，持久化设置不会看到 undefined。trace 事件/端口/设置类型本身归 core.backend-diagnostics（diagnostics/types），本 owner 只持有设置持久化契约与归一化；consolePreset/channels/store 目录已被运行时实际消费但暂无设置 UI。类型层不解析凭据、不执行 trace、不推导运行时采集状态。

2026-11-09：`dshConfiguration.ts` 定义版本化、JSON 形状的 DSH 稀疏覆盖和字段描述元数据；`DshBackendSettings.nativeConfig` 使用同 owner 的类型，不反向依赖后端实现。归一化保留非法持久化意图供 UI／启动校验报告，避免静默删除后冒充保存成功。MCP 高级声明类型增加 stdio cwd、超时、启动失败策略、指令预算与 reconnect 可选字段。类型层不解析凭据、不执行 patch，也不推导运行时确认。

2026-11-07: `BackendSettingsRecoveryPoint` and optional `backendSettingsRecoveryPoints` describe a user-marked non-secret working default set. Validation and per-backend writable keys remain in the shared settings workspace; backend defaults and normalizers stay canonical. The type does not carry credentials or runtime verification and does not change existing settings defaults.

2026-10-29：增加 Vault 范围内的版本化 `PromptReference`、原生 mention 与会话快照契约。目的消息持有 `promptReferences` 稳定身份及 `sessionReferences` 实际捕获证据，可读正文与请求展开分离；类型层不负责目录发现、读取或原生执行。
> 2026-10-24（DSH）：增加会话级 opaque 模型/逐模型推理覆盖、stdio/HTTP MCP 声明和 aggregate context 标记；配置与回读继续分别归原 owner 所有。
> 2026-10-02（T02）：inline-edit/completion 模型覆盖 allowlist 补入 `opencode2`，保存归一化与重载保留独立 provider/model；ZCode 的编辑边界和 effort allowlist 保持原限制。归一化函数体不扩展运行时责任；native 模型回读另行验收。
> 2026-09-30 (Codex 0.159 types)：
> - settings.ts：持久化 codex `approvalPolicy 'untrusted'` 迁移为 `'on-request'`（上游 0.15x 已退役该值并拒绝启动）；`VALID_APPROVAL_POLICY` 收窄；`SettingsCodexSection` 下拉同步更新。
> - chat.ts：`tool_use` kind union 扩展 `'image'`；`backend_event` union 扩展（`thread_renamed`、`goal_updated`、`goal_cleared`、`thread_deleted`、`deprecation_notice`）；会话级 approval override 经 `normalizeCodexApprovalPolicyOverride` 做 untrusted→on-request 迁移。
> - tools.ts kind union 对齐。
> 2026-09-22 (ZCode 票 01)：`AgentBackendKind` 增加 `'zcode'`；`BackendSettings` 增加 `zcode: ZCodeBackendSettings`（最小运行时选择：`executablePath` 覆盖，空=自动发现）与 `normalizeZCodeBackendSettings` 严格归一化，`getDefaultBackendSettings` 同步。既有后端设置真值不迁移。
> 2026-09-21 (advantage-parity R-F6 质量修复)：新增单槽位 Vim 键编辑契约 `applyChatVimNavigationKey` / `normalizeChatVimNavigationKey`（冲突拒绝 + 保留原三元组）；整表归一化的 fail-closed 语义不变，仍服务于持久化配置的 load 边界。
> 2026-09-21 (advantage-parity R-F2–R-F6)：会话类型新增受约束的绑定笔记路径、回退预览只读契约；设置新增默认关闭的聊天暖会话、双栏会话 rail、Vim 导航及 w/s/i 键配置，load 合流点对布尔值严格归一化并修复非法/重复键。既有后端会话与消息真值不迁移。
> 2026-09-21 (advantage-parity R-F7)：settings 新增 `environmentVariables`（EnvironmentVariablesDomains，默认空域），load 合流点经 BackendEnvironment 归一化。
> 2026-09-21 (advantage-parity R-F8)：modelContextWindowOverrides 设置字段与归一化。
> 2026-09-21 (advantage-parity R-E4)：retrievalChannel 字段 + 语义检索设置三字段归一化。
> 2026-09-21 (advantage-parity R-E6)：owner manifest 刷新——shared.foundation 的 include 新增 `src/shared/tokenEstimate.ts`（token 估算启发式）；本 owner 的边界与职责未变。
> 2026-09-21 (advantage-parity R-E1)：chat 类型新增 url PromptContextKind 与 UrlContextMeta（抓取状态机元数据）。
> 2026-09-20 (advantage-parity R-D1)：settings 新增 conversationExport 块（目录/模板/自动导出）与 normalizeConversationExportSettings 归一化器；load 边界合流点同步消费；index barrel 导出新类型与归一化函数。

> Auto-generated scaffold from `architecture-owners.config.json`. The manifest is the canonical truth source; this page narrates the model and records hard-to-automate rationale. Update it when the owner boundary or its non-obvious invariants change.
- 2026-09-17 (shadcn style): `ThemeStyleId` 增加 `shadcn`，`ThemePresetId` 增加 `shadcn-neutral`，`isThemePresetId()` 同步收录；均为纯联合类型扩容，归一化与默认值（`glass-classic`）不变。
- 2026-09-13 (universal memory backend): settings.ts gained the MemoryBackendUserSettings group + normalizer (master/extraction/semantic toggles + extraction model).
- 2026-09-18 (FlowText parity R-A1/R-A2): settings.ts gained `inlineEditTriggerAt` (boolean, default false) and the user-defined `InlineEditPresetPrompt[]` list (`inlineEditPresetPrompts`, default `[]`) with `normalizeInlineEditPresetPrompts()` load hardening (trim, dedupe-by-id, caps) and the `INLINE_EDIT_PRESET_PROMPT_MAX_*` constants; `settingsLoadNormalization.ts` wires both into the final merge boundary.

- **Layer:** `core` (may import layers: shared, core)
- **Risk:** low
- **Include:** `src/core/types/**`

## Responsibilities
- core domain type definitions (chat, models, config, settings, permission, pricing, tools)

## Entrypoints
- `src/core/types/index.ts`

## Dependency surface
- **Allowed owner dependencies:** `shared.foundation`
- **Forbidden dependencies:** `feature`, `app`
- **Adjacent owners** (prefer editing these when out of scope): `core.config`, `core.opencode`, `feature.settings-shell`

## Required gates
Run before merge: `npm run typecheck`, `npm run module-docs`.

## Recent change notes
- **Turn change record contract:** a valid `noticeMeta.kind === 'turn-diff'` record owns its immutable snapshot and its user-message anchor inside `noticeMeta`; the top-level `ChatMessage.sourceMessageId` remains reserved for canonical message identity.
- **Persisted content-block identity:** `ContentBlock.partId?` carries a stable backend part identity when one is available. It is optional to keep historical/local records compatible; render owners may use it to preserve block-local UI state across hydration, but it is not a second transcript source of truth.

## Hard invariants
- Do not cross `forbiddenDependencies`.
- Do not replicate canonical state in another owner.
- Changes here must update the matching `docs/modules/**` page (via `module-docs.config.json`).
- Run `npm run inspect:owner -- <this owner or a path>` for an always-fresh summary.
- 2026-09-08：核心设置/聊天契约同步 Codex `max` / `ultra` / `persistent` 与 Claude 新 backend event 枚举；未知持久化值仍由规范化器收敛。

## Pi owner boundary review (2026-09-08)

PiBackendSettings is a separate settings branch normalized by normalizePiBackendSettings. Existing backend settings retain their own defaults and normalization.

## Auto-install startup update (2026-09-09)

新增 `OpenCodianSettings.pluginUpdateAutoInstall: boolean`（默认 `false`），由 `settingsLoadNormalization` 在最终 merge 边界做布尔归一化，缺失或非布尔持久化值回退为默认。

## User bubble style setting (2026-09-11)

`ChatAppearanceUserSettings.style: UserBubbleStyleId`（`'solid' | 'glass'`）控制用户气泡渲染模式。默认与未知值归一化为 `'solid'`（`normalizeUserBubbleStyleId`）；主题预设不再各自固定气泡样式，预设切换会把气泡样式重置为基线（solid），glass 变为用户显式选择。
- 2026-09-13: 记忆设置组新增 `memoryExternalRoot`（共享记忆根，默认空；支持开头 `~` 由 app 展开以兼容多机同步设置）。

- 2026-09-15: `OpenCodianSettings` 增加 `inlineEditEnabled` 与 `inlineEditModelOverrides`，并在加载期归一化；导出 `normalizeInlineEditModelOverrides`。

## 2026-09-27 OpenCode 2 compatibility

OpenCode 2 has a separate backend identity and normalized connection settings; persisted OpenCode 1 settings and session IDs remain distinct.
2026-10-05 Pi-only continuation：ConversationSessionSettings 新增 Pi model override 和按模型的 nullable effort overrides，由既有 normalize/StorageService 处理保存恢复；其他后端字段归一化与默认值不变。字段是下一次发送的会话覆盖，不是 native effective 证据。

## 2026-10-05 Codex 消息前分支与恢复

增加可选 Codex owning-turn 字段，native item ID 与 turn ID 的语义分别保留；没有 runtime 回读时不提供 fabricated effective evidence。

2026-10-07 owner manifest 核对：新增 `shared.foundation` 的 `src/shared/sessionCatalogReadback.ts`，统一目录读取结果与错误分类。本 owner `core.types` 的路径映射、职责、canonical state 和依赖约束经核对保持原定义；目录读取仍由 backend/lifecycle owners 调用共享契约。


> 2026-10-08 ZCode selection: 会话级 model override 与每模型 reasoning override 经既有保存/归一化链持久化，null 档位继承 native 模型默认；view 重载与切会话分别回读，保存失败只回滚发起会话。保存值不代替 native options 生效证据。


> 2026-10-21 OpenCode 1 退役：`DEFAULT_SETTINGS` 默认后端改为 `opencode2` / `['opencode2']`；`settingsLoadNormalization` 新增 `migrateRetiredBackendKind()` / `normalizeEnabledBackendsWithRetirement()`，把存量 `opencode` enabled/active 静默迁移为 `opencode2`（去重、空结果回退默认），设置主标签默认回退 `'server'` → `'general'`。`AgentBackendKind` 联合与 `BackendSettings.opencode` 结构保留，存量 conversation owner 不改写。

## 2026-10-23 DSH identity and settings

本 owner 增加 `AgentBackendKind.dsh` 和 `BackendSettings.dsh` 的默认/归一化契约。启动路径、工作目录、参数和环境归设置持久化所有；ACP 连接/会话状态仍归 core.backend。旧配置补齐 DSH 默认结构，但不自动启用新后端或改写既有会话 owner。

## 目录定位（2026-10-23）

当前源码目录：`src/core/types`。

目录整理沿用本 owner 的职责、状态和依赖约束；路径导航见[源码目录说明](../source-layout.md)。

> 2026-10-27（二次审查）：`INLINE_EDIT_BACKENDS` 加入 `dsh`，使 DSH 行内编辑覆盖在保存/重载后仍保留；仅设置归一化允许集，未改协议。

2026-10-28 owner manifest 核对：仅 app.memory-runtime 的模型调用依赖由 core.opencode 改为 core.backend 通用只读辅助能力；本 owner `core.types` 的 include、职责、canonical state 与依赖规则逐项对比 HEAD 均未改变。

## 2026-10-30 会话标题

ConversationTitleState 表达 rule/native/ai/manual 与 revision；aiTitleModelOverrides 隔离五后端模型设置，原 aiTitleModel 保留 OpenCode 兼容。
- 2026-11-12 (claude-provider-clarity) owner manifest 核对：与基线 1d3fa289 对 architecture-owners.config.json 做程序化逐 owner deep-equal 对比，全仓仅 feature.settings-claude 的 include 纯插入新增 `src/features/settings/backends/claude/SettingsClaudeProviderModals.ts`（无删除、无其他字段变化）；本 owner（core.types）的 include、responsibilities、canonical state 与依赖约束逐项对比未变。此为 manifest-diff 核对记录，不构成全量架构评审。

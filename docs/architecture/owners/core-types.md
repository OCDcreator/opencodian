# Owner: core.types
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

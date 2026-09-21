# Owner: app.composition
> 2026-09-21 (advantage-parity R-F7)：R-F7 失效信号：`refreshEnvironmentFingerprints` 挂 loadSettings 尾部与 saveSettings 后（指纹变化本地化 Notice 列出后端；首次运行静默、幂等、有界失败）；`getDomainEnvFor` 单一 accessor 供各构造缝。
> 2026-09-21 (advantage-parity R-F8)：main.ts 构造 ModelConfigService 时传入 getContextWindowOverrides。
> 2026-09-21 (advantage-parity R-F9)：main.ts 注册 file-menu 事件（文件/文件夹右键附加到聊天上下文，共享 R-A7 条目通道）。
> 2026-09-21 (advantage-parity R-E4)：main.ts 组合 embedding 服务与供应商解析。
> 2026-09-21 (advantage-parity R-E6)：owner manifest 刷新——shared.foundation 的 include 新增 `src/shared/tokenEstimate.ts`（token 估算启发式）；本 owner 的边界与职责未变。
> 2026-09-21 (advantage-parity R-E6)：main.ts 注册两个 token 估算命令（选区/全库 R-C1 范围）。
> 2026-09-21 (advantage-parity R-E2)：attach-webviewer-tab-to-context 命令（checkCallback 门控）。
> 2026-09-21 (advantage-parity R-E3)：main.ts 注册 opencodian-relevant-notes 视图与 open-relevant-notes 命令；新增 activateRelevantNotesView 与 attachVaultFileToActiveChatContext（共享 ContextAttachmentBuilder 通道）。
> 2026-09-20 (advantage-parity R-D1)：main.ts 组合 conversationExportService（vault/adapter 缝 + 用户编辑回调 Notice）、命令 export-conversation-markdown、exportConversationMarkdown{,ById}、saveConversation 后自动导出钩子（设置关时零成本）、onunload dispose。

> Auto-generated scaffold from `architecture-owners.config.json`. The manifest is the canonical truth source; this page narrates the model and records hard-to-automate rationale. Update it when the owner boundary or its non-obvious invariants change.
- 2026-09-13 (universal memory backend): main.ts constructs MemoryRuntimeCoordinator and registers the memory maintenance commands.
- 2026-09-18 (FlowText parity R-A1/R-A2): `registerWorkspaceIntegration()` additionally registers the `@` in-note trigger extension (`inlineEditAtTriggerExtension`, gated by `settings.inlineEditTriggerAt` AND `canRunInlineEdit()`; declines — letting `@` type through — for editors without a file-associated note) and the host bridge passes `presetPrompts` to the inline-edit host.

- **Layer:** `app` (may import layers: shared, core, feature, app)
- **Risk:** high
- **Include:** `src/main.ts`

## Responsibilities
- plugin entry point, composition and Obsidian registration
- startup storage load, settings normalization, locale, command registration
- view registration and lifecycle wiring

## Canonical state (truth home)
- OpenCodianPlugin instance

> Cross-owner access is read-only snapshot/command/event. Do not replicate this state as a second writable truth source.

## Entrypoints
- `src/main.ts`

## Dependency surface
- **Allowed owner dependencies:** `core.runtime`, `core.opencode`, `core.agents`, `core.storage`, `core.config`, `feature.chat-shell`, `feature.settings-shell`, `app.diagnostics-runtime`, `app.runtime`, `feature.inline-edit`, `core.canvas` (R-C5), `feature.canvas-integration` (R-C5)
- **Adjacent owners** (prefer editing these when out of scope): `core.runtime`, `core.opencode`, `app.diagnostics-runtime`, `app.runtime`, `core.pdf`, `app.pdf-runtime`, `core.canvas`, `feature.canvas-integration`

## Focused tests
- `tests/unit/entry-point/**`

## Required gates
Run before merge: `npm run typecheck`, `npm run module-docs`, `npm run build`.

## Hard invariants
- Do not cross `forbiddenDependencies`.
- Do not replicate canonical state in another owner.
- Changes here must update the matching `docs/modules/**` page (via `module-docs.config.json`).
- Run `npm run inspect:owner -- <this owner or a path>` for an always-fresh summary.

## SDK upgrade integration notes
- 2026-09-02: main.ts 为 ClaudeCodeAdapter 接入 SDK 0.3.252 `onUserDialog` 宿主回调（`refusal_fallback_prompt` 对话框经共享问题卡渲染，cancel 一律映射 CLI 默认行为）并声明 `supportedDialogKinds`；fail-safe——未接线路径行为不变。

## Pi owner boundary review (2026-09-08)

Bootstrap supplies only the Pi settings callback to adapter registration. Pi processes, protocol compatibility and session state belong to core.backend-pi.

- 2026-09-15: `inline-edit` 命令由 stub 改为 `editorCheckCallback` + `InlineEditController`，新增编辑器右键菜单项，启动末尾装配 `InlineEditHost`，`onunload` 先关闭进行中的行内编辑。
- 2026-09-17: `main.ts` 的品牌标记图标 id 改为从 `shared.brandingWordmark` 导入单一常量（注册与 ribbon 都用它），行为不变。
- 2026-09-17: bridge 新增 `listContextFiles` 注入（vault `md`/`txt`，过滤含 `<`/`>` 的路径），供行内编辑附加上下文选择器按需枚举。

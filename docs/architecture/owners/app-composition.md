# Owner: app.composition
> 2026-10-07：Claude MCP loader 可能在 configureVaultScopedServices 之前调用；组合读取使用现有 manager，尚未装配时从当前 vault 创建同类 project config reader。避免启动阶段把暂未准备的 manager 缓存为有效空 MCP 配置；不启动额外 OpenCode 服务。
> 2026-10-02（reviewed continuation，用户已授权）：Codex conversation 删除消费 native mutation 结果；failed/unavailable 或仅 admitted 时保留 storage、conversation 与 cache，原生 verified 后才提交本地删除。显式 local forget 与无 native thread 的本地草稿另行区分。main 在 native/storage await 后按 conversation ID 重查本地提交位置，避免并发删除或同 ID 重复完成误删邻项；只拥有删除流程的组合与本地提交，native ID/alias、原生回读和重试状态仍属于 Codex backend。
> 2026-09-30 (Codex 0.159 integration)：main.ts 抽出 `wireCodexBridgeHosts()`，负责构造 codex approval + elicitation bridge hosts；bridge 运行时所有权仍留在 adapter 边界内。
> 2026-09-22 (ZCode 票 01)：main.ts 的 wireHiddenAdapters 装配传入 `getZCodeSettings` 与 `getZCodeExtraEnv`（`getDomainEnvFor('zcode')`）；ZCode 仅装配，运行时状态留在 zcode adapter 边界内。
> 2026-09-21 (advantage-parity R-F2/R-F3/R-F4)：main.ts 在 preload 后注册一次 vault rename 以跟随会话绑定路径，批量 round 结束交 EditRevertService 冻结 post-image；R-F4 只组合既有 InlineCompletionService，设置/后端切换调排他预热，双开关均关闭才释放池。运行时所有权仍在原服务。
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

## 2026-09-27 OpenCode 2 compatibility

The composition root injects the OpenCode 2 settings callback into adapter wiring without moving process ownership into main.ts.

## 2026-10-05 Codex 消息前分支与恢复

Codex native child 的目录恢复复用同 native ID 的本地 conversation，保留历史与 session model override；local forget/native delete 边界和其他后端路径不变。

2026-10-07 owner manifest 核对：新增 `shared.foundation` 的 `src/shared/sessionCatalogReadback.ts`，统一目录读取结果与错误分类。本 owner `app.composition` 的路径映射、职责、canonical state 和依赖约束经核对保持原定义；目录读取仍由 backend/lifecycle owners 调用共享契约。

The plugin composition supplies Pi extension-command completion localization through the existing adapter wiring callback, keeping the Pi service boundary independent of the locale runtime.

## 2026-10-13 诊断报告输出策略

`buildDiagnosticReport` 在原报告组装末端选择共享 sanitizer 的严格 URL 策略；app.composition 仅拥有该输出策略选择，不新增 collector 或 runtime owner。完整 userinfo/fragment 隐藏，安全 endpoint/query 与报告结构保持。Pi 配置/状态没有新增到通用报告；mock clipboard/file 输出与 validation build 只提供源验证，不晋升 native 候选或矩阵条件。


## 2026-10-13 Claude elicitation admission handling

既有 handleClaudeCodeElicitation 负责收住 core.backend builder 的 schema 拒绝并返回 decline/cancel，拒绝时不准入 renderer、不记录输入或异常文本。正常 card/content 与 tab 回调路径保留；schema 校验仍归 core.backend，不向 main 新增运行时所有者。当前验证仅是生产 handler 与注入 renderer 的合成测试，未部署或取得 native/UI 验收。


## 2026-10-21 OpenCode 1 backend retirement

Bootstrap 不再构造/注册 `OpenCodeAdapter`：`AgentServiceRegistry` 中不存在 `opencode` adapter，`handleOpenCodeServerStatusChange` 移除已死的 registry 转发。`OpenCodeService` 仍休眠构造（memory runtime 与 legacy 只读引用；本地 server 自启动本就受 active-backend 门控）。默认后端经 core.types 归一化为 `opencode2`，由 wiring 层注册 `OpenCode2Adapter`。存量 `opencode` conversation owner 不改写，routing 视为不可用后端。

## 2026-10-23 DSH composition

组合层向既有 backend wiring 提供 DSH 设置读取及 `dsh` 域环境变量，并将该域纳入环境指纹计算。子进程与会话生命周期留在 core.backend；本 owner 不增加 DSH 原生运行时状态。

## 目录定位（2026-10-23）

当前源码目录：`src`。

目录整理沿用本 owner 的职责、状态和依赖约束；路径导航见[源码目录说明](../source-layout.md)。

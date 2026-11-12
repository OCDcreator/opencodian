> 2026-09-18 (FlowText parity R-A7): the composer input-shell host gains `addVaultPathContextFromDrop`, forwarding vault path drops to `composerContextViewFacade` (claimed drops preventDefault; editor text drops keep default insertion).
> 2026-09-21 (advantage-parity R-F1)：composer 队列条宿主 + view 四个队列动作（steer/撤回/立即发送/bar 刷新缝）。
> 2026-09-21 (advantage-parity R-E4)：composer chip 徽标按检索通道标注（透传字段）。
> 2026-09-21 (advantage-parity R-E6)：owner manifest 刷新——shared.foundation 的 include 新增 `src/shared/tokenEstimate.ts`（token 估算启发式）；本 owner 的边界与职责未变。
> 2026-09-21 (advantage-parity R-E2)：composer host 新增 Web Viewer 两缝。
> 2026-09-21 (advantage-parity R-E1)：OpenCodianView 的 composer host 新增 attachUrlContextToActiveTab（粘贴 URL → 网页 chip，零视图逻辑）。
> 2026-09-20 (advantage-parity R-D1)：OpenCodianView 的历史菜单 host 新增 exportConversationMarkdown 转发方法（导出逻辑不进视图）。

# Owner: feature.chat-shell

2026-11-11（共享工作台展示接线）：`mountSessionWorkbench` 转发文件摘要与变化通知、内联资源挂载；摘要 getter 带当前会话身份，sidebar 刷新前先交接展示归属，异步完成后由既有 coordinator 通知重投影，避免新会话暂显旧计数。视图内 `clearSlashCommandMenuPreload` 将已有目录失效信号转发 tools，不建立第二订阅。视图不持有目录缓存、工具草稿或文件统计；新一级布局与独立工具视图仍由 feature.chat-ui 实现。

2026-11-10：DSH 历史图片恢复仅在既有 native message merge 中补缺失／空 images 字段；同源由 sourceMessageId 或双边唯一的完整正文＋角色确认，不用短文字 includes 猜图像归属。未确认本地消息存在时保留整个 previous，不做有损提交，当前批次新更新也暂不采纳。已有附件、原文、ID、模型与上下文不被替换，图片-only 变化经原有 fingerprint/write ticket 持久化。上下文详情只按打开时捕获的 DSH sessionId 转发账本 loader，view 不持有 trace 或附件第二缓存。其它后端合并规则不变。

2026-11-10：DSH effort 标签只在 `mountChatEffortSelector` 的展示回调内重命名（`off`→关闭思考、继承项“继承默认（{effort}）”）；原始 variant、发送解析与持久化（undefined→null / 'off'→'off'）一字未动，view 不新增运行时所有权。

2026-11-10：会话入口目录刷新钩子更名 `refreshSessionCatalogForCurrentConversation` 并加 DSH 早分支——有 owned 会话的 DSH 恢复后自动重读自有会话目录（复用 `reloadModelCatalog` 的 fence 与历史模型标签刷新链），挂载期早跑导致的历史气泡原始引用问题由此修复；无 owned 会话保持空目录不借用。ZCode 恢复/会话状态/任务观察仍严格 gated ZCode，其他后端零变化；view 不新增运行时所有权。

2026-11-09：DSH 原生会话控制只增加窄 host 组合：Todo capability 查询／刷新和当前 adapter 读取。2026-11-10 起 selector host 不再提供 DSH 设置深链钩子（selector host 恢复基线）；同日 workbench 组合面新增窄 host callback `openBackendSettings`，DSH 后端经恢复的 `ChatPluginPort` settingsTab Pick 成员 `prepareScrollToDsh` 定位既有 DSH advanced 设置页（phase1 批准的 scoped 范围，实现归 settingsTab 组合根）。权限／Plan、任务与 PTY 的请求／事件／状态保留在相邻 coordinator、UI 与 backend owner，OpenCodianView 不持有第二份运行时状态。
> 2026-10-26（DSH UI 修复）：视图把 DSH 显式 effort 覆盖、原生默认显示值和下一轮生效说明交给既有 EffortSelector，并向消息 renderer 转发按历史模型身份查找显示名的只读方法。发送采用的有效值仍走原链路，视图不新增模型目录或协议状态。
> 2026-10-24（DSH）：视图转发会话模型/推理持久化与后端独立 diff 读取；保存恢复和原生配置仍由 selection coordinator / adapter 承担，不引入视图内会话运行时。
> 2026-09-30 (Codex 0.159 integration)：
> - OpenCodianView capability-change 缝加固：`CAPABILITY_CHANGE_REFRESH_CAPABILITIES` churn guard + capability 变化时排队刷新 follow-up bar。
> - `installCodexApprovalHostContext` 扩展 `questionCardRenderer`/`elicitationCardRenderer`；`ChatPluginPort` 的 context `Pick` 放宽。
> 2026-09-25 (FA880): The background panel host forwards native ZCode read/cancel operations with explicit session and task IDs; OpenCodianView does not synthesize task status.
> 2026-09-25 (FA880): `showPermissionDialog` forwards a ZCode-only requestId/sessionId pending read to the inline permission card so teardown and timeout can clear that exact UI decision surface.
> 2026-09-24 (ZCode image recovery)：OpenCodianView forwards the composer preparation acknowledgement callback into the send pipeline; it does not clear or recreate image chips itself.
> 2026-09-24（ZCode）：后端切换时，视图先切换目标 conversation，再读取该 conversation 的 capabilities 重建 composer toolbar；不能用上一个后端的能力位决定新工具栏是否挂载权限模式控件。
> 2026-09-21 (advantage-parity R-F2/R-F3/R-F5/R-F6)：OpenCodianView 只组装绑定笔记、preview-first 回退、会话 rail 与 Vim 键协调器的窄 host port；rail 与历史菜单共享 active-backend 会话筛选和既有 load/recovery，宽面板并排、窄面板隐藏；Vim 事件只挂聊天根且避开输入/overlay。ChatPluginPort 仅扩展所需设置读取面，不引入第二份会话状态。

Pricing readiness (2026-09-10): the shell supplies catalog subscription and per-tab billing identity ports; ActiveTabContextUsageCoordinator owns recomputation and listener lifecycle. Details callbacks remain pinned to the originating tab/session.

> Auto-generated scaffold from `architecture-owners.config.json`. The manifest is the canonical truth source; this page narrates the model and records hard-to-automate rationale. Update it when the owner boundary or its non-obvious invariants change.
- 2026-09-17 (composer sizing settings): OpenCodianView 给 Composer host 新增 `getComposerTextareaMaxHeight()`（读 chatAppearance.input.textareaMaxHeight）；ComposerInputShellCoordinator 的文字区高度上限从硬编码 240 改为 host 提供 + 120–480 兜底。边界不变。
- 2026-09-13 (universal memory backend): owner manifest gained `core.memory` and `app.memory-runtime`; this owner's boundary itself is unchanged (no source touched, allowlist untouched).

- **Layer:** `feature` (may import layers: shared, core, feature)
- **Risk:** high
- **Include:** `src/features/chat/**`

## Responsibilities
- main chat view runtime (OpenCodianView): ItemView lifecycle, DOM mount, tab/stream forwarding
- concurrent tab/session streaming orchestration
- conversation reload hydration/auth-sync

## Canonical state (truth home)
- OpenCodianView tab/stream/conversation runtime state
- chat view scroll-restore state

> Cross-owner access is read-only snapshot/command/event. Do not replicate this state as a second writable truth source.

## Entrypoints
- `src/features/chat/OpenCodianView.ts`

## Dependency surface
- **Allowed owner dependencies:** `shared.foundation`, `shared.diagnostics`, `core.opencode`, `core.agents`, `core.config`, `core.storage`, `core.runtime`, `feature.chat-runtime`, `feature.chat-services`, `feature.chat-rendering`, `feature.chat-ui`, `feature.chat-tabs`, `feature.chat-diagnostics`
- **Forbidden dependencies:** `app`
- **Adjacent owners** (prefer editing these when out of scope): `app.composition`, `feature.chat-runtime`, `feature.chat-services`, `feature.settings-debug`
- **Delegates to:** `feature.chat-rendering`, `feature.chat-runtime`, `feature.chat-services`, `feature.chat-tabs`, `feature.chat-ui`, `feature.chat-demos`, `feature.chat-diagnostics`, `feature.chat-misc`

## Focused tests
- `tests/unit/features/chat/OpenCodianView*.test.ts`

## Required gates
Run before merge: `npm run typecheck`, `npm run module-docs`, `npm run build`.

## Recent change notes
- **2026-10-09 Codex model selection:** the view reads the effective model from the current conversation and captures that same value in the top-level send options and `codexOptions`. Direct model setters save the captured conversation through the existing session settings coordinator; failure restores only that operation's still-current settings. Default/null selections inherit the global model. Other tab state and other backend selection paths keep their existing ownership.
- **Turn change record visibility:** the chat plugin port exposes the global `showTurnChangeRecords` display preference to the runtime without making the shell a second store for persisted notices.
- **Session sidebar hydration:** the shell passes the active conversation's persisted messages to the modified-files coordinator and refreshes that surface when active-backend capabilities hydrate, after plugin-reload first-tab restore, after new-tab or current-tab identity actually changes (conversation id or backend session id), and after a Turn Change Record persists successfully. Creation wrappers do not refresh for max-tabs/no-op returns with unchanged identity, avoiding duplicate work while preventing stale previous-session diffs.
- **Turn-diff host seam:** `createAssistantNoticeCardRendererHost()` exposes the two narrow turn-diff capabilities — `resolveVaultRelativePath()` (shared `toVaultRelativePath()` + `getVaultBasePath()`) and `openVaultFile()` (vault-relative `workspace.openLinkText()`); the shell owns the Obsidian side effects so the runtime renderer stays `App`-free.
- **Render-chain concurrency guards:** the shell's settings path merges question-card display toggles into a single `refreshQuestionUi()`; conversation rerenders are serialized with generation checks, `loadConversation` is pinned per-tab and abortable, and clicking the already-active tab short-circuits instead of rehydrating. Both `clearMessagesContainer` seams dispose registered collapsibles before emptying the container.
- **Notice direct-DOM cache invalidation:** the `PersistentAssistantNoticeService` host seam's `renderAssistantMessage` callback appends a notice directly to the live pane (bypassing the full-rerender commit), so it now calls `conversationRenderService.invalidateRerenderFingerprint()` first, preventing a later full refresh from short-circuiting as a no-op and leaving the notice in place.

## Hard invariants
- Do not cross `forbiddenDependencies`.
- Do not replicate canonical state in another owner.
- Changes here must update the matching `docs/modules/**` page (via `module-docs.config.json`).
- Run `npm run inspect:owner -- <this owner or a path>` for an always-fresh summary.

## SDK upgrade integration notes
- 2026-09-02: view 订阅 `ClaudeCodeAdapter.onCommandsChanged`（SDK 0.3.252 `system/commands_changed` 信号）即时失效 slash 命令菜单缓存；镜像 Codex `onSkillsChanged` binding 模式，生命周期随 view teardown 退订。

## Pi owner boundary review (2026-09-08)

The shell supplies the Pi slash-catalog discriminator only. All Pi runtime lifecycle remains behind the registered AgentService adapter.

## Model selection host app seam (2026-09-11)

`createChatSelectionControlsCoordinatorHost()` now supplies `getApp: () => this.app` so the selection controls can resolve local bundled provider icon resource paths. This is a host port only — the shell does not gain icon-resolution logic.

- 2026-09-15: `OpenCodianView` 增加两个只读访问器 `getActiveConversationBackendKind()` / `getActiveTabModelRef()`，供 inline edit 宿主在 `editorCallback` 之外解析当前聊天 tab 的后端与模型；未新增运行时归属。
- 2026-09-17: `OpenCodianView` 的品牌标记图标 id 改为从 `shared.brandingWordmark` 导入（原先在 view 内自存一份字面量），行为不变。> 2026-09-24 (票 06)：OpenCodianView 的斜杠缓存宿主接入 loadZCodeRuntimeCommands（ZCode 实时目录直取归一为既有 / 条目），其余后端语义不变。

## 2026-09-27 OpenCode 2 compatibility

The chat view routes OpenCode 2 model, permission, form, slash catalog, context and authoritative history reads to its native adapter.

2026-10-02：聊天 shell 为 Codex 显式本地遗忘提供既有 host forwarding，原生删除仍需要 verified；失败项标签与 identity 保留。运行时处理继续由 history/lifecycle owners 承担。
2026-10-05 Pi-only continuation：composer host 的 Pi model/effort 选择绑定到当前 conversation.sessionSettings，切换/重开/reload 读取同会话的下一发送值；显式继承与 off 文案分开。View 只装配既有 Pi 保存 seam 和动态 catalog，不拥有 native setter/runtime；其他 backend 控件策略不变。

## 2026-10-05 Codex 消息前分支与恢复

OpenCodianView 只转发 Codex 目录恢复到插件既有桥，保持 view/runtime ownership 分离。

2026-10-07 owner manifest 核对：新增 `shared.foundation` 的 `src/shared/sessionCatalogReadback.ts`，统一目录读取结果与错误分类。本 owner `feature.chat-shell` 的路径映射、职责、canonical state 和依赖约束经核对保持原定义；目录读取仍由 backend/lifecycle owners 调用共享契约。


2026-10-07 Pi queue history：view 的 native adapter 分支只转发规范化快照及 serialized write，纯 message metadata 合并由既有 feature.chat-services owner 承担；不增加 view-local Pi runtime ownership。


> 2026-10-08 ZCode selection: 会话级 model override 与每模型 reasoning override 经既有保存/归一化链持久化，null 档位继承 native 模型默认；view 重载与切会话分别回读，保存失败只回滚发起会话。保存值不代替 native options 生效证据。

> 2026-10-21（chat 卡片 UI 修复）：`keepQuestionCardPinnedToBottom()` 在 pin 前调用 `ScrollManager.ensureComposerOverlayScrollReserve()` 实测 composer 叠加并补 pane 预留（F1，含后台 tab）；`setComposerStackHeight()` writeback 在权威测量值变化时清除 pane 级 stopgap。view 只转发元素，几何判定留在 feature.chat-services。

## 2026-10-23 DSH permission forwarding

聊天视图把 DSH 权限卡片的回复和待办查询转发给 tab 会话所属 adapter。权限选项映射和 ACP request correlation 由 core.backend 管理，视图不通过 OpenCode 服务回答 DSH 请求。

## 目录定位（2026-10-23）

当前源码目录：`src/features/chat`、`src/features/chat/retrieval`。

目录整理沿用本 owner 的职责、状态和依赖约束；路径导航见[源码目录说明](../source-layout.md)。


2026-10-26 现场 Escape 补充：wireEventHandlers 的既有 Scope 先向当前 EffortSelector 转发关闭请求，再执行已有 popover/stream cancel 链；这是一条 UI 转发缝，不在 view 中复制菜单状态，也不按 composer 重建次数积累注册。


2026-10-26 现场目录时序补充：selection 的目录就绪回调只把当前 chat 根转交既有 shell renderer adapter，保持 DOM 更新归 runtime renderer。

2026-10-27 单轨 Composer：OpenCodianView 只调整 host 装配，把 `modelContainer` 转交 selection controls，并让 effort 由 selection host 内联到模型弹层；发送/停止、草稿、per-tab streaming、IME、附件与多标签状态仍由原 runtime owner 持有。状态栏移到 composer shell 之外，ContextRing 位置变化不改变 modal 或 context usage 数据流。

2026-10-28 owner manifest 核对：仅 app.memory-runtime 的模型调用依赖由 core.opencode 改为 core.backend 通用只读辅助能力；本 owner `feature.chat-shell` 的 include、职责、canonical state 与依赖规则逐项对比 HEAD 均未改变。

## 2026-10-30 会话标题

OpenCodianView 标题状态更新委托标题服务，只装配当前会话模型、更新标签/rail、挂载重试和恢复。
- 2026-11-12 (claude-provider-clarity) owner manifest 核对：与基线 1d3fa289 对 architecture-owners.config.json 做程序化逐 owner deep-equal 对比，全仓仅 feature.settings-claude 的 include 纯插入新增 `src/features/settings/backends/claude/SettingsClaudeProviderModals.ts`（无删除、无其他字段变化）；本 owner（feature.chat-shell）的 include、responsibilities、canonical state 与依赖约束逐项对比未变。此为 manifest-diff 核对记录，不构成全量架构评审。

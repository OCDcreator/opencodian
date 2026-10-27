> 2026-09-21 (advantage-parity R-F5/R-F6 质量修复)：ConversationSessionRailCoordinator 的 rail 由无名 generic div 改为 `role="navigation"` landmark（`aria-labelledby` 指向自身可见标题，标题带 heading 语义，per-instance id）；ChatVimNavigationCoordinator 的 `shouldHandle()` 显式避让 Shift 修饰键，避免 `Shift+W/S/I` 被大小写不敏感归一化吞掉。
> 2026-09-18 (FlowText parity R-A7): context services extend to folders and multi-select — `ContextFileCatalogIndex/Service/BuildRunner` index `TFolder` entries (no extension buckets, folder-first ordering), `ContextFilePickerModal` becomes multi-select (`chooseContextFiles` returning `TFile | TFolder` entries with a confirm footer), `ComposerContextPickerActionService` attaches every picked entry via the new `ContextAttachmentBuilder.buildEntryContextItem` and claims vault drops via `addVaultPathContextFromDrop` (`getAbstractFileByPath` + instanceof hard gate), `ComposerContextViewFacade` exposes the drop port, and `PromptContextKind` gains `'folder'` (path-only items, never a text snapshot).
> 2026-09-21 (advantage-parity R-F1)：新增 QueuedFollowUpBarCoordinator；tab 运行时队列升级多条 FIFO；prepare service 队列事件缝。
> 2026-09-21 (advantage-parity R-E4)：VaultRetrievalComposerCoordinator 新增语义通道合并注入与通道标注。
> 2026-09-21 (advantage-parity R-E5)：新增 DataviewContextInliner（dataview 块执行内联 / 不可用如实标记）。
> 2026-09-21 (advantage-parity R-E6)：owner manifest 刷新——shared.foundation 的 include 新增 `src/shared/tokenEstimate.ts`（token 估算启发式）；本 owner 的边界与职责未变。
> 2026-09-21 (advantage-parity R-E2)：新增 WebViewerContextService（活动 Web Viewer 标签页 → R-E1 url 条目；未启用无入口）。
> 2026-09-21 (advantage-parity R-E1)：新增 UrlContextFetchService（本地抓取 + SSRF 三层防护 + 零依赖 HTML→MD 降级）；composer 粘贴整段 URL 成 chip；发送时抓取 pending 条目并逐条本地化失败 Notice。
> 2026-09-20 (advantage-parity R-D1)：ConversationHistoryActionsCoordinator 每条会话新增「导出为 Markdown 笔记」按钮（可选 host 方法，未提供不渲染）。

# Owner: feature.chat-services
> 2026-10-26（DSH UI 修复）：ComposerInputShellCoordinator 为输入框持有独立的本地化隐藏 label；ChatSelectionControlsCoordinator 补模型入口键盘打开行为，并仅按完整 provider/model 身份查询目录显示名。这些 DOM 与查询职责沿用现有 owner，不增加第二份模型选择状态。
> 2026-10-24（DSH）：selection coordinator 消费原生目录并绑定发起选择的会话；生产发送 host 把模型/推理覆盖送入 preparation 与 adapter；命令目录、权限模式与上下文读取按后端隔离。DSH 的 aggregate occupancy 不补用 OpenCode 数据。
> 2026-10-02（reviewed continuation，用户已授权）：会话单删/批删的失败和 pending 不被渲染成整体成功；只清理已确认成功项的标签页，失败项保留选择、会话与可重试状态，并在必要时恢复有效 active tab。删除命令由 host 转发，服务不建立第二套 native deletion 真值，也不越过 backend 的 admission/readback 判定。
> 2026-09-28: OpenCode 2 slash autocomplete uses its native command and skill catalog, independent of OpenCode 1 project config.
> 2026-09-25 (FA880): QuestionRuntimeHostAdapter supplies the inline card an authoritative tab/session/requestId pending read, preserving other tabs and callback-only backends.
> 2026-09-25 (ZCode acceptance): The model binding keeps the native create catalog on a deferred read failure; the chooser waits for a real model before its first visible paint. QuestionDockCoordinator watches only authoritative pending reads while a waiter exists, clearing a lost-process card in its original tab.
> 2026-09-24 (ZCode image recovery)：ComposerInputShellCoordinator waits for the preparation outcome before clearing image/text drafts; MessageSendPreparationService performs the selected ZCode model capability preflight before optimistic append.
> 2026-09-21 (advantage-parity R-F2/R-F3/R-F5/R-F6)：ConversationSessionSettingsCoordinator 与 ModifiedFilesSidebarCoordinator 只转发绑定元数据，不伪造 diff/revert；新增 ConversationSessionRailCoordinator 从 host 读取权威列表、按现有加载路径切换且流式时阻止，ChatVimNavigationCoordinator 仅持有 root-scoped 键监听器。两者不持久化第二套会话真值，关闭 view 时释放 DOM/监听器。

Pricing readiness (2026-09-10): the context usage coordinator fills unavailable live-tab costs on catalog updates and snapshot restoration. Existing numeric costs, token ledgers and activity timestamps remain unchanged. Closing the view unsubscribes and flushes pending snapshots before discarding timers.

> Auto-generated scaffold from `architecture-owners.config.json`. The manifest is the canonical truth source; this page narrates the model and records hard-to-automate rationale. Update it when the owner boundary or its non-obvious invariants change.
- 2026-09-13 (universal memory backend): MessageSendPreparationService plans the per-epoch memory injection and merges it into the send options bag.

- **Layer:** `feature` (may import layers: shared, core, feature)
- **Risk:** high
- **Include:** `src/features/chat/services/**`

## Responsibilities
- chat services: context usage, scroll, conversation sync, background tasks, slash commands, title generation, model selection, session todo
- conversation history, write serialization, post-sync coordination

## Canonical state (truth home)
- conversation sync orchestration state
- slash command menu catalog cache
- context usage service state
- title generation service

> Cross-owner access is read-only snapshot/command/event. Do not replicate this state as a second writable truth source.

## Entrypoints
- `src/features/chat/services/rendering/ScrollManager.ts`
- `src/features/chat/services/context/ContextUsageService.ts`
- `src/features/chat/services/commands/SlashCommandMenuCatalogCache.ts`
- `src/features/chat/services/title/TitleGenerationService.ts`

## Dependency surface
- **Allowed owner dependencies:** `shared.foundation`, `shared.diagnostics`, `core.types`, `core.prompts`
- **Forbidden dependencies:** `app`
- **Adjacent owners** (prefer editing these when out of scope): `feature.chat-shell`, `feature.chat-runtime`, `feature.chat-diagnostics`
- **Delegates to:** `feature.chat-diagnostics`, `feature.chat-misc`

## Focused tests
- `tests/unit/features/chat/services/**`

## Required gates
Run before merge: `npm run typecheck`, `npm run module-docs`.

## Recent change notes
- **2026-10-27 Model/effort popover geometry:** `ChatSelectionControlsCoordinator.updateModelSelectorEffortDisplay()` resynchronizes the open popover after changing trigger text. This accounts for a moving right-aligned anchor even when the chat boundary size is unchanged; callbacks and backend ownership remain unchanged.
- **2026-10-09 Codex model selection:** the model menu resolves custom input before saving and keeps the existing menu persistence path as its one save owner. Direct setters use the view host path instead. Both paths target the initiating conversation; a later tab switch cannot redirect save or feedback. The Codex wrapper preserves a requested model during catalog refresh, including unavailable requests, and leaves an unconfigured default empty so send validation remains authoritative.
- **Selection stability:** focus preview and retained-highlight capture receive the same resolved MarkdownView/editor, including parameterless selectionchange refreshes. Polling must not alternate a valid editor capture with a missing-editor clear. Composer/conversation focus still preserves a valid selection, while editor deselection clears it.
- **Authoritative-sync preservation:** persistent assistant notices share the conversation write queue with authoritative sync. A notice for the currently visible conversation is committed to that live conversation object even when the caller still holds a detached same-ID reference. Valid turn-change records are persisted before visible rendering, deduplicated by their anchored user-message ID, and narrowly rebased if they arrive after merge calculation but before serialized commit; malformed or generic local notices do not receive that preservation rule.
- **Session sidebar fallback:** `ModifiedFilesSidebarCoordinator` keeps cached OpenCode `session.diff` as the primary source, but when that cache is empty it may derive a reload-safe, file-deduplicated fallback from the active conversation's persisted Turn Change Records. The fallback is gated by both a ready capability state and a non-null OpenCode session id.
- **Turn-record sidebar signal:** `ConversationNoticeCoordinator` emits `refreshSessionChangeSidebar()` only after a Turn Change Record has been persisted successfully. Early returns and persistence failures emit no refresh signal.
- **Conversation render concurrency + reconcile:** full conversation rerenders are serialized with a generation guard so re-entrant callers cannot interleave appends; `loadConversation` runs per-tab generation/abort checks; visible-conversation sync during hydration is deferred and retried (bounded), never silently dropped. Scroll restore snapshots are captured before any container clear, user scrolling during restore wins over the capture-time stick-to-bottom decision, and late-loading content re-applies the anchor inside a 1500ms window.
- **Full-rerender unchanged no-op:** `performRerenderConversationMessages` short-circuits when the render-input fingerprint (conversation id + each rendered message serialized in FULL via JSON.stringify, covering all DOM-affecting fields without field enumeration + empty-notice flag + host `renderInputSettingsSignature()` covering renderUserMarkupAsCodeBlocks / questionCardPosition / showAnsweredQuestionCards / locale) is identical to the last successful commit's fingerprint for the SAME messages container. The cache is written only after a successful staging→clear→commit with a final owner/generation re-check, and is invalidated by every ConversationRenderService live-DOM mutation path (renderMessages, incremental sync, trailing patch, single-message rerender, ad-hoc render) plus the public `invalidateRerenderFingerprint()` for external direct-DOM writers (e.g. PersistentAssistantNoticeService), and by a container identity change.
- **Keyed reconcile:** `ConversationKeyedReconcileDelegate` reconciles authoritative-sync updates by stable message identity (keep/update/insert/turn-level move, composite ids from consecutive-assistant merges) and preserves DOM node identity plus collapse state; the full rebuild remains the fallback when reconcile declines.

## Hard invariants
- Do not cross `forbiddenDependencies`.
- Do not replicate canonical state in another owner.
- Changes here must update the matching `docs/modules/**` page (via `module-docs.config.json`).
- Run `npm run inspect:owner -- <this owner or a path>` for an always-fresh summary.

## Pi owner boundary review (2026-09-08)

PiModelSelectionBinding owns Pi selector policy; send preparation and slash dispatch route Pi explicitly. Pi catalog reads do not use OpenCode runtime resources.

## Model selector icon host port (2026-09-11)

`ChatSelectionControlsCoordinatorHost` gained `getApp(): App`, and `ChatSelectionControlsCoordinator` forwards it as the new `app` field when rendering the model list, so provider group header icons resolve through the same route as the async icon cache. Resolution rules stay with `shared.utils-icons`; this owner only passes the host through.

- 2026-09-15: Owner 模型新增 `feature.inline-edit`（行内编辑：CM6 内嵌输入框 + 原位词级 diff + 单次 `replaceRange` 落盘），owner 表已更新；本 owner 的边界与职责未变。
- 2026-10-09（Pi standard UI）：`PiExtensionUiHost` 补齐标准 setStatus/setWidget 的文本投影，并将 setTitle 映射为同 view header 下方的可见 transient 文本（空串隐藏）。本 owner 持有 App/session/当前连接 signal 隔离的临时 UI 及节点所有权；旧/aborted signal 不能夺回替换连接。View 只在既有身份/layout/close 接缝转发，多 leaf 同步、关闭只解绑该 view；无 native/conversation/tab title 写入或新的 runtime owner。四类 dialog 回包、五类 fire-and-forget 零回包分类不变；九方法代码验证不外推 startup ask/cancel/custom message 或两机 UI 完成。原 2026-09-17 刻意忽略 status/widget 的宿主策略已由此标准文本适配替代。

> 2026-09-24 (票 06)：ChatSelectionControlsCoordinator 增包 bindZCodeModelSelection（zcode 活动时接管选择器、实时目录+档位 variants）；SlashCommandMenuCatalogCache 新增 loadZCodeRuntimeCommands 口与 zcode 分支；新增 ZCodeModelSelectionBinding。

## 2026-09-27 OpenCode 2 compatibility

Selection, history sync, recovery and slash command services recognize OpenCode 2 while retaining their tab and session identity guards.
2026-10-05 Pi-only continuation：PiModelSelectionBinding 以 SDK per-model thinkingLevels 为尚未发送的模型提供 variants，避免 catalog reload 依赖当前 native 模型。Pi selection 保存复用该文件的 conversation-only seam，失败恢复捕获的 snapshot，不建立第二套 process/native 真值；非 Pi host 保持原委托路径。

## 2026-10-05 Codex 消息前分支与恢复

Codex 模型目录发送准备和旧历史身份恢复在既有服务 owner 内闭合；旧历史只接受 native ID/唯一 owning-turn 证据，文本/下标猜测拒绝。Codex fork 继承其 session settings。

2026-10-07 owner manifest 核对：新增 `shared.foundation` 的 `src/shared/sessionCatalogReadback.ts`，统一目录读取结果与错误分类。本 owner `feature.chat-services` 的路径映射、职责、canonical state 和依赖约束经核对保持原定义；目录读取仍由 backend/lifecycle owners 调用共享契约。


## 2026-10-08 Cold-start model catalog retry

Opening the model picker refreshes an unloaded/empty catalog through the existing reloadModelCatalog path. This retries a startup CLI fallback after native model/list becomes ready. A populated snapshot is reused; no synthetic model or new runtime owner is introduced.


2026-10-07 Pi completion history reconcile 的纯 metadata/identity 合并放在现有 authoritative merge 模块；原生历史仍归 PiAdapter，不读取 SDK/进程或建立新会话真值。

OAuth URL notices retain a request-ID scoped abort lifetime without a protocol response. Native login settlement cancels oauth-link, hides the authorization link, and releases its listener; ordinary timed notifications are unchanged.

Claude SDK forks rewrite native UUIDs. Fresh Claude prefix clones discard parent sourceMessageId/sourceTurnId and use the existing child identity readback before opening. Readback failure leaves identity unavailable rather than copying a parent UUID; original messages are not mutated.


> 2026-10-08 ZCode selection: 会话级 model override 与每模型 reasoning override 经既有保存/归一化链持久化，null 档位继承 native 模型默认；view 重载与切会话分别回读，保存失败只回滚发起会话。保存值不代替 native options 生效证据。

> 2026-10-21（chat 卡片 UI 修复）：`ScrollManager` 新增 `ensureComposerOverlayScrollReserve()`（F1：composer 叠加高度实测 > 预留快照时给 pane 写行内 stack-height stopgap，兼容 shadcn 静态布局 no-op）；`ComposerInputShellCoordinator` 新增 send/stop cancel settle window（F2：cancel 后控件立即收敛并禁用 200ms，窗口内点击吞掉，结束后按 streaming 实况恢复 send/stop）。均为本 owner 内的既有文件扩展，无新增模块与依赖边界变化。

## 2026-10-23 DSH send preparation

DSH 发送跳过 OpenCode 1 专属技能目录展开，保留通用上下文和显式 synthetic parts 的准备过程。DSH 原生提示构造与执行由 core.backend 负责，本 owner 不为其读取 OpenCode 的技能或模型目录。

## 目录定位（2026-10-23）

当前源码目录：`src/features/chat/services/background`、`src/features/chat/services/commands`、`src/features/chat/services/composer`、`src/features/chat/services/context`、`src/features/chat/services/conversation`、`src/features/chat/services/integrations`、`src/features/chat/services/questions`、`src/features/chat/services/rendering`、`src/features/chat/services/selection`、`src/features/chat/services/send`、`src/features/chat/services/surface`、`src/features/chat/services/sync`、`src/features/chat/services/title`。

目录整理沿用本 owner 的职责、状态和依赖约束；路径导航见[源码目录说明](../source-layout.md)。


2026-10-26 现场目录时序补充：selection reload 完成目录发布后通过可选 host 通知刷新历史模型名；服务不直接持有 renderer DOM 或修改历史消息。

## 2026-10-27 单轨 Composer shell

ComposerInputShellCoordinator 拥有新的单行底栏（附件 / permission / Agent / 模型·effort / send）与 composer 外状态栏；permission 与 Agent 使用独立 slots，Agent 仅在 capability 允许时挂载且不显示图标。selection controls 通过可选 `modelContainer` 分栏挂载，effort 由 ChatSelectionControlsCoordinator 在模型弹层内挂载。ContextRing 只换宿主位置，ContextDetailModal、context usage 数据与状态栏计数仍走既有 services。

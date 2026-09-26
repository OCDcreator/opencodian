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
- `src/features/chat/services/ScrollManager.ts`
- `src/features/chat/services/ContextUsageService.ts`
- `src/features/chat/services/SlashCommandMenuCatalogCache.ts`
- `src/features/chat/services/TitleGenerationService.ts`

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
- 2026-09-17: `PiExtensionUiHost` 收窄主机面：只渲染需要用户回复的四个对话框方法，以及能落到既有界面的 `notify` / `set_editor_text` / `setTitle`；`setStatus` / `setWidget`（Pi 终端状态行，第三方 MCP 扩展用它报告服务器数量）不再落地。这两个方法官方不需要响应，忽略不会阻塞 RPC 往返（`PiSessionRuntime` 只对 select/confirm/input/editor 回包）。> 2026-09-24 (票 06)：ChatSelectionControlsCoordinator 增包 bindZCodeModelSelection（zcode 活动时接管选择器、实时目录+档位 variants）；SlashCommandMenuCatalogCache 新增 loadZCodeRuntimeCommands 口与 zcode 分支；新增 ZCodeModelSelectionBinding。

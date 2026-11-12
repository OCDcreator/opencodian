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

2026-11-11（共享工作台展示端口）：`SessionWorkbenchCoordinator` 将现有文件摘要纳入展示 state 指纹，并一次性转发稳定的内联资源挂载端口；`ModifiedFilesSidebarCoordinator` 只读转发 sidebar 已计算的摘要，通过会话身份 fence 拒绝旧归属；当前代际同步更新／异步完成后通知重投影，读取中保留 loading。它不新增 Git/native 读取或计数缓存。任务、Plan、子会话及 capability 的权威投影和操作租约保持在 `SessionInformationCoordinator` 与 backend owner，一级活动布局不建立第二任务生命周期。目录数据继续复用共享 slash catalog 来源，面板 DOM 稳定性由 feature.chat-ui 承担。

2026-11-10（DSH 官方权限菜单展示）：`PermissionModeSelectorCoordinator` 仅在 DSH 分支识别 generation ID 的四种内置预设，投影官方双语名称与图标；host 自定义名称、目录顺序、选中 ID 与写回参数不变。`auto` 仅在真实目录存在时带 EXP，窄 trigger 与 aria-label 保留实验标记，离开 auto 清除。权限读取／修改／独立确认与代际隔离继续由 `DshNativeSessionControls` 持有，展示层不启用扩展、不扩大权限；其他后端复用回归覆盖。

2026-11-10（compact effort 后备）：`ChatSelectionControlsCoordinator.updateModelSelectorEffortDisplay` 的 short span 回退完整标签，窄容器（≤500px）不再因空缩写把整个 effort 后缀渲染成 0×0；disabled 标签仍用 disabledShort。无 CSS/布局契约变化。

2026-11-10（DSH 子会话续接协调 + literalOnly @subagent 来源）：`SessionInformationCoordinator.refreshChild` 仅对 `mode==='continuable'` 的直属孩子探测 `canContinueChildSession`（true/false/'unknown' 三态，探测异常按 unknown，one-shot/external 不探测）；`continueChild` 校验 owner 会话、child mode、capability 与探测结果后经 `AgentChildSessionContinuationCapability.continueChildSession` 发送（queue/steer），`childSends` 单飞防重入。accepted 只是原生 inbox 收据，成功后仅清「已接受且未再编辑」的草稿并强制刷新转录；六个白名单 failureCode 映射专属文案，无 failureCode 的未知结果（超时/传输中断/代际过期）如实呈现「未能确认投递结果」、保留草稿、不自动重发、绝不回退父会话发送；迟到回执按 owner/session 归属丢弃。`AgentMentionComposerController` 的子代理候选一律 `literalOnly`：只插入字面 `@label ` 纯文本，不建 tracked pill、不产生 reference span、不经 nativeMentions 校验，因此不授予续接或任何写权限；重名标签刻意不获续接语义。能力与目录真值归 core.backend，子会话工作台视图归 feature.chat-ui。终版竞态闭合（custom+Kimi 复核，2026-11-10 通报）：`probeChildContinuation` 纯返回探测证据、不写槽位，`refreshChild` 仅在重验 identity 槽位未被换且 registry 服务实例未变后提交 probe 结果；`continueChild` 在探测后、revalidate await 返回后提交前、以及 send receipt 提交前三次经同一 `isCurrent()` 完整租约门（disposed + identity 槽位 + 活跃会话 identity 含 tab + 活跃会话原生 sessionId + registry 服务实例）；`childReads`/`childTimes` 键为 identity（含 tab）+ 原生父会话 + child id，不跨 tab 共享；`SessionWorkbenchCoordinator.actions.refresh` 先同步 `this.refresh()` 重投影静默 composer 编辑，再后台强制刷新 goal/tasks/child，权威读取全部挂起也不丢新草稿/caret。真实用例修复前 FAIL、修复后 34 PASS，Kimi 复核关闭；该修复无 source pre-edit 基线快照，作为证据边界如实保留、不构成功能缺陷。

2026-11-10（DSH 历史同步 source-less 保守规则）：DSH 服务端历史合并中，上下文前后缀、重复正文或旧降级 blob 都不是消息身份证据；存在身份不能确认的 source-less 本地消息时，该次合并整批保持本地旧消息且不提交，同批其他服务端更新一并暂不采纳；重复正文不能确认归属时不推断、不借用其他回合的图片。图片回填仅对身份已确认且本地 images 为空的 DSH 匹配消息采用服务端图片。合并实现缝在 view 侧 sync（feature.chat-shell 持有 `OpenCodianView::syncConversationMessagesFromServer`），由本层 sync bridge 与 send finalization 驱动并消费其结果。

2026-11-09（DSH Jobs 完成链路）：SessionInformationCoordinator 的权威 Jobs 初始/恢复/事件列表通过只读 snapshot 与 adapter-generation/conversation/tab lease 进入现有 BackgroundTaskTimelineService。TimelineLaunchService 依据真实 owner、job ID 和 startedAt 映射逐回合锚点；NoticeStateService 复用 CompletionNoticeService/PersistentAssistantNoticeService，在 foreground 结束后按 session+job source ID 去重落盘。失效/失败不推断 stale 或完成；不存在额外模型通知或第二套任务真值。

2026-11-10（DSH composer 布局恢复 + phase2 定案）：`ChatSelectionControlsCoordinator` 的 DSH 权限分支不挂载任何 DSH 专属控件条；Native DSH 经**同一个通用 permission selector** 绑定 `DshNativeSessionControls` 的非渲染 preset 状态（native DSH only），ACP 分支不挂载 selector、保留空基线权限槽。同文件新增的 `DshNativeWorkbenchControls` 由 `SessionInformationCoordinator` 持有并集成：独立 Plan 投影进共享工作台 Overview，终端/子会话行、job 操作与 spawn 投影进共享 Tasks；被否决的 DSH strip/modal/sidebar/CSS family 一律不挂载，`DshSessionWorkbenchModal` 保留磁盘但无运行时入口。下两段关于预设／Plan 读取与竞态 fence 的描述适用于仍在使用的非渲染 owner。

2026-11-10（ACP 新会话 catalog 作用域，已实现并冻结）：修复仅位于 `ChatSelectionControlsCoordinator`（diff SHA `eecfc522e97ea22c3afe3a9e064d0a757feffa4bfe9dac2120d8fd5f09a972f5`），`ModelSelectionRuntime` 无改动、其既有 load generation 继续保护已加载代际。协调器三个 hunk：wrapDSH host 显式自有会话、无会话发布空 providers 并在发布前后捕获 session/transport/adapter 对象变化；每个 DSH 发送门与 dropdown 打开无条件触发既有 reload（缓存 providers，无 RPC）；非 DSH 空目录 guard 不变。无 WeakMap/订阅/新缓存键/helper/API/状态/runtime/core 改动；scope unknown 与权威 unavailable 区分、strict availability 不放宽。主线报告 3 用例 RED→GREEN（共 8）、9 套件 191 通过、tsc/lint 0；ACP 实际模型验收已在 0427 完成并记录（`acceptance-0427.md`）：自有新会话默认 `deepseek-v4-flash` 普通 Send 一次真实回显（stale 111→own 112），override 与 D0 不变；仅声称该已记录案例，其他模型/分支 live 行为不在验收范围。

2026-11-09：`DshNativeSessionControls` 消费真实 Native 权限预设与独立 Plan 状态，并持有面向当前会话的读取／修改竞态 fence。Todo 复用现有 capability 和 per-tab 刷新订阅，重连／恢复先读权威投影。`SessionInformationCoordinator` 收口原生后台任务与 DSH Jobs 的读取、订阅、输出和停止；`SessionWorkbenchCoordinator` 保留 Goal／装配及任务投影，不建立第二份原生任务真值。Subagents 不通过翻通用标记开放 OpenCode 专属逻辑，子会话与取消均通过 owner-scoped 接口。

DSH 控件刷新先等待可选 `refreshNativeControlCapabilities()`，再读取当前能力与会话投影；异步完成后再次校验 session / adapter / generation / read-sequence。能力读取未决或失败时禁用原生操作，失败仅展示安全本地化反馈并保留重试；能力真值仍归 adapter，不在此复制第二份缓存。权限原生菜单在打开时捕获 adapter / session / generation，回调选择前重验；换会话、换 adapter、原生失效和销毁同时隐藏旧菜单，旧回调不能转写新 owner。preset / Plan 修改回执也校验各自启动时的字段序号，较新原生推送优先于迟到成功回执；错误处理与操作结束／焦点清理仍执行。

DSH 窄栏 composer 的尺寸约束由既有 `session-workbench.css` 按原生控件子节点限定：footer-tools 可换行，permission slot 与 toolbar / selector 可收缩，Send/Stop 保留独立列。控件 owner 不建立 resize 状态或迁移 DOM；菜单与会话语义不变。384px / 390px 及更窄侧栏的实际溢出和 Send 中心命中须由原生 DOM 复验，交互单测不作为几何或视觉通过依据。

2026-11-02：Pi 扩展 dialog 只补充插件 modal 根标记以采用共享排版，RPC 完成／取消与连接生命周期仍由现有 PiExtensionUiHost 管理，未引入新服务或状态。


2026-10-29：ChatHeaderPresenter 移除重复全局设置按钮并沿用 backend/server badge 的设置入口；同后端状态刷新保留现有图标节点，后端变化才切换共享内置资源。品牌文字的容器查询归既有 core.css，未扩展 OpenCodianView 的运行时职责。

2026-10-29：ZCode 选择绑定在无会话时消费工作区原生目录及默认模型，已有会话仍消费同 sessionId 的当前模型；目录 bootstrap 与临时草稿生命周期归 core.backend，不在 UI 层造目录或创建持久会话。

2026-10-29：ChatSelectionControlsCoordinator 持有模型弹框的提供商折叠状态和匹配搜索展开行为，并维护重绘后的滚动、按钮焦点及 combobox active-descendant；目录、模型可用性和选择写回继续委托既有 ModelSelectionRuntime。

2026-10-29：SlashCommandMenuCoordinator 持有 `/` 的命令／技能折叠状态，菜单渲染与 `@` 复用同一 disclosure anatomy；两种菜单在非空搜索加载后展开有匹配项的分类，空搜索及未匹配分类保留当前折叠状态。原生技能序列化、目录与 `$` 专用浏览行为保持各自现有 owner。

2026-10-29：引用菜单的分类折叠状态归既有 AgentMentionComposerController 持有，renderer 只绘制 disclosure 和候选；方向键及插入共用展开状态，不新增设置或后端状态。

2026-10-29：PromptReferenceService 拥有统一 `@` 的身份、Vault 边界和有预算／来源标记的历史准备；composer 负责分组候选与原子显示，send preparation 保存引用元数据。权威历史合并保留本地引用证据及可读名称，原生插件可用性与历史身份继续由 backend owner 提供，服务不借用全局原生会话目录。
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

2026-10-28 owner manifest 核对：仅 app.memory-runtime 的模型调用依赖由 core.opencode 改为 core.backend 通用只读辅助能力；本 owner `feature.chat-services` 的 include、职责、canonical state 与依赖规则逐项对比 HEAD 均未改变。

## 会话标签机制核对（2026-10-30）

标签运行时接收完整创建端口，并在所有布局接入栏内新增；创建协调器处理重复请求和后端／容量竞态，恢复协调器按过滤后的条目重定位 active。头部独立 new-tab 入口移除。 owner manifest 的职责、边界及依赖许可保持原定义。

## 2026-10-30 会话标题

TitleGenerationService 统一六后端生命周期、代次校验、本地/原生串行写入、隔离 aux 和重试。TitleModelResolver 隔离六种高风险目录格式与 provider 边界，不新增薄转发层。

## 会话信息（2026-10-31）

SessionInformationCoordinator 独立持有六后端信息缓存、来源/统计投影和子会话只读检查，复用 ContextUsageDisplayService。SessionWorkbenchCoordinator 只转发，不增加 OpenCodianView 状态所有权。
- 2026-11-12 (claude-provider-clarity) owner manifest 核对：与基线 1d3fa289 对 architecture-owners.config.json 做程序化逐 owner deep-equal 对比，全仓仅 feature.settings-claude 的 include 纯插入新增 `src/features/settings/backends/claude/SettingsClaudeProviderModals.ts`（无删除、无其他字段变化）；本 owner（feature.chat-services）的 include、responsibilities、canonical state 与依赖约束逐项对比未变。此为 manifest-diff 核对记录，不构成全量架构评审。

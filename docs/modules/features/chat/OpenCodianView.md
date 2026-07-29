# OpenCodianView

> 2026-07-30: The OpenCode diagnostics header refresh seam accepts an explicit changed tab and updates DOM only when it is still the active tab.

> **源码**: `src/features/chat/OpenCodianView.ts`
> **状态**: [REVIEW]
> **最近更新**: Backend session browser with preview transcript seeding + settings info entry + sandbox badge host wiring + Codex session webSearchMode override host wiring
> **最近更新**: G10c foreground Codex compaction host wiring — the view exposes adapter availability/compact methods through the existing `ActiveTabContextUsageCoordinatorHost` seam and passes the coordinator into `ContextDetailModal`; no compaction state is owned in the view.

> **新增（Codex 资源/技能）**: cache host 提供 `loadCodexRuntimeSkills`、`getBackendKey` 返回 `'codex'`；`syncCodexSkillsChangedSubscription()` 订阅 Codex adapter `onSkillsChanged` → 立即失效 slash 菜单缓存；`notifyCodexAgentMentionUnavailable()` 在 Codex `@` 时显示无原生派发提示并提供设置入口。
> **Updated**: 2026-07-28 — loadModelCatalogData/getDefaultModelSelection/getBackendScopedActiveTabModelOverride gain Codex branches; setActiveTabModelOverride writes codexModelOverride + next-thread feedback; isModelAvailableOnServer skips server catalog for Codex.

## 概述

`OpenCodianView` 是聊天功能的主集成点。它继承 `ItemView`，负责把下列能力装配到同一个 Obsidian 视图里：

- 在构建 composer 前创建 View 的 Obsidian `Scope`；Agent、permission 与 model card 的 Escape handler 都通过 host seam 存入单一分发器。Scope 收到 Escape 时先逐个请求已打开卡片关闭，只有没有卡片消费按键时才取消流式输出，避免注册顺序使流式 handler 抢先吞掉 Escape 或局部 DOM listener 收不到按键

- 对话加载、发送、流式渲染和后台同步
- 多标签页和按 tab 隔离的运行时状态
- 模型、权限、effort、context usage 等工具栏控件
- 动态 backend capability 刷新：Codex app-server 协商成功才挂载 Context Ring；协议不支持时会销毁旧 slot，保留聊天但不展示误导性的上下文百分比
- 当前 session modified files 右侧浮动面板与 toolbar toggle 的 coordinator 装配；coordinator 会把浮动面板约束到 `.opencodian-container`，并在 tab/session 切换或 conversation load 后刷新当前 session diff entries
- 文件/选区上下文附件、选区高亮保留
- question / todo / background task / OMO notice 等辅助交互
- 外观主题、输入面板玻璃效果，以及 CPU/WebGL diamond demo 与 glass octahedron 实验演示

## 公开入口

源码里真正公开的方法是这些：

| 方法 | 作用 |
|------|------|
| `getViewType()` | 返回 `VIEW_TYPE_OPENCODIAN` |
| `getDisplayText()` | 返回视图标题 `OpenCodian` |
| `getIcon()` | 返回自定义图标 id `opencodian-app-icon`，供工作区标签头按当前主题显示品牌 Logo |
| `onOpen()` | 组装 UI、注册事件、初始化第一个 tab，并输出首开阶段耗时汇总 |
| `onClose()` | 清理订阅、轮询、观察器、dropdown、demo 和 tab 运行时 |
| `applyTabBarLayout()` | 根据设置把 tab bar 挂到 header / below-header / input / 外部竖排槽位 |
| `applyChatAppearanceSettings()` | 委托 `ChatSurfaceAppearanceCoordinator.syncAppearanceState()` 应用主题 preset、聊天外观变量、主题背景图、自定义 CSS、per-conversation chat font-size CSS variable，并同步输入面板外观 |
| `refreshCurrentConversationRendering()` | 重新渲染当前对话 |
| `reapplyCurrentConversationSessionSettings()` | 复用 `ConversationSessionSettingsCoordinator`，把当前会话（或全局默认）的 effective chat font-size 写回，并触发 compaction backend apply / deferred fallback |
| `applyChatScrollMode()` | 把当前滚动模式应用到消息容器；无论 pane coordinator 是否处理滚动模式，都会同步表面颜色 |
| `applyLocaleTexts()` | 委托 header presenter、selection controls coordinator 与 composer input coordinator 刷新 header/status、selector、placeholder、dock 和 tab 文案 |
| `refreshQuestionUi()` | 重绘 question dock，并在需要时重绘当前对话 |
| `invalidateSlashCommandMenuCatalog()` | 立刻清空 slash command menu catalog 缓存，并可选触发一次后台 warm preload |
| `createConversationInCurrentTab()` | 公开给插件命令层使用，委托 `ConversationLoadRecoveryCoordinator.createConversationInCurrentTab()`，确保全局 `new-conversation` 命令会真正替换当前视图的 active conversation |
| `loadConversationForExternalHost(conversationId)` | 最小公开 seam，供外部 host（如 settings-side backend session browser）加载已恢复的会话，委托内部 `loadConversation()` |
| `toggleLiquidDiamondDemo()` | 切换 CPU 版 floating diamond demo |
| `toggleLiquidDiamondWebGlDemo()` | 切换 WebGL2 版 floating diamond demo |
| `toggleGlassOctahedron()` | 切换实验性的 glass octahedron overlay |
| `addCurrentNoteContextFromActiveEditor()` | 把当前笔记作为 context item 加入活动 tab |
| `addSelectionContextFromActiveEditor()` | 把当前选区作为 context item 加入活动 tab |
| `reloadModelCatalog()` | 重新加载模型目录并刷新模型选择器 |

## 关键状态

### tab 级运行时

视图最核心的数据结构是：

```typescript
interface TabRuntimeState {
  isStreaming: boolean;
  streamController: StreamController | null;
  streamingMessageEl: HTMLElement | null;
  streamingContentEl: HTMLElement | null;
  currentTurnBodyEl: HTMLElement | null;
  isConversationSyncInFlight: boolean;
  lastConversationSyncFingerprint: string | null;
  sessionTodos: SessionTodo[];
  sessionStatus: SessionActivityStatus | null;
  backgroundTaskLaunches: Map<string, BackgroundTaskLaunchInfo>;
  backgroundTaskCompletedTasks: Map<string, BackgroundTaskCompletionInfo>;
  focusContextPreview: FocusContextPreview | null;
  draftContextItems: PromptContextItem[];
  pendingEditedFiles: Set<string>;
  pendingQuestionRequests: QuestionRequest[];
  pendingQuestionResolution: QuestionResolution | null;
  questionDraftAnswers: Map<string, string[][]>;
  questionRequestWaiters: Map<string, DeferredQuestionRequest>;
}
```

这些状态现在通过 `services/ConversationTabRuntimeCoordinator.ts` 统一进入 tab runtime owner；该 coordinator 组合 `TabMessagesPaneCoordinator`、first-open restore、close/recovery 与 stream-like writeback 端口，负责 tab manager / tab bar / persisted-state / active pane 等生命周期。`OpenCodianView` 仍定义 `TabRuntimeState` 的 shape，并把 runtime factory / navigation sidebar writeback / scroll policy 作为 host seam 提供给 pane coordinator；modified-files UI lifecycle 已委托给 `ModifiedFilesSidebarCoordinator`。每个 tab 都有自己的：

- streaming 控制器
- DOM pane
- todo / status / background task 状态
- context 草稿和 question 草稿

这就是多标签并发不共享一个全局 streaming 状态的实现基础。

聊天视图在 `onOpen()` 注册 conversation full-message cache pin provider，并在 `onClose()` 清除它。第一版 pin 策略保守地保留所有打开 tab 对应 conversation 的完整 messages，因此 active、restored、streaming、syncing、finalizing 与 background-task tab 都不会被内存 LRU 裁剪；历史列表中未打开的旧 conversation 可以只保留 metadata，按需再从 storage hydrate。

其中 question 相关的 `pendingQuestionRequests`、draft answers、active group/index 与 waiter map 现在虽然仍存放在 `TabRuntimeState`，但读写和 refresh/render 编排已经统一收束到 `services/QuestionDockCoordinator.ts`，不再由 `OpenCodianView` 直接维护这整条链路。

background task 相关的 `backgroundTaskLaunches`、`backgroundTaskCompletedTasks`、active anchor / waiting-for-follow-up 等字段同样仍存放在 `TabRuntimeState`，但它们的 timeline 推导、conversation→runtime 重建、indicator reset runtime 清理、OMO diagnostics 去重状态，以及 inline copy 组装现在已经集中到 `services/BackgroundTaskTimelineService.ts`。

background task completion notice 的 queued-state 则已经完全移出 `TabRuntimeState`，改由 `services/BackgroundTaskNoticeStateService.ts` 按 tab runtime 内部维护；view 这里只再保留 streaming / timeline 所需的运行态字段。

### 视图级状态

除此之外，类里还维护若干跨 tab 的视图级状态：

- `currentConversation` / `currentConversationRevertState`
- `services/ChatHeaderPresenter.ts` 的 host seam：server availability、settings/history/new-tab callbacks、status refresh 和 header tab-slot 写回
- `services/LspStatusRefreshCoordinator.ts` 的 host seam：调用 `OpenCodeService.getLspStatus()`，把 language server connection summary 推送给 header indicator
- `services/ConversationSessionSettingsCoordinator.ts` 的 host seam：current conversation、global session defaults、active-tab context usage refresh，以及 per-conversation session settings notice/save；view 现在还把 `agentServiceRegistry` 交给 coordinator，用于把当前会话的 share-URL 读取路由到 `readBackendSessionShareUrl()` → backend `getSession(sessionId)` 这条窄 seam。coordinator 按 conversation backend/capability gate 让 Claude Code 会话只显示通用字体/渲染摘要，不暴露 OpenCode-only 的标题生成、问答、压缩或分享 UI；share/unshare 写操作仍由相邻 owner 通过插件实例解析，避免继续增长 view shell
- 一个面向 settings shell 的公开 bridge：`reapplyCurrentConversationSessionSettings()` 会直接复用上述 coordinator，让 settings/conversation 里的 global session default 修改可以立刻落回当前聊天运行时
- `services/ConversationHistoryActionsCoordinator.ts` 的 host seam：conversation list/current selection、rename title writeback、delete recovery/reset 与 notice 回调
- `services/ConversationAuthoritativeSyncCoordinator.ts` 的 host seam：authoritative server sync、latest-user hydration、client-only message preservation、fingerprint/logging 与 hydrated writeback
- `ConversationWriteSerializationService`：为 send preparation、local stream persistence、message finalization 与 authoritative reload/hydration 提供 per-conversation write ticket + commit boundary；各 view 仍持有本地 service 实例，但默认 shared scope 会让多个 pane 共享同一 conversation 的 ticket/version queue，`OpenCodianView.commitConversationWrite()` 继续是当前保存入口
- `services/ConversationIdentityRuntime.ts` 的 host seam：conversation sync fingerprint、interrupted-sync preservation log fingerprint、message visual signature，以及 render-list shaping（消息可见性过滤、assistant merge、compaction divider 注入）
- `services/ChildSessionGraphCoordinator.ts` 的 host seam：从当前活动对话 + `session.children()` live 数据重建 child-session graph，并在消息区底部渲染最小 session tree
- `services/ChatSelectionControlsCoordinator.ts` 的 host seam：model catalog data source、tab model override/default selection、model-source/server availability 查询、provider icon lookup、permission mode writeback、成功写入后的 `restoreComposerInputFocus()`、effort selector 联动。OpenCode permission write/restart 现在返回 boolean：失败保留 permission card 上下文，成功后由该 seam 聚焦 `ComposerInputShellCoordinator.focusInput()`。sandbox badge settings provider（`getSandboxSettings` 可选方法）已接入 coordinator，但当前对 Claude Code 后端不可见（badge 挂载依赖 `AgentCapability.Permissions`，而 Claude Code 不声明此 capability）。OpenCode 会继续使用 `ModelConfigService` / server catalog；Claude Code 会使用 `ClaudeCodeModelCatalog` 把官方 aliases 与 SDK `supportedModels()` 投影成 composer model provider，并把 effort selector 切到 Claude Code `low/medium/high/xhigh/max` 语义。
- OpenCode permission mode 写入先保存、再按原有顺序重启服务；任一保存或重启阶段失败时，view 恢复先前 mode 并尽力持久化回滚值，再返回 false。因此 Permission card 可以可靠地保持打开、保留旧 selection，而不会把失败写入泄漏为未处理的点击 promise。
- `SessionPermissionTracker`：记录“本次会话允许”的临时权限批准；view 在权限卡片返回 `session` 时保存当前 `sessionID` 的 scope，同一会话再次请求相同 scope 时自动回复，并通过 service 边界发送 OpenCode 支持的 `always`
- Claude Code permission/question bridge 的 view 级 UI context：聊天视图会把当前 active tab id、既有 permission inline card renderer，以及统一的 `QuestionResolutionFlowCoordinator` 注入插件级 `claudeCodePermissionHostContext`；Claude Code adapter 的 `canUseTool` 可复用现有 permission inline card，`AskUserQuestion` 和 MCP `onElicitation` 都会走 inline Question UI 来同步收集答案并在完成后清理临时卡片，避免污染 OpenCode question API 或落入 dock-only 写回路径。证明边界需要分开：`AskUserQuestion` 是已通过普通聊天证明的内置工具路径；MCP `onElicitation` 目前只证明 SDK callback 到共享 question host 的 wiring，真实 pass 还需要 MCP server roundtrip。没有聊天 UI context 时，host 仍返回 `null`，由 bridge 按拒绝/无答案路径处理。
- Codex 审批 host context 的 view 级 wiring：`installCodexApprovalHostContext()` 在 `installClaudeCodePermissionHostContext()` 之后调用，把 active tab id 和 `approvalCardRenderer` 注入插件级 `codexApprovalHostContext`。renderer 闭包通过 `buildCodexApprovalQuestionRequest` + `showQuestionDialog(forceInline, applyResolution: false)` + `mapCodexApprovalResolution` 复用现有 question/inline-card 基础设施，把 Codex `execCommandApproval` / `applyPatchApproval` 呈现为三选项 inline card（Approve / Approve for session / Deny）。映射逻辑隔离在 `CodexDefaultApprovalHost.ts`，view 只做 thin wiring。
- send/cancel/title 相关 runtime bridge 现在会通过 `AgentServiceRegistry` 按 conversation owner 解析 chat/session backend；OpenCode conversation 继续走 OpenCode adapter，非 OpenCode conversation 不再静默落回 `openCodeService`。cancel/detach 同样按当前 conversation backend 分流，Claude Code 等非 OpenCode backend 不会再调用 `openCodeService.detachStream()`。
- user message footer 的 fork / rewind capability 也按当前 conversation owner 解析，而不是读取全局 active backend。这样 active backend 是 OpenCode 时，Claude Code conversation 仍只显示 Claude 声明的 fork，不会把 OpenCode Branching 能力投射成 Claude Rewind；OpenCode conversation 在 OpenCode 声明 Branching 时仍显示 Rewind。
- active backend 切换由 `AgentServiceRegistry.onActiveChange()` 驱动：view 会阻止加载不属于当前 active backend 的 conversation，并自动切到该 backend 最新 conversation；没有则在当前 tab 创建该 backend 的新 conversation。切换时还会刷新 header backend chrome 和 status 文案，避免 OpenCode-only LSP/server chrome 残留在 Claude Code 会话上。
- backend/capability 切换还会调用 composer toolbar remount seam：view 先销毁旧 context ring / effort selector / selection controls，再让 `ComposerInputShellCoordinator.refreshToolbarControls()` 按最新 capabilities 重建 toolbar。`shouldMountAgentSelector` 现在是纯能力判断（`AgentCapability.Subagents`），Claude Code（未声明该能力）完全不显示主 agent 下拉，OpenCode 显示；Codex 同样不显示。同时新增独立的 `shouldHandleAgentMentions` seam：输入框内打 `@` 召唤子 agent 的 mention 菜单与下拉解耦——Claude Code 即使无 Subagents 能力也保留 mention（有独立的 `loadClaudeRuntimeAgents` 数据源，且 `MessageSendPreparationService` 保留 `@name` 原文透传给 SDK，由模型经 Task 工具 spawn 子 agent），OpenCode/Codex 仍随能力判断。
- Claude Code `backend_event` 诊断 chunk（hook/subagent/tool progress/structured output）不会转换成渲染层 stream chunk；这些事件只进入 send pipeline 调试摘要，直到对应产品 UI 完成运行期证明。
- header status badge 的 settings action 按 active backend 路由：OpenCode 继续跳 Server section，Claude Code 则跳 Claude Code runtime section，避免 Claude mode 下露出 OpenCode-only server chrome。
- non-OpenCode backend 的 chat/server availability 现在会读取 active adapter 的 `status`，再映射成 `running` / `starting` / `offline`；Claude Code 断开时不再被视为默认在线，composer 和 header 会显示真实离线态。
- `services/ComposerInputShellCoordinator.ts` 的 host seam：input shell DOM 装配、submit gate、textarea 高度同步、composer stack height、Agent selector / toolbar slot mount，以及 `/json` capability chip 显示决策
- `SlashCommandMenuCatalogCache` / `SlashCommandExecutionService` 的 host seam：缓存 runtime commands + skills、Claude Code `getRuntimeCatalog().commands`、项目级 command/agent 配置与 `.opencode/commands/**/*.md` markdown commands 合并后的 composer suggestion catalog；现在还携带 `@agent` mention 和主 Agent selector 的候选 sidecar，并支持由插件入口在设置保存、server 恢复到 `running` 时主动失效。view 通过 `loadClaudeRuntimeCommands` 可选回调把 Claude adapter 的 sanitized runtime commands 委托给 cache，adapter 不可用时返回 `null`，避免影响 OpenCode 路径。Claude Code 作为 active backend 时，`loadSlashCommandMenuItems()` 也会继续调用 cache（不再提前返回 `[]`），由 cache host 的 `loadClaudeRuntimeCommands` 从 Claude adapter 读取 runtime commands。view 还为 synthetic `/compact` command 提供 manual compaction seam，解析当前 session/provider/model 后调用 `OpenCodeService.summarizeSession(..., false)` 并显示 Obsidian notice。
- slash command catalog 的后台 warm preload 现在也受 chat-surface availability guard 约束：当 header/composer 已把状态解释为 `disabled` 或 `offline` 时，view 不再提前 `warm()` runtime slash catalog，避免 backend 不可用时额外制造一次预热拒连日志；Claude Code active backend 也支持 `scheduleSlashCommandMenuPreload()`，用于提前 warm Claude runtime command catalog。
- `services/InputPanelAppearanceCoordinator.ts` 的 host seam：input panel theme class、action button style、SVG filter layer、liquid-glass mount/unmount 与 diagnostics log 去重
- 由 `ComposerContextViewFacade.create()` 基于独立的 `createComposerContextViewHost()` / `createFocusContextViewHost()` seam 装配出的 `ComposerContextEventBridge`、`ComposerContextCoordinator`、`FocusContextRuntimeService`、`PersistentAssistantNoticeService` 等视图级运行时协作对象
- theme background 与 experimental demo / glass octahedron 相关 DOM 引用

## 主链路

### 打开与关闭

`onOpen()` 的顺序是固定的，而且现在每一步都会记一条轻量性能埋点，方便区分“首开慢”到底卡在 UI 装配、信号订阅，还是首个 tab 初始化：

1. `buildUI()`
2. `initializeTabSystem()`，实际 tab manager / tab bar / layout 初始化由 `ConversationTabRuntimeCoordinator` 执行
3. `chatHeaderPresenter.startServerStatusLoop()` 与 `lspStatusRefreshCoordinator.start()` 分别启动 server 和 LSP connection summary 刷新
4. 在 `messagesShellEl` 上创建 `MarkdownRenderService`
5. `wireEventHandlers()`，其中 composer/context 相关的 workspace / vault / DOM 事件注册与 retained-selection polling 启动都会转交给 `ComposerContextEventBridge`
6. `wireBackendSurfaceSwitch()` 注册 active-backend change 监听，确保设置页或 agent switcher 切换 backend 后，聊天表面同步切到该 backend 自己的 conversation
7. 通过 `ConversationSessionSignalRuntime` 统一订阅 session sync event 与 todo/status live signal 更新；只有当前 active backend 确实是启用中的 OpenCode 时才启动，避免 Claude Code-only / 非 OpenCode active 场景继续建立 OpenCode-only signal 订阅并制造离线噪音
8. `initializeFirstTab()`：只恢复当前 active backend 的持久化 tabs、加载该 backend 的首个对话；如果最终需要新建 conversation，才会经由插件层 `createConversation()` 接管 deferred runtime warmup，避免把已有会话的视图首开也一并阻塞

结束时会输出一条 `[view-open]` 汇总日志，包含各阶段耗时拆分。

`onClose()` 则会反向清理：

- tab 持久化与 tab runtime system cleanup
- header presenter、conversation history/actions coordinator、input appearance coordinator、composer input coordinator / conversation sync / selection polling / layout / scroll 定时器
- title generation
- effort selector、context ring、question dock、todo dock、navigation sidebar
- liquid glass adapter cleanup、diamond demo
- tab panes、tab bar、dropdown、markdown component 等

### 滚动辅助抽离

消息区的 pane lifecycle 与 pane 级 scroll metrics 现在先由 `services/TabMessagesPaneCoordinator.ts` 承接，再由 `services/ConversationTabRuntimeCoordinator.ts` 对外提供 active pane / tab runtime facade；底部检测、scroll snapshot、重渲后恢复仍由 `services/ScrollManager.ts` 提供纯 helper。settled scroll 的 double-rAF 帧状态和取消逻辑由 `ScrollManager.SettledScrollScheduler` 拥有，`TabMessagesPaneCoordinator` 直接引用调度器实例。`OpenCodianView` 只保留：

- `TabMessagesPaneCoordinator` 的 host wiring
- `ConversationTabRuntimeCoordinator` 的 tab bar mutable state 与 persistence host wiring（通过 `createConversationTabRuntimeCoordinator` 顶层工厂一次性构造协调器，view 只需傳入 `plugin: this.plugin` 和 `view: this` 兩個直接引用，工廠內部完成所有分解）
- 是否应 auto-scroll 的业务判断
- restore 后的高层 render / hydration / bridge 调度
- `scrollToBottom` / `scheduleSettledScrollToBottom` / `clearScheduledScrollToBottom` 等薄兼容委托（内部委托给 `SettledScrollScheduler`）

这次没有改变原有 bottom / preserve-anchor / preserve-distance 三种恢复语义，只是把算法从 view 内联实现挪到了可单测模块。

另外，tool / thinking 详情块的展开/收起不再直接触发 settled scroll-to-bottom；视图现在只会把这类点击标记成“一次用户主导的布局变化”，交给 `TabMessagesPaneCoordinator` 在下一次 layout observer 回调里抑制自动贴底，避免首展开时把工具栏或思考栏甩到视图底部。


### 输入面板 appearance 边界

输入面板 action-button/theme/SVG/liquid-glass runtime 与 glass-refraction CSS token refresh 由 `services/InputPanelAppearanceCoordinator.ts` 承接。`OpenCodianView` 只保留 host seam：提供 composer shell、input wrapper、chat container、messages metrics、settings/log helper，以及 surface color / composer layout follow-up callback。

这样 `applyChatAppearanceSettings()` 不再直接展开 input-panel glass-refraction CSS variables，也不再保留只转发到 coordinator 的 input-panel theme / diagnostics wrapper；view 只触发统一的 appearance sync。

### 聊天 surface appearance 边界

聊天 surface 外观（主题 preset、CSS 变量、主题背景图、自定义 CSS、滚动模式、粘性遮罩颜色同步）由 `services/ChatSurfaceAppearanceCoordinator.ts` 承接。`OpenCodianView` 只保留 host seam：提供 chat container、theme background image element、messages container、settings access，以及 conversation visual state / input panel appearance 的委托回调。

`OpenCodianView` 保留的公开方法 `applyChatAppearanceSettings()`、`applyChatScrollMode()`、`scheduleChatSurfaceColorSync()` 全部委托给该协调器；原来的私有实现（`applyThemeBackgroundImage`、`applyChatScrollModeToMessagesEl`、`scheduleChatSurfaceColorSync`、`clearChatSurfaceSyncTimers`、`syncChatSurfaceColor`）已移至协调器内部，其中 `syncChatSurfaceColor()` 作为公开方法供 `applyChatScrollMode()` 在 pane coordinator 提前返回时直接调用，确保表面颜色始终同步。

### Send pipeline debug summary 边界

send pipeline 调试摘要函数（`summarizeContentBlocksForDebug`、`summarizeChatMessageForDebug`、`summarizeCoreStreamChunkForDebug`、`summarizeRenderedStreamChunkForDebug`）现在由 `runtime/SendPipelineDebugSummaries.ts` 承接。assistant finalization debug 的 allowlist gate check、统一 log emitter、payload 序列化和文本截断预览现在由 `services/trailingAssistantPatchDebug.ts` 承接。`OpenCodianView` 通过 `createDebugLogCallbacks()` 工厂函数将 debug 回调 spread 到 `SendPipelineDebugPort`、`ConversationAuthoritativeSyncHost`、`InputPanelAppearanceCoordinatorHost` 等 host seam 中；单行预览使用 `previewLogText()`。view 本身不再保留这些私有实现，源码中也不包含这些函数的裸名。

### Header/status shell 抽离

header DOM、server status badge、title logo/wordmark、new/current-tab、history 与 settings 按钮现在由 `services/ChatHeaderPresenter.ts` 承接。`OpenCodianView` 只保留 presenter host seam：

- server availability 查询与 settings server mode 读取
- settings / server section / LSP section / history / new-tab callbacks
- tooltip 标签、plugin asset URL、css-change 注册和 layout/color sync 回调
- header tab bar slot 写回给 tab bar layout

server status loop、badge class、status label、本地/远端文案判定和 locale refresh 都在 presenter 内部完成；LSP status loop 由相邻的 `LspStatusRefreshCoordinator` 持有并通过 presenter 更新 indicator。view 不再直接持有 header button refs 或 status interval 状态。Phase 0/1 backend-capability 收尾还在这个 seam 上补了一层 surface 语义：当 `enabledBackends` 为空，header 会把状态解释为 `disabled`；当当前 active backend 是 Claude Code 等非 OpenCode backend 时，聊天 composer 不再探测 OpenCode server health，而是把 backend 视为可发送，由对应 adapter/auth/query 路径返回真实错误或流式结果。非 OpenCode backend 离线时，header badge 现在也使用 backend-specific offline label（例如 `Claude Code offline`），避免和 OpenCode server offline 混成同一个状态。

### Conversation history / actions ownership

header 上 history 按钮触发的 conversation history dropdown、rename dialog、delete confirm countdown、dropdown 定位，以及 click-outside / destroy cleanup 现在由 `services/ConversationHistoryActionsCoordinator.ts` 承接。`OpenCodianView` 只保留 coordinator host seam：

- conversation list、current conversation、active backend display name 与 foreground-busy 状态读取
- `loadConversation()`、`updateConversationTitleState()` 与 `ConversationTabLifecycleRecoveryCoordinator` delete/reset 入口
- title generation cancel 与 notice 回调

因此 view 不再直接持有 history dropdown DOM/state、rename/delete confirm overlay 或 dropdown positioning RAF；delete fallback、rename title sync 到 session，以及 tab cleanup/reset 语义保持不变。
History dropdown 的实际 conversation 过滤仍由 view host 根据 `settings.activeBackend` 完成；coordinator 只显示 host 提供的 backend scope label，让 Claude / OpenCode 历史过滤在 UI 上明确可见。
本轮还把 history dropdown 的视觉层级重新拉开：scope label、active/selected 态、标题生成状态 pill、footer action 区和滚动容器都使用更明确的玻璃卡片层次，但仍保留原 class hooks，避免破坏现有 tests。

### backend-aware first-turn title pending

首条 user message 的标题 bootstrap 不再只有 OpenCode 会进入。当前实现是在 send-preparation owner 中按 backend 决定是否继续异步标题生成，并通过 view host seam 暴露 Claude Code `autoTitle` truth：

- OpenCode：只有 `titleMode === 'ai'` 时标记 `pending`
- Claude Code：只有 `backendSettings.claudeCode.autoTitle === true` 时标记 `pending`

这样 Claude Code 新会话在 auto-title 开启时，也会先显示本地 provisional title，再等待 backend `summary` 回写；后续 `startAiConversationTitleGeneration()` 的 callback 仍复用“只有 fallback title 且状态仍是 `pending` 才覆盖”的保护条件，避免用户手动 rename 后被官方标题抢回。view 本体只新增了一个窄 host getter，把 Claude Code title setting 暴露给相邻的 `MessageSendPreparationService` owner，而没有把更多标题状态判断回灌进 `OpenCodianView.ts`。

### Composer input shell 抽离

输入区的 tab slot、composer shell、textarea、自适应高度、send/stop affordance 与 composer stack height 现在由 `services/ComposerInputShellCoordinator.ts` 承接。`OpenCodianView` 只保留 coordinator host seam：

- question/todo dock attach、context row writeback，以及 add-context / send message / foreground-busy notice 的回调
- selection controls、context usage ring 与 effort selector 的既有 mount 入口
- `SlashCommandMenuCatalogCache.load()`，供 `ComposerInputShellCoordinator` 在 `/` 与 `@agent` 查询时读取共享 catalog；view 不直接实现过滤、agent projection 或 source span 追踪
- chat container 上 `--opencodian-composer-stack-height` 的写回，以及 settled scroll 调度
- 供后续 glass/theme 逻辑读取的 composer shell / input wrapper DOM refs

稳定聊天视图当前明确只启用 prompt 输入模式：`getComposerInputMode()` 固定返回 `prompt`，意外进入的 shell submission 会被记录并忽略，不会走本地-only shell 状态。后续如果要开启 shell parity，入口必须通过 `OpenCodeService.runSessionShell()` / `session.shell`，并复用 canonical session/message/part projection，而不是在 view 内新增 shell 消息状态。

Phase 0/1 的 backend-empty / backend-offline 收尾还在这个 seam 上新增了一层高阶 composer availability state：`OpenCodianView` 负责把“没有任何 enabled backend”和“OpenCode active 但运行时不可连接”聚合成统一 surface 状态，再交给 `ComposerInputShellCoordinator` 渲染禁用态。Claude Code 等非 OpenCode active backend 不再因为 OpenCode server 离线而禁用 composer。具体 textarea/button 禁用与 availability notice DOM 不回流到 view；coordinator 现在会把说明移出 input wrapper，空会话继续复用消息区 empty-state notice，非空会话则在消息区下缘挂一条 transient warning notice。

这样 view 不再直接维护 textarea Enter-submit、高度同步、`ResizeObserver` / RAF layout 节流或 send/stop button tooltip 状态；toolbar 里的 selector 区域也已经进一步交给专门 owner，input shell 只保留 slot 级挂载职责。

### Model / permission selector ownership

聊天工具栏里的 model selector 与 permission selector 现在由 `services/ChatSelectionControlsCoordinator.ts` 承接。`OpenCodianView` 只保留 selection host seam：

- model catalog data source，以及 tab override/default model 读写
- model-source mode / server availability 查询、provider icon URL lookup、permission mode settings writeback
- effort selector display 刷新，以及共用的 Escape scope 注册

因此 view 不再直接铺开 requested/current/resolved model selection、model catalog cache、switch-model notice / unavailable follow-up，或 model dropdown search/list/sticky-header cleanup、provider icon trigger 刷新、permission dropdown selected-state / open-close 状态机；这些 model-selection 与 selector UI lifecycle 已集中到 coordinator，而 send options、`ModelCatalogStateService` 语义与 provider icon fallback 顺序保持不变。

主 Agent selector 则由 `ComposerInputShellCoordinator` 挂载的 `ChatAgentSelectionCoordinator` 承接，并复用 `SlashCommandMenuCatalogCache` 的 default-candidate sidecar。它不写回项目 `default_agent`，只在 composer submit 时作为 `SurfaceInvocationIntent.primaryAgent` 传入发送链路。

### Input appearance / glass ownership

输入面板的 theme class、action button style、SVG filter layer、liquid-glass adapter mount/unmount 与 diagnostics log 现在由 `services/InputPanelAppearanceCoordinator.ts` 承接。`OpenCodianView` 只保留该 coordinator 的 host seam：

- composer shell / input wrapper / chat container / messages shell 的 DOM 读取入口
- plugin settings 里的 input panel theme、action button style、SVG filter 与 liquid-glass adapter settings
- plugin asset URL 解析，以及现有的 log preview / payload stringify helper
- experimental diamond / octahedron demo 的显式 toggle 入口

这样 view 不再直接维护 filter-layer DOM ref、active liquid-glass adapter、diagnostics fingerprint 或 refraction helper；但 theme preset、settings normalization、CSS token 语义与 experimental demo 的 opt-in 边界保持不变。

### 对话装载与后台同步

`initializeFirstTab()` / `restorePersistedTabs()` / `createNewConversation()` / `loadConversation()` / fork / rewind 这些 conversation lifecycle 入口现在先经由 `services/ConversationLoadRecoveryCoordinator.ts`：它直接承接首开 bootstrap / persisted restore / fallback-create，再分别复用 `ConversationTabOpenCoordinator`、`ConversationTabLifecycleRecoveryCoordinator` 与 `ConversationViewStateService`。消息区的 `renderMessage()` / `renderMessages()`、empty-rewind notice、single-user body rerender、pseudo-stream reveal、full rerender、tail patch 与 append-only 增量更新则统一收束到 `services/ConversationRenderService.ts`，而 conversation fingerprint / visual signature / render-list shaping 则由 `services/ConversationIdentityRuntime.ts` 统一提供。其中 loaded-conversation 的 resolve / reload retry / server-sync 判定先经由 `runtime/ConversationLoadRuntimeBridge.ts` 落回 view host，tab/pane activation 预刷新会先经由 `runtime/TabViewActivationBridge.ts` 落回 view host，active-tab conversation/session 写回则先经由 `runtime/TabConversationActivationBridge.ts` 收束 activation 入口，再复用 `runtime/TabConversationStateBridge.ts` 落回 view host，loaded-conversation 的 preflight cleanup / hydration shell 则先经由 `runtime/ConversationTransitionBridge.ts` 收束，再由 `runtime/ConversationHydrationRenderBridge.ts` 处理 scroll/class restore，而消息装载完成后的 background-task rebuild / message rerender / post-render outcome / baseline 则继续经由 `runtime/ConversationHydrationOutcomeBridge.ts` 收束。主链路仍然保持原来的语义：

- 在切换对话时取消旧对话的标题生成
- OpenCode 首条消息后的标题链路仍由 view 发起并接收回调；实际官方标题优先、本地兜底、以及首次 provisional server 写入抑制分别由 `TitleGenerationService` 和 `OpenCodeSessionLifecycleCoordinator` 承接，view 只负责更新本地 conversation/title status 与 tab 标题。Claude Code 当前未接入标题生成，发送准备阶段不会触发 OpenCode title fallback 或 AI title kickoff。
- 清空当前消息区并重置 turn 状态
- 把 legacy `openCodeSessionId` 交给 `openCodeService`；发送和 tab runtime 的通用 session identity 逐步迁到 `backendSessionId` / `getConversationBackendSessionId()`，但标题同步、取消流、child session 等 OpenCode-only surface 仍按 backend/capability 分阶段保留 guard
- `getSessionIdForTab()` / `getOpenCodeSessionIdForConversation()` 的命名仍带历史 OpenCode 语义，但现在通过 `getConversationBackendSessionId()` 为 OpenCode、Claude Code 和 ACP 等所有 backend 解析 backend-agnostic session id。Claude Code runtime 证明使用 `TaskCreate` / `TaskUpdate` 等 CRUD 工具而非 `TodoWrite`；`AgentCapability.Todos` 已重新启用，`SessionTodoCoordinator` 以 backend session id 为作用域推导 Task* 状态，并在 session reset / activation 时从 stored `contentBlocks` replay persisted Task* state。
- revert / unrevert 的 session control 调用现在通过 `AgentServiceRegistry` 路由到拥有 `AgentCapability.Branching` 的 backend adapter；fork 则通过 `AgentCapability.Fork` 路由到 `AgentForkCapability` adapter；OpenCode 仍走 `openCodeService` 作为 fallback，Claude 等 backend 在未声明对应能力时直接抛错，避免把 Claude session ID 误传入 OpenCode-only 路径
- 在必要时调用 `syncConversationMessagesFromServer()`
- 在 load 完成与 authoritative sync 完成后额外调用 `ChildSessionGraphCoordinator.refreshGraph()`，让 child-session tree 跟随当前可见对话的 persisted/live child-session 数据刷新
- 装载阶段进入 hydration：先重建历史 turn / inline background task，再等待后续 authoritative message sync 决定是否允许 stale 降级
- 重新渲染消息、背景任务指示器、todo dock、question dock
- 通过 `ConversationSyncHostAdapter` 组装 `ConversationSyncRuntimeCoordinator` / `ConversationSyncOrchestrationService` / `ConversationSyncBridge`，并通过 `ConversationSessionSignalRuntime` 接入 session sync event + todo/status live signal 的订阅、session→tab 匹配与 cleanup 生命周期
- 更新模型显示和 context usage
- Claude Code conversation 的 `loadConversation()` 在 authoritative hydration 之后会调用 `ClaudeUserMessageIdentityBackfillService.backfill()`，从 Claude SDK session history 回填 user message `sourceMessageId`，确保已有 Claude 对话 reload 后 fork 按钮仍然正常显示

后台同步分两路：

- `syncVisibleConversationInBackground()`：同步当前活动 tab
- `syncBackgroundTaskTabsInBackground()`：同步非活动但仍有 background task 的 tab

`OpenCodianView` 现在通过 `assembleConversationSyncRuntime` 一次性获得 sync services、bridge ports 和 load bridge host；`ConversationSyncHostAdapter` 内部完成 sync load host 派生、sync services 创建和 bridge ports 装配，sync service bundle 的 wiring 不再散落在 view 构造函数里。tab-activation 侧的 conversation sync runtime port 也通过 `assembleTabActivationConversationSyncRuntimePort` 一步创建。

session sync event 与 session todo/status 的 live signal 入口都不再由 view 自己持有 `subscribeToSessionSyncEvents()` / `subscribeToSessionTodoUpdates()` / `subscribeToSessionStatusUpdates()` 及其 dispose 状态：`ConversationSessionSignalRuntime` 会统一接管三条 listener 的生命周期、session→tab 匹配与 active-tab fallback，再把 signal sync 调度交回 `ConversationSyncOrchestrationService`，把命中的 todo/status update 交回 `SessionTodoCoordinator`，并在每次 live update 后继续调用 `BackgroundTaskLiveSignalCoordinator`。

signal sync 与后台轮询里的 loop lifecycle、signal debounce、tab / conversation 选择、conversation 加载和 dispatch 编排现在先交给 `ConversationSyncOrchestrationService`。它会判断 signal 是否应回到当前可见会话，或转向 hidden tab sync；会把同一 tab 上短时间内连续到达的 signal reason 合并；轮询时也只会在确实存在 visible/background sync 目标时持有 interval，并只枚举非活动、仍有 background task、且 runtime 当前允许同步的 tab。

### Child session tree

`ChildSessionGraphCoordinator` 现在 owns child-session tree 的完整生命周期，包括 graph 重建和 DOM 渲染：

- coordinator 的 `render()` 负责在消息区底部创建/复用 `.opencodian-session-tree` 容器，并渲染 `complete`/`partial` graph 的折叠区；`empty` graph 直接隐藏整块
- 普通 edge 行显示状态点、title/description 与 `Open` 按钮；按钮通过构造函数传入的 `onOpenTaskToolSession` 回调触发。该回调现在会把 `currentConversation?.backend` 一并透传给 `ConversationTabOpenCoordinator.openTaskToolSession`，确保 child/task session conversation 保留父会话的 backend identity。
- orphaned session 行固定显示 `Unknown task`，同时标记 partial graph badge，并在 graph 为 `partial` 时显示提醒文案
- graph state 不落进 `TabRuntimeState`；view 只在 active pane 切换时通过 `coordinator.clearContainer()` / `coordinator.render()` 重建，真正的 graph snapshot 仍留在 coordinator 内部
- `SESSION_TREE_BASE_CSS` 由 coordinator 导出，view 在 `applyChatAppearanceSettings()` 中注入

`OpenCodianView` 只保留：
- `createChildSessionGraphCoordinatorHost()` 提供 host seam（`getMessagesContainerEl`）；`onOpenTaskToolSession` 在 coordinator 构造时通过 view-local lambda 调用 `ConversationTabOpenCoordinator.openTaskToolSession(sessionId, toolCall, currentConversation?.backend)`，而不是无参 bind，因此 child session graph 和 assistant shell 打开的子会话都不会再盲跟 `settings.activeBackend`
- 在 conversation load / sync 完成后调用 `coordinator.refreshGraph()`
- 在 pane 切换时调用 `coordinator.clearContainer()` 和 `coordinator.render(currentGraph)`
- 在 close / empty-tab 路径上调用 `coordinator.hide()` 和 `coordinator.clearGraph()`

真正把 visible/signal/background 三条 sync 回调装配到一起的层现在是 `ConversationSyncBridge`：它会把 orchestration 的 dispatch 回调统一接到 server sync、fingerprint commit 和 post-sync coordinator，再把真正依赖当前 DOM/render host 的 `applySyncedConversationUpdate()` 留在 view；`renderBackgroundTaskIndicatorIfNeeded()` 已直接委托 `BackgroundTaskIndicatorCoordinator.renderIfNeeded()`。hidden-tab 与 active-tab 同步入口仍通过 `ConversationSyncRuntimeCoordinator` 统一处理 tab runtime guard、`isConversationSyncInFlight` 生命周期，以及 per-tab fingerprint baseline 判定。

`session.diff` 现在不再触发 message authoritative sync/reload：sync-event 自带的 diff entries 由 `OpenCodeSessionStateStore.setSessionDiffEntries()` 统一缓存，view 通过 `OpenCodeService.getCachedSessionDiffEntries()` 读取作为 turn-diff notice 的输入备用；真正的 message truth correction 仍只来自 canonical message/part graph 与必要时的 gap-recovery server sync。

`session.compacted` 现在会沿着同一条 session signal runtime 进入 `ConversationSyncBridge`，但 visible current conversation 会强制走 authoritative server sync，而不是先信任可能已过期的 canonical graph；sync 收尾继续复用 active-tab context usage refresh，以便清掉/更新 `Session.time.compacting` 驱动的 live 状态。reload 之后，服务端返回的已持久化 `compactionDivider` 会替代 `injectLiveCompactionDivider` 合成的虚拟 divider，`compactingAt` 则在 context usage refresh 时被置为 null。

这里的 conversation sync fingerprint 现在直接复用 `OpenCodeService.getCanonicalConversationFingerprint()`：它会把 `contentBlocks`、tool call、context attachment、OMO/notice 元数据和原始 `parts` 一起写入 fingerprint，从而让 authoritative reload/finalization 以 canonical payload 漂移为准，而不是继续依赖 view 层单独维护一套 visual-only 对比。

与此同时，view 自己的 assistant body / visual signature 也需要把 `contentBlocks[].toolMetadata` 与 `contentBlocks[].toolResultVisibility` 纳入比较；否则 task 卡片在 authoritative hydration 后即使拿到了 child session id，也可能因为 signature 误判“未变化”而错过重渲。

assistant `summary === true` 的消息会在正文上方渲染一个 compaction report badge，并纳入 assistant body signature；user 消息渲染现在也会跳过没有 visible content / attachments / images / OMO 的空壳消息，用于隐藏 OpenCode `metadata.compaction_continue` 这类内部续跑提示。`compactionDivider` 消息不以 notice card 形式渲染，而是作为全宽分割线展示，由 `UserMessageContentRenderer.renderCompactionDivider()` 根据 `divider.live` 决定渲染活跃标签还是已完成 badge+标签；`shouldRenderConversationMessage` 会放行 `compactionDivider` 类型的消息；`getMessageVisualSignature` 会把 `summaryKind` 和 `compactionDivider` 纳入签名比较，以支持增量更新检测。

与此同时，server message 拉取→hydrate→authoritative merge、latest optimistic user bubble hydration、client-only/interrupted message preservation，以及 sync debug payload / fingerprint 组装现在统一收束到 `services/ConversationAuthoritativeSyncCoordinator.ts`。`OpenCodianView` 只再保留 host seam：OpenCode message/revert 查询、runtime fingerprint/anchor 写回、context usage refresh、background-task authoritative-sync 标记，以及 hydrated single-message rerender。

其中当前活动 tab 的后台同步收尾会把 active-conversation match 判定，以及 `currentConversationRevertState` / active-tab sync fingerprint 的 state commit 委托给 `VisibleConversationPostSyncCoordinator`；而 post-sync 里的 question refresh + todo/status live refresh，再加上 background-task rebuild / completion notice / stream-like follow-up，则进一步收束到 `QuestionTodoBackgroundTaskRefreshHostAdapter` 装配的 `QuestionTodoStatusRefreshCoordinator` + `PostSyncQuestionTodoRefreshFacade` 这条共享链路；activation/open 侧剩余的 question dock + todo dock + supplemental refresh 则单独收束到 `QuestionTodoActivationRefreshCoordinator`，相邻的 background-task indicator reset / runtime rebuild / render trigger 则由 `QuestionTodoBackgroundTaskActivationHostAdapter` 内联提供的 background-task activation port 承接。这两条入口现在直接共享 `OpenCodianView` 提供的一份 current-conversation/runtime/background-task view host，因此 activation/post-sync 不再分别维护两段几乎平行的 host factory，也不再绕经额外的 shared-host pass-through layer；conversation-sync fingerprint port 也直接由 view surface runtime 提供给 persisted notice 与 question/todo/background-task bundle，不再保留单独的 pass-through provider。`ConversationSyncBridge` 负责把这些 post-sync outcome 路由回 view，而 `OpenCodianView` 的消息渲染职责现在主要只剩 `ConversationRenderService` 所需的 host seam：user/assistant body leaf renderer、empty-state notice 文案来源、markdown/copy/footer host 与 render debug/runtime writeback。background-task indicator 的 render/queue/flush 顺序则由 `BackgroundTaskIndicatorCoordinator` 承接，而 foreground live-signal reconcile 与 stream-like UI 写回也已直接收束到 coordinator 对 `BackgroundTaskLiveSignalCoordinator` / `TabRuntimeStateBridge` 的组合。

background task 的 conversation-derived timeline rebuild 现在也不再由 view 自己内联实现：`syncBackgroundTaskStateFromConversation()`、indicator reset 时的 runtime 清空、completion-segment 收集、OMO diagnostics logging state，以及 inline notice copy 组装都转交给 `BackgroundTaskTimelineService`；inline panel 的 DOM 创建、挂载、复用与清理则转交给 `BackgroundTaskInlinePanelRenderer`；indicator render、completion notice queue/flush、foreground live-signal reconcile 与 stream-like sync 顺序则由 `BackgroundTaskIndicatorCoordinator` 直接组合 `BackgroundTaskLiveSignalCoordinator` 和 `TabRuntimeStateBridge` 承接。另一方面，`BackgroundTaskLiveSignalCoordinator` 自身也会直接组合 `SessionTodoCoordinator`、`BackgroundTaskTimelineService` 和 `BackgroundTaskNoticeStateService` 来处理 stale follow-up，主动的 todo/status 拉取刷新、request-id stale guard，以及 stream/live-signal/tab-reset 三条运行时入口也都收束到同一个 `SessionTodoCoordinator`；这组 session todo host/wiring 则由 `SessionTodoHostAdapter` 统一装配。activation/open 和 post-sync 场景里 status + pending-question + todo 的组合刷新顺序仍由 `QuestionTodoStatusRefreshCoordinator` 统一承接，但 activation/open 侧残留的 dock writeback + supplemental refresh 现在先下沉到 `QuestionTodoActivationRefreshCoordinator`，background sync 下剩余的 rebuild / completion / stream-like follow-up 则进一步下沉到 `PostSyncQuestionTodoRefreshFacade`；post-sync 三段链路的剩余 host wiring 现在再由 `QuestionTodoBackgroundTaskRefreshHostAdapter` 统一装配，因此 view 不再直接维护完整 `QuestionTodoBackgroundTaskRefreshViewHost` 闭包，只保留 tab runtime、current-conversation writeback、单一 session todo host 与其它 bridge 装配。

普通 OpenCode 原生 `task/subagent` 语义现在也和 OMO background-task 语义明确拆开：只有 search-mode arm 过的 `task` 才进入 background-task lane / inline panel；其余原生 `task` 仍以工具卡片渲染，并可借 `toolMetadata.sessionId` 通过 `createConversationFromSession()` 打开 child session，而不会误触发 OMO inline panel。

tab conversation/session activation 写回现在也不再由 view 自己在 load / streaming activation / current-tab open / fork 等路径里逐项改 `currentConversation`、tab conversation 与 session reset：这些 active-tab state writeback 统一交给 `runtime/TabConversationStateBridge.ts`，view 只保留 activation/render orchestration。

tab 激活入口里剩余的 pane-activation UI preflight（`setActiveMessagesPane()`、focus preview、question dock、todo dock）现在也不再由 `OpenCodianView` 自己直接维护 pane DOM map；`services/ConversationTabRuntimeCoordinator.ts` 负责 tab switch / close / first-open / persisted restore / tab bar layout / stream-like state facade，tab-runtime host 組裝已通過 `createConversationTabRuntimeCoordinatorHost(source)` 工廠函數集中到 coordinator 文件。工廠接受 `ConversationTabRuntimeCoordinatorHostSource`（含 `plugin`、`view`、`tabBarState`、`settings`），內部分解 `plugin` 的持久化方法和 `view` 的 DOM 存取器與 session 查詢方法。view 調用點只需傳入 `plugin: this.plugin` 和 `view: this`，無需構建嵌套回調子對象。与此同时，activation/open 侧的 question dock + todo dock writeback 与 supplemental refresh 又进一步收束到 `services/QuestionTodoActivationRefreshCoordinator.ts`，相邻的 loaded/open-side background-task indicator writeback 则由 `services/QuestionTodoBackgroundTaskActivationHostAdapter.ts` 内联提供，而 selector/model 相邻的 active-tab context usage identity / snapshot writeback 则进一步收束到 `services/ActiveTabContextUsageCoordinator.ts`，这样 bridge 只保留 pane、selector、send-button 与 hydration-tail 编排。loaded-conversation 的消息装载后壳层现在先由 `runtime/ConversationHydrationOutcomeBridge.ts` 统一串起 background-task rebuild、message rerender 与 post-render outcome，再复用 `TabViewActivationBridge`；status / pending question / session todo lazy refresh 仍由 `QuestionTodoStatusRefreshCoordinator` 共享给 activation/open 与 post-sync 入口，view 只保留 state writeback 与 host 装配。与此同时，streaming fast-path activation、empty-tab activation 本体与 current-tab new conversation open 的消息区清空 / turn reset 壳层，也进一步统一下沉到 `runtime/TabConversationActivationBridge.ts`。这两个 activation bridge 所需的 late-bound host shape 现在再由 `runtime/TabActivationBridgeHostFactory.ts` 从同一份 activation writeback seam 派生，因此 `OpenCodianView` 不再分别维护两段平行的 activation host factory。

streaming tab 激活时那条 active-conversation/session 写回 + baseline + selector/context/send-button outcome，loaded-conversation hydration 前的 activation state writeback，current-tab 新建会话后的 open shell，以及 empty-tab 激活时相邻的 active-pane reset shell，现在也不再由 view 自己分散内联；这些步骤已统一交给 `runtime/TabConversationActivationBridge.ts`，并继续复用 `TabConversationStateBridge`、`TabViewActivationBridge`、`QuestionTodoActivationRefreshCoordinator`、adapter-owned background-task activation port 与 `ActiveTabContextUsageCoordinator`。不同的是，current-tab / new-tab 新建入口本身的“该不该创建、该显示什么 notice、该走 activate 还是 open”的分支，已经进一步前移到 `ConversationTabOpenCoordinator`；因此 `TabConversationActivationBridge` 只保留 shell/outcome 编排，不再兼管按钮入口的阻塞或提示决策。

首次打开聊天视图时那段 `loadConversations()`、persisted tab restore、restore 失败后的 tab state reset/flush，以及“复用首个已有 conversation / 不存在时创建新 conversation”的 fallback；header 上“新建会话”与“在当前 tab 新建会话”两条入口里的 max-tabs / streaming-block / notice 分支；以及 delete conversation / delete-all 后的 recovery/reset 路径，现在都先由 `services/ConversationLoadRecoveryCoordinator.ts` 统一收口。它直接拥有 bootstrap / restore 决策，并继续复用 `ConversationTabOpenCoordinator.ts`、`ConversationTabLifecycleRecoveryCoordinator.ts` 与 `ConversationViewStateService.ts`，因此 view 不再直接持有多条平行的 create/load/recovery 主链路。load-recovery host 组装已通过 `createConversationLoadRecoveryHost(deps)` 工厂函数集中到 coordinator 文件；工厂吸收了 `showNotice`、`confirmRewind`、`chooseForkTarget`、`resetPersistedTabState` 四项组装逻辑，view 只传入 `app` 和 `setPersistedTabState` 等低层级依赖，不再传入 Notice/confirm/fork-modal 回调。close-last-tab 的静默 fallback tab、delete/delete-all 复用 noticed new-tab 路径、persisted restore 失败后的 state reset/flush 与现有 activate/hydration 语义都保持不变。

loaded-conversation 切换里旧标题生成取消、background-task indicator reset、scheduled scroll cleanup、消息区清空、turn state reset，以及 hydration lifecycle shell，也不再由 `ConversationViewStateService` 直接通过散落 host 回调持有；这些壳层步骤现在先由 `runtime/ConversationTransitionBridge.ts` 统一桥接。随后消息容器的 `is-rehydrating` class、scroll snapshot、restore-bottom / restore-anchor / restore-distance 调度，以及 pane scroll metrics 回写，再由 `runtime/ConversationHydrationRenderBridge.ts` 承接，view 只保留 title/background indicator/message container/runtime 的真实实现。

loaded-conversation activate 前的 conversation lookup、reload retry、interrupted-tail 驱动的 server-sync 判定，以及 `load-conversation` sync 返回的 revert-state 写回，也不再由 `ConversationViewStateService` 直接通过散落的 host 回调组合；这些数据解析入口现在先由 `runtime/ConversationLoadRuntimeBridge.ts` 统一桥接，view 只保留真实的 conversation 查询、sync 与 revert-state 落点实现。

loaded-conversation 在消息拿到之后那段 background-task rebuild（已直接委托 `BackgroundTaskTimelineService.syncStateFromConversation()`）、`renderMessages()`、post-render indicator/dock/status-question-todo outcome，以及 sync baseline commit，也不再由 `ConversationViewStateService` 直接握着多段 host 回调串起来；这些 outcome 现在先由 `runtime/ConversationHydrationOutcomeBridge.ts` 统一组合，再分别复用 `TabViewActivationBridge` 与 `TabConversationStateBridge`。

tab stream-like badge、background-task badge、rewind/fork 按钮禁用态，以及 attention 标记写回现在也不再由 view 自己散落地直接操作 `TabManager` 或消息区 DOM：这些 runtime→UI 写回统一交给 `runtime/TabRuntimeStateBridge.ts`，view 只保留 wrapper 方法与 host bridge。

除此之外，`ConversationSessionSignalRuntime` 现在会接入 `message.updated`、`message.removed`、`message.part.updated`、`message.part.removed`、`message.part.delta`、`session.diff` 和 `session.compacted`：message/part 类会先按 session 匹配 tab，再交给 `ConversationSyncBridge` 走 canonical local merge；`session.diff` 只写入独立 diff/notice 输入；`session.compacted` 则作为 compaction 收尾 signal 触发 current-session authoritative refresh。

### question dock / pending question 编排

question dock 与 pending-question refresh 的主要 runtime/UI ownership 现在由 `QuestionDockCoordinator` 承担：

- `OpenCodianView` 只保留更窄的 `QuestionRuntimeViewHostAdapterHost`：提供 active tab / current session / runtime state 与 scroll pin；resolution-card gate、tab attention 写回与 sync follow-up 已改由 adapter 直接复用 settings、`TabRuntimeStateBridge` 与 `ConversationSyncBridge`
- `QuestionDockSlotCoordinator` 现在代持 `QuestionDock` slot / instance 生命周期、`questionCardPosition` 设置门控和显式 render trigger；view 只在输入区构建、locale refresh、tab activation 与 close 时调用它
- `QuestionRuntimeViewHostAdapter` 会把 dock slot port、question display settings、OpenCode question API，以及已有 `TabRuntimeStateBridge` stable port 组合成 `QuestionRuntimeHostAdapter` 消费的 `QuestionRuntimeViewHost`
- `QuestionRuntimeHostAdapter` 统一装配 `QuestionInlineCardRenderer`、`QuestionResolutionCoordinator`、`QuestionDockCoordinator` 与 `QuestionResolutionFlowCoordinator`，并把 pending-question refresh / clear、post-resolution status/sync follow-up 与 dock-or-inline resolve flow 一起收束回同一份 question runtime bundle
- `QuestionDockCoordinator` 统一持有 pending-question refresh、waiter 保活、draft answer sanitize、dock render callbacks，以及回答/拒绝后的 status refresh + visible sync follow-up
- `QuestionResolutionFlowCoordinator` 会先尝试把请求交给上方 dock；如果当前设置仍使用 inline question card，才退回 `QuestionInlineCardRenderer`

### 消息区重渲编排

消息区的 render orchestration 现在由 `ConversationRenderService` 统一决定：

- `rerenderConversationMessages()`：整段历史重渲、scroll snapshot/restore、hydration begin/end
- `applySyncedConversationUpdate()`：先判定是否可增量，再决定 append / tail patch / full rerender
- `patchTrailingAssistantRender()`：只在前缀 rendered message 完全稳定时 patch 最后一条 assistant
- `getIncrementalRenderedMessageUpdate()`：作为纯 helper 判断当前 sync 是否还能走 append-only 路径
- `createConversationRenderHost(deps)` 工厂函数（定义在 `ConversationRenderService.ts`）接收 `ConversationRenderHostDependencies` 扁平依赖，在工厂内部装配完整的 `ConversationRenderHost` 回调对象（包括 shell/tail render port 和 debug callbacks）；view 只提供原始 service 引用和简单 lambda，不再拥有 `createConversationRenderHost` / `createConversationAssistantShellRenderPort` / `createConversationAssistantTailRenderPort` 私有方法
- `ConversationCanonicalRenderSource`：把 `OpenCodeService.getCanonicalSessionState()` 与 `hydrateOpenCodeMessage()` 作为独立 source 注入 render service，让 full rerender / synced update 优先走 canonical turn view-model，同时不扩大 DOM host

其中 user message body renderer 不是 late-bound view 字段：`OpenCodianView` 会先创建 `UserMessageContentRenderer`，再把这个具体实例注入 `createConversationRenderHost()`，避免 render service 在首次发送或 authoritative rerender 时拿到未初始化的 renderer。

收到服务端新消息后，`applySyncedConversationUpdate()` 会优先尝试：

- patch 最后一条 assistant render
- 仅追加新增 render message
- 对纯文本 assistant 消息使用 pseudo-stream reveal

否则回退到整段重渲。

assistant notice card 的 tone / icon、OMO system-reminder 标题与 raw block、notice action label 等 DOM 细节现在由 `runtime/AssistantNoticeCardRenderer.ts` 承接；persisted assistant shell / notice / footer / timestamp / body rendering（`renderMessageBody` / `renderContentBlock` / `getAssistantBodySignature` / `getStoredToolStatus`）组装则进一步统一交给 `runtime/AssistantShellViewHostAdapter.ts`；而 user message footer 的 copy / rewind / fork / timestamp 组装由 `runtime/UserMessageFooterRenderer.ts` 承接。tooltip label 注入与 copy button 行为（clipboard 写入、'copied!' 反馈、aria label 管理）已从 `OpenCodianView` 抽出为 `services/ConversationRenderService` 的静态方法（`setTooltipLabel`、`attachTooltipLabel`、`attachCopyButtonBehavior`），供 `UserMessageFooterRenderer`、`AssistantShellRenderer` 与 view 的 header/composer host 直接复用。`removeEmptyAssistantShells()`（空壳 assistant DOM 清理）也已迁入 `ConversationRenderService`。`hasInterruptedLocalAssistantTail()`（interrupted-tail 判定）已迁入 `ConversationRenderRuntime`。`createAssistantShellContainer()` 与 `setStreamingAssistantMessageVisibility()` 已迁入 `AssistantShellViewHostAdapter`。`OpenCodianView` 只保留 Markdown 渲染与 rewind/fork 等副作用的 host 回调。

### 发送与流式渲染

第七阶段后，`OpenCodianView.sendMessage()` 已经退化成 UI 事件到 `runtime/SendPipelineRuntime.ts` 的薄桥接。完整发送子系统现在按下面的边界协作：

1. `OpenCodianView` 只负责把输入事件转交给 `SendPipelineRuntime`；prompt submission 会把 `syntheticTextParts` 与显式 `invocationIntent` 一并透传，composer `@agent` 选中项和主 Agent selector 选择也走这条 intent seam
2. `MessageSendPreparationService` 负责确认当前 conversation / active tab / runtime 可发送
3. `MessageSendPreparationService` 负责 server readiness、model catalog lazy load 与 selected model availability 检查
4. `createInteractionRuntimeWiring()` 先构造本地 `MessageFinalizationService`，再把该实例传给 `createMessageSendPreparationHost()`；server offline / unavailable 的准备阶段错误终结流因此不会读取尚未赋值的 view 字段
5. `MessageSendPreparationService` 再把 optimistic user message 落到本地 conversation，并保持 save / render / scroll 时序
6. 首条 user message 时，仍先写 fallback title，再按设置异步触发 AI title generation
7. `SendPipelineRuntime` 调用 `openCodeService.sendMessage()`，创建 streaming shell 与 `StreamController`
8. `SendPipelineRuntime` 装配 `StreamChunkRouter` 处理 chunk / pending / timeout / interruption
9. `SendPipelineRuntime` 装配 `StreamLocalFinalizer` 处理本地 shell finalization 与第一次本地保存
10. `MessageFinalizationService` 再接手最终 canonical convergence：优先走 `syncConversationMessagesFromCanonicalState()`，缺失时再回退服务端 sync，然后统一做 post-sync patch/rerender、todo/save/attention 收尾

`SendPipelineRuntime` 的 chunk router 仍显式覆盖这些分支：

- `message_start`
- `usage`
- `message_metadata`
- `message_stop`
- `file_edited`
- `permission_request`
- `question_request`
- 其余可转换为本地 `StreamChunk` 的 text / thinking / tool 事件

发送子系统的本地收尾阶段会：

- 把 streaming 内容组装成持久化的 assistant `ChatMessage`
- 在正常完成时通过 `MessageFinalizationService` 先尝试把 canonical session graph 投影回最终消息；只有 canonical state 缺失时才回退服务端拉取，并按需 patch / rerender UI
- 通过 `ConversationNoticeCoordinator` 追加 turn diff notice
- 刷新 session todos
- 更新 context usage

第七阶段后，这条链路的边界变成：

- send preflight / optimistic bootstrap / stream-enter state 切换，已迁到 `services/MessageSendPreparationService.ts`
- server readiness action card 提示流程（`ensureServerReadyForChat` / `refreshStatusSurfaces`），已迁到 `services/MessageSendPreparationService.ts`；view 通过 host 原语提供 DOM 与服务访问
- slash command execution host 装配，已迁到 `services/SlashCommandExecutionService.ts`；`createSlashCommandExecutionHost()` 工厂函数接收 `SlashCommandExecutionHostDependencies` 扁平依赖，view 只传递原始 service 引用和简单 lambda
- stream loop、pending/timeout/interruption 已迁到 `runtime/StreamChunkRouter.ts`
- 本地 streaming shell/notice 渲染、session retry message 读取与第一次本地保存已迁到 `runtime/StreamLocalFinalizer.ts`
- post-stream finalization / post-sync orchestration 已迁到 `services/MessageFinalizationService.ts`
- `OpenCodianView` 本身只保留 runtime host 装配与 bridge 方法；streaming tool-call start/end 与 primary-stream background-task finalize 触发也已经下沉到 `runtime/BackgroundTaskStreamTriggerCoordinator.ts`
- 消息区 patch / rerender 细节仍继续复用 `ConversationRenderService`

第八阶段起，host 装配 lifecycle 已移入 `SendPipelineRuntime.createSendPipelineRuntimeHost()`。view 现在只保留 `createSendPipelineHostDependencies()` 扁平依赖工厂，返回 `SendPipelineHostDependencies` 供工厂函数消费。该依赖对象覆盖的能力簇仍为：

- `SendPipelineViewPort`（含 active tab、tab runtime 和 session retry message 查询）
- `SendPipelineTransportPort`
- `SendPipelineShellPort`
- `SendPipelinePersistencePort`
- `SendPipelineDebugPort`

再组合回完整 `SendPipelineHost`。这让 runtime 子模块可以逐步依赖更窄的 port，而不是继续面向同一个不断膨胀的 view host。

发送 runtime 目录内部也继续细分成更小的职责模块：

- `AssistantCopyContent.ts`：封装 persisted assistant footer copy-content 的 structured-text / fallback source 选择
- `AssistantErrorRenderer.ts`：封装本地 stream-error assistant shell 的错误块 DOM 组装，并复用既有 error footer seam
- `AssistantFooterPayload.ts`：封装 persisted / notice / pseudo-stream / error assistant footer 传给 timestamp/copy renderer 的 payload 组装
- `AssistantFooterRenderer.ts`：封装 notice / pseudo-stream / error footer 的最终 renderer 调用，并继续复用 persisted footer finalizer
- `PersistedAssistantFooterFinalizer.ts`：封装 persisted assistant footer 的最终 renderer 调用，让 view、`ConversationRenderService` 与 `AssistantFooterRenderer` 都只通过 `messageEl` + `message` bridge 回到同一个 finalizer
- `UserMessageFooterRenderer.ts`：封装 user message footer 的 copy / rewind / fork button 与 timestamp 组装，view 只保留副作用 host
- `SendPipelineTypes.ts`：定义 runtime 与 host 契约
- `AssistantShellRenderer.ts`：封装 assistant streaming shell 的创建、reveal 与 timestamp 收尾
- `AssistantShellViewHostAdapter.ts`：统一装配 assistant shell / notice / footer 相关 host，让 `SendPipelineShellPort` 与 notice/footer bridge 共用同一条 view seam
- `AssistantNoticeRenderer.ts`：封装 stream error / interrupted notice 构造与 placeholder notice 渲染
- `AssistantPlainTextFallbackRenderer.ts`：封装无 structured blocks 的 resolved card + plain-text fallback 渲染
- `StreamingInlineCardRenderer.ts`：封装 permission/question inline card 的共享插入位置与 shell reveal
- `PermissionInlineCardRenderer.ts`：封装 permission inline card 的内容构造与按钮等待
- `QuestionInlineCardRenderer.ts`：封装 grouped/sequential question inline card 的内容构造、容器复用与按钮等待
- `QuestionResolutionFlowCoordinator.ts`：封装 dock-or-inline question resolve flow、OpenCode reply/reject 调用与 resolved-state follow-up
- `QuestionResolutionCoordinator.ts`：封装 resolved question 的 pending state 写入、clear/render 分支与贴底滚动
- `QuestionResolutionCardRenderer.ts`：封装 resolved question 回顾卡片与 answered/rejected markdown 摘要构造
- `PendingIndicatorController.ts`：管理 delayed pending DOM
- `SendPipelineTrace.ts`：维护 trace id、progress checkpoint 与调试快照
- `sendPipelineContent.ts`：提供 streaming content 纯函数
- `buildLocalStreamOutcome.ts`：负责本地收尾纯推导
- `StreamShellFinalizer.ts`：只处理 streaming shell DOM 最终落地
- `LocalStreamMessagePersistence.ts`：只处理 assistant/notice 本地持久化

此外，这条链路还有两个明确的运行时保护：

- 1 秒后才显示 pending 指示器
- 5 分钟无新 chunk 时，视图会主动断开本地流并转入后台同步模式

如果流已经结束、服务端又没有给出任何可见 assistant 内容，`OpenCodianView` 不会再把错误当成普通 assistant 文本泡泡，而是改成持久化的 notice card。这个 notice 会尽量带上对应的 `sourceMessageId`，这样后续同步时只有在同一条服务端回复真的补回可见内容后才会自动让位，不会再出现“红条闪一下就消失”的情况。

另外，错误优先级现在是：

- 先显示 `OpenCodeService` 透传出来的真实 `error` chunk（包括 SDK `session.error` 和 assistant persisted message 里的结构化错误）
- 只有在流里完全没有文本、也没有真实错误时，才退回通用的 “serverNoResponse” 提示

### 消息渲染分派

`renderMessage()` 根据消息类型分成两路：

- `role === 'assistant'` -> `AssistantShellViewHostAdapter.renderPersistedAssistantMessage()`
- `role === 'user'` -> `UserMessageContentRenderer.renderUserMessageContent()`（通过 `ConversationRenderHost.userMessageContentRenderer` 端口调用）

assistant 渲染里：

- `contentBlocks` 会按块类型渲染
- structured assistant 分支由 `renderAssistantStructuredContent()` 消费 `buildQuestionResolutionCardRenderPlan()` 产出的 render plan
- persisted assistant 的 shell / footer / notice 分派由 `AssistantShellViewHostAdapter` 统一执行；其中 persisted footer 收尾继续由 `PersistedAssistantFooterFinalizer.finalizeFooter()` 统一处理，notice / pseudo-stream / error footer 则由 `AssistantFooterRenderer` 统一执行。本地 stream-error assistant bubble 的错误块 DOM 由 `AssistantErrorRenderer` 统一执行。它们内部继续分别复用 `buildPersistedAssistantFooterPayload()` 与其它 footer payload helper 组装 timestamp/copy/model/status，而 view 侧 host 装配则通过 `AssistantShellViewHostAdapter.ts` 统一收口
- `ConversationRenderService` 需要 patch 尾部 assistant 时，不再直接抓整块 view host 上的多个独立 callback，而是通过 `ConversationAssistantTailRenderPort` 回到这组 assistant-tail bridge
- `thinking` 块走 `ThinkingBlockRenderer`
- `tool_use` 块走 `ToolCallRenderer`
- `text` 块和普通 `content` 走 `MarkdownRenderService`
- 已解析的 `questionResolution` 会先经 `buildQuestionResolutionCardRenderPlan()` 折叠成 render plan，再由 structured/fallback helper 在允许显示时插入持久化 resolved card
- 无 `contentBlocks` 的 assistant fallback 由 `renderAssistantPlainTextFallbackContent()` 统一处理 resolved card 追加与 `message.content` 渲染

### 模型选择器拆分

model selector 现在拆成了几层协作：

- `ui/modelSelector/ModelSelectorRenderer.ts`：下拉列表的 loading / empty / provider group / option DOM 渲染
- `ui/modelSelector/ModelSelectorInteractions.ts`：高亮、键盘导航、选中高亮项、滚动当前模型到可见区域
- `ui/modelSelector/ModelSelectorDisplay.ts`：trigger text / title / class 所需 display state 推导
- `ui/modelSelector/types.ts`：共享输入/输出类型
- `ui/modelSelectorStickyHeaders.ts`：provider header 的 stuck 监听绑定与 cleanup

`OpenCodianView` 现在保留：

- dropdown 容器、搜索框和 trigger 的真实 DOM
- catalog 加载、tab model override、provider icon 异步解析
- `switchModel()`、`reloadModelCatalog()`、`syncActiveTabContextUsageIdentity()` 等视图级副作用

用户消息渲染现在由 `UserMessageContentRenderer` 统一负责：

- `renderUserMessageContent()`：渲染 visible text（含可选 `prepareUserMessageMarkdownForDisplay()` 与 `setupCollapsible()` 折叠）、context attachment chips、OMO 注入面板
- `renderCompactionDivider()`：渲染 compaction divider 消息（活跃分割线或已完成 badge+标签）
- 通过 `UserMessageContentRendererHost` 端口向 view 获取 `getRenderUserMarkupAsCodeBlocks()`、`renderMarkdownInto()`、`scheduleActiveSettledScrollToBottomIfNeeded()`、`openContextAttachment()` 等 host 能力
- footer 仍通过 `UserMessageFooterRenderer` 追加，copy / rewind / fork 的真实副作用留在 view host

渲染消息列表前还会经过 `getMessagesForRender()`，也就是先用 `renderGroups` 合并连续 assistant message，再对合并结果跑 `injectLiveCompactionDivider`（把活跃压缩过程插入为虚拟 `compactionDivider` 消息）和 `tagCompactionSummaries`（标记已完成压缩的 assistant summary 消息）。

### context、选区与文件目录

这个视图仍负责 composer context 按钮装配；而 context picker / retained-selection 相关 host wiring 现在先收束到 `ComposerContextViewFacade.create()`，再由它装配 active-tab `draftContextItems` / `focusContextPreview` 写回、焦点预览 runtime、入口动作和 chips 编排：

- `ComposerContextViewFacade.create()` 负责把 view 提供的较窄 seam 组装成 composer context service bundle，并把 `ContextAttachmentBuilder`、`ContextFileCatalogService`、retained-selection / context picker 相关 host wiring 从 `OpenCodianView` 构造函数里迁走
- `ComposerContextEventBridge` 负责 composer/context 相关的 workspace / vault / DOM 事件注册、当前会话 note path 写回，以及 retained-selection polling lifecycle
- `ComposerContextViewHostAdapter` 负责 active-tab `draftContextItems` / `focusContextPreview` 的统一读写，并把同一份 state seam 暴露给 action/picker/coordinator/focus-runtime 几条路径
- `FocusContextRuntimeService` 负责活动 `MarkdownView` 回退查找与 focus preview 计算，并通过 `RetainedSelectionRuntimeCoordinator` 承接 composer pointer handoff / focusin/focusout / polling 驱动的 retained-selection 协调
- `ComposerContextActionService` 负责 current-note / selection 两个活动编辑器入口动作与 draft 写回
- `ComposerContextPickerActionService` 负责 add-context 文件选择器的打开/关闭、catalog 加载，以及 file context draft 写回
- `ComposerContextCoordinator` 负责 composer context chips 渲染、preview attach/detach click 编排，以及失效 preview 的 refresh handoff
- `ContextAttachmentBuilder` 负责 current-note / selection / file 三类 `PromptContextItem` 构建，以及 remote 模式下的文本快照读取与 `64 KiB` 校验
- 文件选择器使用 `ContextFileCatalogService` 惰性构建和缓存 `ContextFileCatalog`；picker action service 负责把 catalog loader 交给 picker，并把 picker open/close 生命周期桥接到 retained-selection handoff / preview writeback，而 vault `create/delete/rename` 增量同步则由 `ComposerContextEventBridge` 统一桥接

选区高亮保留逻辑现在由 retained-selection runtime coordinator 集中承接：

- 会尝试同时保存 CodeMirror 偏移和 DOM range
- 通过轮询和 composer focus/pointer 事件维护 retained highlight，并把 cleanup 收束到 `dispose()`

### question、todo 与 background task

这三个辅助子系统都由 view 负责路由：

- session todo/status：OpenCode live listener 生命周期、session→tab 路由、active-tab fallback，以及 live update 后的 background-task reconcile 已收束到 `services/ConversationSessionSignalRuntime.ts`；主动拉取刷新、request-id stale guard、stream/live-signal/tab-reset/runtime writeback，以及 dock render 入口现在统一由 `services/SessionTodoCoordinator.ts` 承接，并经由 `services/SessionTodoHostAdapter.ts` 从 view host 装配出来；activation/open 和 post-sync 场景里 status + pending-question + todo 的组合刷新顺序已下沉到 `services/QuestionTodoStatusRefreshCoordinator.ts`，activation/open 侧残留的 dock writeback 与 supplemental refresh 又进一步下沉到 `services/QuestionTodoActivationRefreshCoordinator.ts`，而 post-sync + background-task follow-up 的剩余 host wiring 现在再由 `services/QuestionTodoBackgroundTaskRefreshHostAdapter.ts` 统一装配；normalized snapshot、status fingerprint、stale suppression 与 persisted notice 恢复继续由 `services/SessionTodoStateService.ts` 负责，session todo dock 的挂载/销毁与 active-vs-runtime session 选择则继续由 `services/SessionTodoDockCoordinator.ts` 负责，而真正的 persisted assistant notice append/dedupe 则进一步收束到 `services/PersistentAssistantNoticeService.ts`
- question：既支持输入区上方的 `QuestionDock`，也支持由 `QuestionRuntimeHostAdapter.ts` 装配的 `QuestionInlineCardRenderer` 管理内联待回答卡片，再由 `QuestionResolutionFlowCoordinator` 统一承接 dock-or-inline resolve flow，以及由 `QuestionResolutionCoordinator` + `QuestionResolutionCardRenderer` 协作管理的已回答/已拒绝回顾卡片；这些 question card / resolution recap 只属于 client-only decoration，不作为 assistant body、tool、structured payload 或 canonical message truth；pending-question refresh / clear 与 post-resolution status/sync follow-up 的共享路由也继续留在这份 bundle 内，而相邻的 dock/API/attention late-bound wiring 现在先经由 `services/QuestionRuntimeViewHostFactory.ts` 收束，再交给 `QuestionRuntimeViewHostAdapter.ts`
- background task：从 OMO 注入、`toolName === 'task'` 的 tool block、以及后续 system reminder 回写推导任务进度；运行态以内联状态条挂在对应 assistant turn 下，完成态则延迟落成持久化 notice；其中 timeline segment 推导、launch/completion runtime 重建、pending matching，以及 inline notice copy 组装已下沉到 `services/BackgroundTaskTimelineService.ts`，inline panel 的 DOM 创建、挂载、复用/清理已下沉到 `runtime/BackgroundTaskInlinePanelRenderer.ts`，indicator render 与 completion notice queue/flush 顺序已下沉到 `runtime/BackgroundTaskIndicatorCoordinator.ts`，streaming tool-call start/end 与 primary-stream finalize 触发已下沉到 `runtime/BackgroundTaskStreamTriggerCoordinator.ts`，live-signal reconciliation、authoritative-sync gate，以及 tab badge / finalize 共用的 live/grace-period running predicate 已下沉到 `services/BackgroundTaskLiveSignalCoordinator.ts`，而 tab stream-like/background-task badge 与 rewind-fork 按钮禁用态写回则进一步下沉到 `runtime/TabRuntimeStateBridge.ts`；hidden signal/background-tab sync 以及 active visible-conversation background sync 后的 question/todo/background-task refresh 组合装配已继续下沉到 `services/QuestionTodoBackgroundTaskRefreshHostAdapter.ts` 装配的 `services/PostSyncQuestionTodoRefreshFacade.ts` + `services/VisibleConversationPostSyncCoordinator.ts` + `services/BackgroundConversationPostSyncHandoffCoordinator.ts`，其中 facade 负责 question/todo refresh request，visible coordinator 负责 active-conversation state commit，handoff coordinator 负责 signal authoritative mark 与 background attention handoff；stopped/stale warning notice 的 content、fingerprint、suppression runtime 以及 completion notice 的 queued-state、fingerprint/content 都已下沉到 `services/BackgroundTaskNoticeStateService.ts`，而两条链路共用的 persisted assistant notice append/dedupe 与 visible/hidden tab 后续动作已进一步下沉到 `services/PersistentAssistantNoticeService.ts`
- background task 的 stale 判定现在额外受 `backgroundTaskAwaitingAuthoritativeSync` / hydration 保护：reload 或首次装载后，只有在至少一次权威消息同步完成后，才允许把“仍在运行”降级成 stopped/stale notice；这段 gate + live-signal 决策现在集中在 `BackgroundTaskLiveSignalCoordinator`

session todo 这条子链路现在的边界是：

- `OpenCodianView`：tab runtime/state host，以及更薄的 session 选择与 bridge 装配
- `ConversationSessionSignalRuntime`：session sync/todo/status listener 生命周期、session→tab 路由、active-tab fallback、signal sync 调度，以及 live update 后的 background-task reconcile 触发
- `SessionTodoHostAdapter`：session todo state/dock/refresh 三段 host factory 与 service bundle 装配
- `SessionTodoCoordinator`：streaming todowrite snapshot、live-signal todo/status 写回、主动 refresh、dock render，以及 activation/empty-tab session reset 的统一入口
- `SessionTodoDockCoordinator`：session todo dock 的 slot 生命周期，以及 active/background tab 的 session→dock 渲染选择
- `QuestionTodoActivationRefreshCoordinator`：activation/open 侧的 question dock render、session todo dock writeback 与 supplemental refresh 编排
- `QuestionTodoBackgroundTaskActivationHostAdapter` 内联的 background-task activation port：activation/open 侧的 background-task indicator reset、conversation-derived runtime rebuild 与 render trigger 编排
- `ActiveTabContextUsageCoordinator`：activation/open 与相邻 sync 路径的 active-tab context usage identity / snapshot writeback 编排，以及 per-tab stream lifecycle、indicator 刷新和详情弹窗打开；context usage detail modal 的 rawMessageLoader 现通过 `loadBackendSessionMessages()` 路由到 backend-aware session history service。`OpenCodianView.createActiveTabContextUsageCoordinatorHost().getSessionContextUsageSnapshot()` 已后端感知：当当前会话 backend 为 `claude-code` 时，路由到 `ClaudeCodeAdapter.getSessionContextUsageSnapshot()`（调用 `query.getContextUsage()` 并转换为 core-owned `ContextUsageSnapshot`）；当 backend 为 `opencode` 时，仍走 `OpenCodeService.getSessionContextUsageSnapshot()` 原有路径；Codex 等未接入精确 context snapshot 的 backend 会在 coordinator 层跳过 server refresh，避免误触 OpenCode session API。`OpenCodianView` 只消费 `src/core/types` 导出的 DTO，不从 `ContextUsageService` 反向导入类型，保持 chat view 与 backend owner 的依赖方向清晰
- G10c foreground compaction 继续复用上述 host seam：`getForegroundCompactionAvailability()` 与 `compactForegroundThread()` 只路由到 Codex adapter；`ContextDetailModal` 通过 coordinator 获取当前 thread/availability 与 action，不在 view 内增加 requesting、accepted、verified 或 stale 状态。
- `QuestionRuntimeViewHostFactory`：question runtime 相邻的 dock/API/attention late-bound host 派生，以及完整的 runtime bundle 装配（`createQuestionRuntimeBundle`）；`OpenCodianView` 不再直接调用 `createQuestionRuntimeViewHost`、`createQuestionPostResolutionRuntimeHostAdapter` 或 `createQuestionRuntimeServices`
- `QuestionTodoBackgroundTaskRefreshHostAdapter`：`QuestionTodoStatusRefreshCoordinator`、`PostSyncQuestionTodoRefreshFacade`、`VisibleConversationPostSyncCoordinator` 与 `BackgroundConversationPostSyncHandoffCoordinator` 共用的 refresh-side host factory 与 service bundle 装配
- `QuestionTodoBackgroundTaskRuntimeServiceBundle`：question/todo/background-task 共享的 host assembly 与 service instantiation 顺序；`OpenCodianView` 不再内联组装 `assembleQuestionTodoBackgroundTaskRuntimeHost()`，改为构造 `QuestionTodoBackgroundTaskRuntimeSeam` 直接传给本模块的 `createQuestionTodoBackgroundTaskRuntimeServiceBundleFromSeam()` 工厂
- `QuestionRuntimeHostAdapter`：`QuestionInlineCardRenderer`、`QuestionResolutionCoordinator`、`QuestionDockCoordinator`、post-resolution follow-up 与 `QuestionResolutionFlowCoordinator` 共用的 host factory 与 service bundle 装配
- `QuestionTodoStatusRefreshCoordinator`：activation/open 与 post-sync 共享的 status + pending-question + todo 组合刷新顺序，以及 post-sync todo/status runtime gate
- `PostSyncQuestionTodoRefreshFacade`：background sync 下的 question/todo refresh session 配对，以及 rebuild / completion / stream-like follow-up
- `SessionTodoStateService`：todo/status runtime state、snapshot 规范化、stale notice suppression 与 persisted notice dedupe/restore
- `PersistentAssistantNoticeService`：session todo stale notice 的历史匹配、持久化 append，以及 visible/hidden tab 后续动作

background task notice 这条子链路现在的边界是：

- `OpenCodianView`：通过 `createBackgroundTaskViewHost()` 工厂统一装配 background-task host 回调，再分发到各 host adapter；不再在 view 内联定义这些回调
- `BackgroundTaskTimelineService`：launch/completion timeline segment 推导、conversation→runtime rebuild、pending matching、completion segment 收集，与 inline copy 组装
- `BackgroundTaskInlinePanelRenderer`：inline panel DOM 创建、位置挂载、Markdown 渲染、mount 复用与 active indicator element 清理
- `BackgroundTaskIndicatorCoordinator`：直接组合 live-signal reconcile、inline render、completion notice queue/flush 与 stream-like sync 编排
- `BackgroundTaskStreamTriggerCoordinator`：streaming tool-call start/end、todo refresh、background-task launch runtime 更新，与 primary-stream finalize 后的 waiting/reset trigger 编排
- `BackgroundTaskLiveSignalCoordinator`：authoritative-sync gate arm/clear、tab badge / finalize 共用的 indicator running predicate、live-signal reconciliation，以及 stale downgrade / reset 的运行时判定
- `TabConversationStateBridge`：active-tab conversation/session 激活写回、pending-question reset 与 sync fingerprint baseline 提交
- `TabConversationActivationBridge`：当前活动 tab 的 empty-state activation 与 current-tab 新建会话打开路径的消息区 shell cleanup、baseline commit，以及复用 `QuestionTodoActivationRefreshCoordinator` / adapter-owned background-task activation port / `ActiveTabContextUsageCoordinator` 的后续刷新编排
- `TabViewActivationBridge`：tab/pane activation 预刷新写回，以及 streaming / empty-tab activation outcome 的 selector、send-button 与 loaded-conversation post-render outcome 编排；question/todo dock writeback 已委托 `QuestionTodoActivationRefreshCoordinator`，background-task indicator render 已委托 adapter-owned background-task activation port，context usage identity/snapshot 已委托 `ActiveTabContextUsageCoordinator`
- `ConversationLoadRecoveryCoordinator`：create/load/bootstrap/delete-recovery/fork/rewind 的统一 conversation lifecycle surface，并直接承接首开 load / persisted restore / fallback-create 决策与 restore 失败后的 tab state reset/flush
- `ConversationTabLifecycleRecoveryCoordinator`：tab close / conversation delete / delete-all reset 后的 pane cleanup、next-active activation 与 fallback-create recovery 决策
- `ConversationTransitionBridge`：loaded-conversation 的切换前 cleanup、消息区清空、turn reset 与 hydration lifecycle shell
- `ConversationHydrationOutcomeBridge`：loaded-conversation 消息装载后的 background-task rebuild、message rerender、post-render outcome 与 baseline commit 编排
- `ConversationHydrationRuntimeViewHostFactory`：通过 `assembleConversationHydrationRuntime` 一次性完成 hydration bridge 装配，从扁平 view seam 派生 hydration render / transition / outcome host，并打包创建三段 hydration bridge；view 不再直接调用 `createConversationHydrationRuntimeBridges`
- `TabRuntimeStateBridge`：tab stream-like / background-task badge、rewind-fork 按钮禁用态与 attention 标记的 runtime→UI 写回
- `QuestionTodoBackgroundTaskRefreshHostAdapter`：question/todo/background-task post-sync 三段 host wiring 与 service bundle 装配
- `QuestionTodoStatusRefreshCoordinator`：activation/open 与 post-sync 共享的 status + pending-question + todo 组合刷新顺序，以及 todo/status refresh runtime gate
- `PostSyncQuestionTodoRefreshFacade`：hidden signal/background-tab sync 与 active visible-conversation background sync 后的 question/todo/background-task refresh 组合装配
- `BackgroundConversationPostSyncHandoffCoordinator`：hidden signal/background-tab sync 后的 authoritative mark、background refresh 与 attention handoff 编排
- `BackgroundTaskNoticeStateService`：stopped/stale notice content、fingerprint、persisted dedupe 与 suppression runtime 协调
- `BackgroundTaskNoticeStateService`：stopped/stale notice content、fingerprint、persisted dedupe、suppression runtime，以及 completion notice queued state、content/fingerprint 与 persisted dedupe/append 协调；queued state 已不再挂在 view runtime 上
- `PersistentAssistantNoticeService`：session todo / background task / diff / model-unavailable 共享的 persisted notice append、conversation save、sync fingerprint 写回，以及 visible/hidden tab 后续动作
- `ConversationNoticeCoordinator`：conversation empty / stream error notice 生成、stream error 友好文案映射（`getFriendlyStreamErrorMessage`）、turn diff / notice action 的编排入口；`OpenCodianView` 不再保留 `getFriendlyStreamErrorMessage` 或 `appendAssistantErrorMessage` 的私有实现

## 外观与控件

`OpenCodianView` 也是这些 UI 控件的装配点：

- header：logo、server badge、新建对话、新建当前 tab 对话、历史、设置
- toolbar：permission selector、model selector、context ring、effort selector
- appearance：theme preset、chat appearance CSS variables、自定义 CSS、背景图
- input panel glass：`InputPanelAppearanceCoordinator` 负责 SVG filter layer、adapter mount/unmount、action button class 与诊断日志
- experimental demo：`ChatVisualDemoCoordinator` 负责 toggle、互斥、destroy；Notice 和日志通过 host 接口回传给 view

模型选择器本身支持：

- provider 分组
- 搜索过滤
- 键盘导航
- provider icon 异步加载
- 每个 tab 的 model override
- 保留 disabled / unavailable 模型的展示元数据，不把它们简单抹掉
- 会优先解析当前 tab 请求的模型；若它已被开关链路过滤，则自动回退到同 provider 默认模型 / 当前 effective catalog 的其他可用模型
- 当 effective catalog 为空时，trigger 会回退到默认机器人图标，并保留空 catalog 对应的 tooltip 文案

effort selector 的 variant 列表按 backend 分支处理：OpenCode 按 provider/model 查询 `findKnownModelInfo()`；Claude Code 使用固定的 `CLAUDE_CODE_EFFORT_VARIANTS`；Codex 使用 `CODEX_EFFORT_VARIANTS` 并通过 `onVariantChange` 写回 `backendSettings.codex.modelReasoningEffort` + 调用 `CodexAdapter.updateModelReasoningEffort()` 更新 adapter options。当前局部 `modelRef` 仅保留为既有兼容占位并用行内 lint 注释限制影响，不作为额外 runtime truth。

## 直接协作模块

- `OpenCodeService`：会话 CRUD、发送、stream、同步、question、todo、status、context usage
- `ConversationLoadRecoveryCoordinator`：create/load/bootstrap/delete-recovery/fork/rewind 的入口收束与现有 owner 组合
- `ConversationTabLifecycleRecoveryCoordinator`：tab close / conversation delete / delete-all reset 后的 tab recovery create-or-activate 决策
- `ConversationViewStateService`：tab 激活和 conversation hydration 装载编排
- `ConversationRenderService`：消息区 full rerender、tail patch 和 append-only sync 编排
- `ConversationLoadRuntimeBridge`：loaded-conversation 的 resolve / reload retry、server-sync 判定与 revert-state 写回
- `TabConversationStateBridge`：active-tab conversation/session 写回、pending question reset 与 sync baseline 提交
- `TabConversationActivationBridge`：当前活动 tab 的 empty-state activation / current-tab 新建会话打开路径 shell orchestration 与后续 UI refresh 编排
- `TabViewActivationBridge`：tab/pane activation 预刷新写回与 streaming / empty-tab activation outcome UI 刷新
- `TabActivationRuntimeViewHostFactory`：tab activation bridge 全套实例化已通过 `createTabActivationRuntimeAssembly(deps)` 工厂集中到该模块；`OpenCodianView` 不再直接实例化 `TabConversationStateBridge`、`TabViewActivationBridge`、`TabConversationActivationBridge` 或 `TabRuntimeStateBridge`，改为从 assembly 结果中取出 bridge 实例
- `ActiveTabContextUsageCoordinator`：activation/open 与相邻 sync 路径的 active-tab context usage identity / snapshot writeback，以及 per-tab stream lifecycle（begin/complete/apply-chunk）、indicator 刷新和详情弹窗打开；context usage detail modal 的 rawMessageLoader 现通过 `loadBackendSessionMessages()` 路由到 backend-aware session history service
- `ConversationTransitionBridge`：loaded-conversation 的 preflight cleanup、消息区 shell 与 hydration lifecycle bridge
- `ConversationHydrationOutcomeBridge`：loaded-conversation 消息装载后的 background-task rebuild、message rerender、post-render outcome 与 baseline commit
- `ConversationHydrationRenderBridge`：loaded-conversation hydration 的消息容器 scroll/class shell 与 pane metrics 回写
- `ConversationHydrationRuntimeViewHostFactory`：通过 `assembleConversationHydrationRuntime` 拥有完整的 hydration bridge assembly 生命周期，view 不再直接调用底层 bridge 构造函数
- `ConversationLoadRecoveryCoordinator`：通过 `assembleConversationLoadRecovery(deps)` 把 `ConversationViewStateService`、`ConversationTabOpenCoordinator`、`ConversationTabLifecycleRecoveryCoordinator` 与 `ConversationLoadRecoveryCoordinator` 的组装收束到该模块；`OpenCodianView` 的 `createConversationRuntimeWiring` 不再直接实例化这四个服务
- `ConversationTabRuntimeCoordinator`：通过 `assembleConversationTabRuntime(deps)` 作为 `createConversationTabRuntimeCoordinator` 的同义导出，供 view 调用；`OpenCodianView` 的 `createConversationRuntimeWiring` 不再直接调用 `createConversationTabRuntimeCoordinator`
- `createBackgroundTaskInfrastructure`：从 `createConversationRuntimeWiring` 中提取的背景任务基础设施（indicator、render port、stream trigger、view host）装配私有方法，减少 `createConversationRuntimeWiring` 的行数并保持背景任务创建逻辑内聚
- `SendPipelineRuntime`：发送子系统总入口，负责真实 stream 调用、runtime 内部模块装配，以及向 `MessageFinalizationService` 交接
- `StreamChunkRouter`：发送子系统内部的 stream loop / pending / timeout / chunk router
- `StreamLocalFinalizer`：发送子系统内部的本地 shell finalization 与第一次本地保存
- `AssistantShellViewHostAdapter` / `AssistantShellRenderer` / `AssistantNoticeRenderer` / `AssistantErrorRenderer` / `AssistantPlainTextFallbackRenderer` / `AssistantStructuredContentRenderer` / `StreamingInlineCardRenderer` / `PermissionInlineCardRenderer` / `SendPipelineTrace` / `PendingIndicatorController` / `buildLocalStreamOutcome` / `StreamShellFinalizer` / `LocalStreamMessagePersistence`：发送子系统更细粒度的内部协作模块
- `MessageSendPreparationService`：`sendMessage()` 前半段的 send preflight、optimistic user message 落地，以及 stream-enter 状态编排
- `MessageFinalizationService`：`sendMessage()` 末段的 final sync、post-sync patch/rerender、todo/save/attention 收尾编排，以及 server-start / server-unavailable 助手错误终结流（`finalizeAssistantMessageWithServerError`、`finalizeAssistantMessageWithServerUnavailableError`）；所有错误分类逻辑（`getFriendlyServerStartErrorMessage`、`getUnavailableServerMessage`）由该服务内部持有；`OpenCodianView` 不再直接调用 `finalizeAssistantMessageWithError`；host 组装通过 `createMessageFinalizationHost(deps)` 工厂完成，`OpenCodianView` 不再拥有 `createMessageFinalizationHost` 私有方法；deps 接口使用原始 owner 子对象（`conversationIdentityRuntime`、`conversationRenderService`、`backgroundTaskHost` 等），不再逐字段包装 lambda；`promptSuggestionSessionResync` dep 为 scoped prompt-suggestion session resync 提供 tab-level channel 隔离的发射路径
- `TabManager` / `TabBar`：tab 生命周期和 tab 元数据
- `MarkdownRenderService`：Markdown 渲染
- `StreamController`：流式 assistant DOM 更新
- `ComposerContextViewFacade`：composer context / retained-selection 相关 bundle 的总装配入口，以及 view-facing 收束层
- `ComposerContextActionService`：current-note / selection 入口动作与活动编辑器回退
- `ComposerContextPickerActionService`：文件选择器打开/关闭、catalog 编排，以及 file context draft 写回
- `ComposerContextEventBridge`：composer/context 相关的 workspace / vault / DOM 事件桥接，以及 retained-selection polling lifecycle
- `ComposerContextViewHostAdapter`：active-tab `draftContextItems` / `focusContextPreview` 的共享 host adapter，以及 composer services 的 state seam
- `ComposerContextCoordinator`：composer context chip 渲染、preview attach/detach click 编排，以及 stale preview refresh handoff
- `ContextAttachmentBuilder`：composer current-note / selection / file 附件构建，以及 remote 文本快照校验
- `ContextFileCatalogService`：composer 文件上下文选择器使用的 Vault catalog 构建、缓存与增量更新
- `FocusContextRuntimeService`：活动编辑器 focus preview、MarkdownView 回退查找，以及 retained-selection runtime coordinator 的入口转发
- `ContextUsageService`：context usage state 维护
- `TitleGenerationService`：官方 OpenCode 标题优先、本地 AI 标题兜底的首条消息标题生成
- `composerContext`、`renderGroups`、`collapsible`、`forkMessages`
- `ui/modelSelector/*`：模型选择器列表渲染、交互和 trigger display state
- `ContextRing`、`QuestionDock`、`SessionTodoDock`、`NavigationSidebar`、`EffortSelector`

## 主要设置依赖

源码里直接读取的高频设置包括：

- `maxTabs`
- `enableTabs`
- `tabBarPosition`
- `belowHeaderTabBarLayout`
- `chatScrollMode`
- `chatAppearance`
- `theme.activePresetId`
- `inputPanelGlassRefraction`
- `inputPanelGlassRefractionSvgFilter`
- `defaultProvider` / `defaultModel`
- `modelSourceMode`
- `providerIconLibrary`
- `effortLevel`
- `thinkingBudget`
- `permissionMode`
- `questionDisplayMode`
- `questionCardPosition`
- `showAnsweredQuestionCards`
- `titleMode`
- `aiTitleModel`
- `locale`
- `renderUserMarkupAsCodeBlocks`
- `server.mode`
- `tabState`

`enableTabs` 通过 `ConversationTabRuntimeCoordinator` 注入 `TabManager.areTabsEnabled()`。视图仍保留内部 active tab 和 `tabState`，相邻 coordinator 通过 tab manager 判断是否隐藏/绕开 new-tab 入口，因此禁用标签不会清理会话、历史、标题、后台任务或 child-session conversation。

## 注意事项

### 优先扩展的相邻模块

新运行时行为不应直接加入 `OpenCodianView`。根据功能类型，优先扩展以下 owner：

| 功能类型 | 优先扩展 |
|----------|----------|
| Tab 生命周期 / pane / scroll | `ConversationTabRuntimeCoordinator` / `TabMessagesPaneCoordinator` |
| Question dock / 答复编排 | `QuestionDockCoordinator` |
| Background task timeline / indicator | `BackgroundTaskTimelineService` / `BackgroundTaskNoticeStateService` |
| Conversation 加载 / 恢复 | `ConversationLoadRecoveryCoordinator` / `ConversationViewStateService` |
| Authoritative server sync | `ConversationAuthoritativeSyncCoordinator` / `ConversationAuthoritativeReloadCoordinator` |
| Send pipeline / 用户消息准备 | `SendPipelineRuntime` / `MessageSendPreparationService` |
| 流式 assistant 本地持久化 | `LocalStreamMessagePersistence` |
| Child session graph | `ChildSessionGraphCoordinator` |
| Header 状态 / 控件 | `ChatHeaderPresenter` |
| Selection controls / model selector | `ChatSelectionControlsCoordinator` |
| Composer input shell | `ComposerInputShellCoordinator` |
| Slash command catalog 缓存 | `SlashCommandMenuCatalogCache` |
| Notice 持久化 | `PersistentAssistantNoticeService` |
| Conversation notice 编排 | `ConversationNoticeCoordinator` |
| Trailing assistant patch | `trailingAssistantPatchPlanning` / `trailingAssistantPatchExecution` |

### 不可移除的关键行为

1. **Per-tab streaming 隔离**：streaming、conversation sync、background task 和 question 队列都已经做成按 tab 隔离，不能再退回单全局状态。每个 tab 有独立的 streaming controller、DOM pane、todo/status/background-task 状态、context 草稿和 question 草稿。
2. **会话同步只保留 client-only decoration**：只保留明确的 client-only decoration（interrupted assistant placeholder、本地 notice、question resolution recap）；assistant 正文、tool、structured payload 和 canonical message/part 内容不能从这些 decoration 反向推导。
3. **`session.status` 只代表 foreground runner**：`session.status` 只能代表主 runner 是否 `busy/retry/idle`；后台任务是否完成要看后续消息/提醒是否真正回写到会话历史。
4. **三态滚动恢复**：重新渲染消息列表时，滚动恢复不再只按旧 `scrollTop`，而是按“到底 / 保持距底距离 / 保持可见 anchor”三态恢复，避免 hydration 后补写 inline/notice 时把视图重新顶上去。
5. **Streaming + background task 优先级**：当 tab 同时处于前台流式和后台任务存活状态时，tab 样式遵循“streaming 主态、background 次级标记”的优先级；不要把二者重新合并成同一套阻塞语义。
6. **Shell composer 提交仍被显式忽略**：如果未来启用 shell，必须经由 `OpenCodeService.runSessionShell()` / `session.shell`，再投影回 canonical session graph，不能新增本地 shell 真相路径。

### 其他注意事项

- 这个文件的大部分便捷 getter/setter 都默认指向“活动 tab”；改逻辑时必须先确认是不是应该改成显式 `tabId`。

## 2026-04-23 Compaction config alignment

Compaction config is now project-scoped (`.opencode/opencode.json`). Ownership facts:
1. Compaction config source of truth is `.opencode/opencode.json`, not plugin settings or conversation session settings.
2. `ConversationSessionSettingsCoordinator` host seam no longer includes `applyCompactionConfig()` or `reapplyCompactionConfigFromProjectConfig()`; compaction is edited via `SettingsConversationSection` through `OpencodeConfigManager`.
3. Manual `session.summarize()` remains a per-session action available through `OpenCodeService` session control.

### SDK capability gating

Chat 现在在渲染 session 相关操作前检查 `requireSdkCapability(id)`。新增 `isSessionCapabilityAvailable(capabilityId)` helper：对 OpenCode backend 检查能力，对非 OpenCode backend 或 transient 失败默认返回 true。child session graph fetch 会先检查 `v2.session.get`，unsupported 时返回空数组而非抛异常。

### Experimental OpenCode actions

会话设置入口只在 OpenCode conversation 且至少一个实验 capability 同时满足用户 gate 与生产 availability 时显示。view 只装配 `OpenCodeExperimentalActionModal`，不直接使用 SDK。background 完成只在最新用户 turn 下追加 inline status；它不得写入 `isStreaming`、foreground `sessionStatus` 或现有 background-task 生命周期。

### OpenCode diagnostics chrome

诊断按钮只在当前 conversation backend 为 OpenCode 时显示，并从 tab-scoped trace state 映射 off/normal/armed/capturing/warning/critical/degraded；store 为 memory mode 或仍带 custom-directory fallback `lastError` 时均显示 degraded。捕获、取消和复制都使用当前 `tabId`；发送 runtime 在 claim 与 terminal 时回传显式 changed `tabId`，view 仅在它仍等于 active tab 时调用 `refreshBackendChrome()`，因此后台/并发标签不会误改当前 header。复制使用 current-session report，当前会话没有 trace 时输出空报告而非回退全局其他 trace。复制可附 actual/expected/reproduction，并在完成后刷新 unread badge。关闭标签通过 lifecycle coordinator 取消该标签尚未消费的 capture。

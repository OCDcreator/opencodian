# OpenCodianView

> **源码**: `src/features/chat/OpenCodianView.ts`
> **状态**: [REVIEW]

## 概述

`OpenCodianView` 是聊天功能的主集成点。它继承 `ItemView`，负责把下列能力装配到同一个 Obsidian 视图里：

- 对话加载、发送、流式渲染和后台同步
- 多标签页和按 tab 隔离的运行时状态
- 模型、权限、effort、context usage 等工具栏控件
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
| `onOpen()` | 组装 UI、注册事件、初始化第一个 tab |
| `onClose()` | 清理订阅、轮询、观察器、dropdown、demo 和 tab 运行时 |
| `applyTabBarLayout()` | 根据设置把 tab bar 挂到 header / below-header / input / 外部竖排槽位 |
| `applyChatAppearanceSettings()` | 应用主题 preset、聊天外观变量、自定义 CSS、输入面板 glass 状态 |
| `refreshCurrentConversationRendering()` | 重新渲染当前对话 |
| `applyChatScrollMode()` | 把当前滚动模式应用到消息容器 |
| `applyLocaleTexts()` | 委托 header presenter、selection controls coordinator 与 composer input coordinator 刷新 header/status、selector、placeholder、dock 和 tab 文案 |
| `refreshQuestionUi()` | 重绘 question dock，并在需要时重绘当前对话 |
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

这些状态现在通过 `services/ConversationTabRuntimeCoordinator.ts` 统一进入 tab runtime owner；该 coordinator 组合 `TabMessagesPaneCoordinator`、first-open restore、close/recovery 与 stream-like writeback 端口，负责 tab manager / tab bar / persisted-state / active pane 等生命周期。`OpenCodianView` 仍定义 `TabRuntimeState` 的 shape，并把 runtime factory / navigation/sidebar writeback / scroll policy 作为 host seam 提供给 pane coordinator。每个 tab 都有自己的：

- streaming 控制器
- DOM pane
- todo / status / background task 状态
- context 草稿和 question 草稿

这就是多标签并发不共享一个全局 streaming 状态的实现基础。

其中 question 相关的 `pendingQuestionRequests`、draft answers、active group/index 与 waiter map 现在虽然仍存放在 `TabRuntimeState`，但读写和 refresh/render 编排已经统一收束到 `services/QuestionDockCoordinator.ts`，不再由 `OpenCodianView` 直接维护这整条链路。

background task 相关的 `backgroundTaskLaunches`、`backgroundTaskCompletedTasks`、active anchor / waiting-for-follow-up 等字段同样仍存放在 `TabRuntimeState`，但它们的 timeline 推导、conversation→runtime 重建、indicator reset runtime 清理，以及 inline copy 组装现在已经集中到 `services/BackgroundTaskTimelineService.ts`。

background task completion notice 的 queued-state 则已经完全移出 `TabRuntimeState`，改由 `services/BackgroundTaskCompletionNoticeService.ts` 按 tab runtime 内部维护；view 这里只再保留 streaming / timeline 所需的运行态字段。

### 视图级状态

除此之外，类里还维护若干跨 tab 的视图级状态：

- `currentConversation` / `currentConversationRevertState`
- `services/ChatHeaderPresenter.ts` 的 host seam：server availability、settings/history/new-tab callbacks、status refresh 和 header tab-slot 写回
- `services/ConversationHistoryActionsCoordinator.ts` 的 host seam：conversation list/current selection、rename title writeback、delete recovery/reset 与 notice 回调
- `services/ConversationAuthoritativeSyncCoordinator.ts` 的 host seam：authoritative server sync、latest-user hydration、client-only message preservation、fingerprint/logging 与 hydrated writeback
- `services/ChatSelectionControlsCoordinator.ts` 的 host seam：model catalog data source、tab model override/default selection、model-source/server availability 查询、provider icon lookup、permission mode writeback 和 effort selector 联动
- `services/ComposerInputShellCoordinator.ts` 的 host seam：input shell DOM 装配、submit gate、textarea 高度同步、composer stack height 与 toolbar slot mount
- `services/InputPanelAppearanceCoordinator.ts` 的 host seam：input panel theme class、action button style、SVG filter layer、liquid-glass mount/unmount 与 diagnostics log 去重
- 由 `ComposerContextViewFacade.create()` 基于独立的 `createComposerContextViewHost()` / `createFocusContextViewHost()` seam 装配出的 `ComposerContextEventBridge`、`ComposerContextCoordinator`、`FocusContextRuntimeService`、`PersistentAssistantNoticeService` 等视图级运行时协作对象
- theme background 与 experimental demo / glass octahedron 相关 DOM 引用

## 主链路

### 打开与关闭

`onOpen()` 的顺序是固定的：

1. `buildUI()`
2. `initializeTabSystem()`，实际 tab manager / tab bar / layout 初始化由 `ConversationTabRuntimeCoordinator` 执行
3. `chatHeaderPresenter.startServerStatusLoop()`
4. 在 `messagesShellEl` 上创建 `MarkdownRenderService`
5. `wireEventHandlers()`，其中 composer/context 相关的 workspace / vault / DOM 事件注册与 retained-selection polling 启动都会转交给 `ComposerContextEventBridge`
6. 通过 `ConversationSessionSignalRuntime` 统一订阅 session sync event 与 todo/status live signal 更新
7. `initializeFirstTab()`

`onClose()` 则会反向清理：

- tab 持久化与 tab runtime system cleanup
- header presenter、conversation history/actions coordinator、input appearance coordinator、composer input coordinator / conversation sync / selection polling / layout / scroll 定时器
- title generation
- effort selector、context ring、question dock、todo dock、navigation sidebar
- liquid glass adapter cleanup、diamond demo
- tab panes、tab bar、dropdown、markdown component 等

### 滚动辅助抽离

消息区的 pane lifecycle 与 pane 级 scroll metrics 现在先由 `services/TabMessagesPaneCoordinator.ts` 承接，再由 `services/ConversationTabRuntimeCoordinator.ts` 对外提供 active pane / tab runtime facade；底部检测、scroll snapshot、重渲后恢复仍由 `services/ScrollManager.ts` 提供纯 helper；`OpenCodianView` 只保留：

- `TabMessagesPaneCoordinator` 的 host wiring
- `ConversationTabRuntimeCoordinator` 的 tab manager / tab bar / persistence host wiring
- 是否应 auto-scroll 的业务判断
- restore 后的高层 render / hydration / bridge 调度

这次没有改变原有 bottom / preserve-anchor / preserve-distance 三种恢复语义，只是把算法从 view 内联实现挪到了可单测模块。

### Header/status shell 抽离

header DOM、server status badge、title logo/wordmark、new/current-tab、history 与 settings 按钮现在由 `services/ChatHeaderPresenter.ts` 承接。`OpenCodianView` 只保留 presenter host seam：

- server availability 查询与 settings server mode 读取
- settings / server section / history / new-tab callbacks
- tooltip 标签、plugin asset URL、css-change 注册和 layout/color sync 回调
- header tab bar slot 写回给 tab bar layout

server status loop、badge class、status label、本地/远端文案判定和 locale refresh 都在 presenter 内部完成；view 不再直接持有 header button refs 或 status interval 状态。

### Conversation history / actions ownership

header 上 history 按钮触发的 conversation history dropdown、rename dialog、delete confirm countdown、dropdown 定位，以及 click-outside / destroy cleanup 现在由 `services/ConversationHistoryActionsCoordinator.ts` 承接。`OpenCodianView` 只保留 coordinator host seam：

- conversation list、current conversation 与 foreground-busy 状态读取
- `loadConversation()`、`updateConversationTitleState()` 与 `ConversationTabLifecycleRecoveryCoordinator` delete/reset 入口
- title generation cancel 与 notice 回调

因此 view 不再直接持有 history dropdown DOM/state、rename/delete confirm overlay 或 dropdown positioning RAF；delete fallback、rename title sync 到 session，以及 tab cleanup/reset 语义保持不变。

### Composer input shell 抽离

输入区的 tab slot、composer shell、textarea、自适应高度、send/stop affordance 与 composer stack height 现在由 `services/ComposerInputShellCoordinator.ts` 承接。`OpenCodianView` 只保留 coordinator host seam：

- question/todo dock attach、context row writeback，以及 add-context / send message / foreground-busy notice 的回调
- selection controls、context usage ring 与 effort selector 的既有 mount 入口
- chat container 上 `--opencodian-composer-stack-height` 的写回，以及 settled scroll 调度
- 供后续 glass/theme 逻辑读取的 composer shell / input wrapper DOM refs

这样 view 不再直接维护 textarea Enter-submit、高度同步、`ResizeObserver` / RAF layout 节流或 send/stop button tooltip 状态；toolbar 里的 selector 区域也已经进一步交给专门 owner，input shell 只保留 slot 级挂载职责。

### Model / permission selector ownership

聊天工具栏里的 model selector 与 permission selector 现在由 `services/ChatSelectionControlsCoordinator.ts` 承接。`OpenCodianView` 只保留 selection host seam：

- model catalog data source，以及 tab override/default model 读写
- model-source mode / server availability 查询、provider icon URL lookup、permission mode settings writeback
- effort selector display 刷新，以及共用的 Escape scope 注册

因此 view 不再直接铺开 requested/current/resolved model selection、model catalog cache、switch-model notice / unavailable follow-up，或 model dropdown search/list/sticky-header cleanup、provider icon trigger 刷新、permission dropdown selected-state / open-close 状态机；这些 model-selection 与 selector UI lifecycle 已集中到 coordinator，而 send options、`ModelCatalogStateService` 语义与 provider icon fallback 顺序保持不变。

### Input appearance / glass ownership

输入面板的 theme class、action button style、SVG filter layer、liquid-glass adapter mount/unmount 与 diagnostics log 现在由 `services/InputPanelAppearanceCoordinator.ts` 承接。`OpenCodianView` 只保留该 coordinator 的 host seam：

- composer shell / input wrapper / chat container / messages shell 的 DOM 读取入口
- plugin settings 里的 input panel theme、action button style、SVG filter 与 liquid-glass adapter settings
- plugin asset URL 解析，以及现有的 log preview / payload stringify helper
- experimental diamond / octahedron demo 的显式 toggle 入口

这样 view 不再直接维护 filter-layer DOM ref、active liquid-glass adapter、diagnostics fingerprint 或 refraction helper；但 theme preset、settings normalization、CSS token 语义与 experimental demo 的 opt-in 边界保持不变。

### 对话装载与后台同步

`initializeFirstTab()` / `restorePersistedTabs()` / `createNewConversation()` / `loadConversation()` / fork / rewind 这些 conversation lifecycle 入口现在先经由 `services/ConversationLoadRecoveryCoordinator.ts`，再分别转交给 `ConversationRestoreBootstrapCoordinator`、`ConversationTabOpenCoordinator`、`ConversationTabLifecycleRecoveryCoordinator` 与 `ConversationViewStateService`；消息区 full rerender / tail patch / append-only 增量更新则继续交给 `services/ConversationRenderService.ts`。其中 loaded-conversation 的 resolve / reload retry / server-sync 判定先经由 `runtime/ConversationLoadRuntimeBridge.ts` 落回 view host，tab/pane activation 预刷新会先经由 `runtime/TabViewActivationBridge.ts` 落回 view host，active-tab conversation/session 写回则先经由 `runtime/TabConversationActivationBridge.ts` 收束 activation 入口，再复用 `runtime/TabConversationStateBridge.ts` 落回 view host，loaded-conversation 的 preflight cleanup / hydration shell 则先经由 `runtime/ConversationTransitionBridge.ts` 收束，再由 `runtime/ConversationHydrationRenderBridge.ts` 处理 scroll/class restore，而消息装载完成后的 background-task rebuild / message rerender / post-render outcome / baseline 则继续经由 `runtime/ConversationHydrationOutcomeBridge.ts` 收束。主链路仍然保持原来的语义：

- 在切换对话时取消旧对话的标题生成
- 清空当前消息区并重置 turn 状态
- 把 `openCodeSessionId` 交给 `openCodeService`
- 在必要时调用 `syncConversationMessagesFromServer()`
- 装载阶段进入 hydration：先重建历史 turn / inline background task，再等待后续 authoritative message sync 决定是否允许 stale 降级
- 重新渲染消息、背景任务指示器、todo dock、question dock
- 通过 `ConversationSyncHostAdapter` 组装 `ConversationSyncRuntimeCoordinator` / `ConversationSyncOrchestrationService` / `ConversationSyncBridge`，并通过 `ConversationSessionSignalRuntime` 接入 session sync event + todo/status live signal 的订阅、session→tab 匹配与 cleanup 生命周期
- 更新模型显示和 context usage

后台同步分两路：

- `syncVisibleConversationInBackground()`：同步当前活动 tab
- `syncBackgroundTaskTabsInBackground()`：同步非活动但仍有 background task 的 tab

`OpenCodianView` 现在只提供一份 `ConversationSyncViewHost`；真正把这份 view-state / render bridge 适配成 runtime/orchestration/bridge 三组 host 的层，是 `ConversationSyncHostAdapter`。这样 sync service bundle 的 wiring 不再散落在 view 构造函数里。

session sync event 与 session todo/status 的 live signal 入口都不再由 view 自己持有 `subscribeToSessionSyncEvents()` / `subscribeToSessionTodoUpdates()` / `subscribeToSessionStatusUpdates()` 及其 dispose 状态：`ConversationSessionSignalRuntime` 会统一接管三条 listener 的生命周期、session→tab 匹配与 active-tab fallback，再把 signal sync 调度交回 `ConversationSyncOrchestrationService`，把命中的 todo/status update 交回 `SessionTodoCoordinator`，并在每次 live update 后继续调用 `BackgroundTaskLiveSignalCoordinator`。

signal sync 与后台轮询里的 loop lifecycle、signal debounce、tab / conversation 选择、conversation 加载和 dispatch 编排现在先交给 `ConversationSyncOrchestrationService`。它会判断 signal 是否应回到当前可见会话，或转向 hidden tab sync；会把同一 tab 上短时间内连续到达的 signal reason 合并；轮询时也只会在确实存在 visible/background sync 目标时持有 interval，并只枚举非活动、仍有 background task、且 runtime 当前允许同步的 tab。

真正把 visible/signal/background 三条 sync 回调装配到一起的层现在是 `ConversationSyncBridge`：它会把 orchestration 的 dispatch 回调统一接到 server sync、fingerprint commit 和 post-sync coordinator，再把真正依赖当前 DOM/render host 的 `applySyncedConversationUpdate()` / `renderBackgroundTaskIndicatorIfNeeded()` 留在 view。hidden-tab 与 active-tab 同步入口仍通过 `ConversationSyncRuntimeCoordinator` 统一处理 tab runtime guard、`isConversationSyncInFlight` 生命周期，以及 per-tab fingerprint baseline 判定。

与此同时，server message 拉取→hydrate→authoritative merge、latest optimistic user bubble hydration、client-only/interrupted message preservation，以及 sync debug payload / fingerprint 组装现在统一收束到 `services/ConversationAuthoritativeSyncCoordinator.ts`。`OpenCodianView` 只再保留 host seam：OpenCode message/revert 查询、runtime fingerprint/anchor 写回、context usage refresh、background-task authoritative-sync 标记，以及 hydrated single-message rerender。

其中当前活动 tab 的后台同步收尾会把 active-conversation match 判定，以及 `currentConversationRevertState` / active-tab sync fingerprint 的 state commit 委托给 `VisibleConversationPostSyncCoordinator`；而 post-sync 里的 question refresh + todo/status live refresh，再加上 background-task rebuild / completion notice / stream-like follow-up，则进一步收束到 `QuestionTodoBackgroundTaskRefreshHostAdapter` 装配的 `QuestionTodoStatusRefreshCoordinator` + `PostSyncQuestionTodoRefreshFacade` 这条共享链路；activation/open 侧剩余的 question dock + todo dock + supplemental refresh 则单独收束到 `QuestionTodoActivationRefreshCoordinator`，相邻的 background-task indicator reset / runtime rebuild / render trigger 则继续下沉到 `BackgroundTaskActivationIndicatorCoordinator`。这两条入口现在直接共享 `OpenCodianView` 提供的一份 current-conversation/runtime/background-task view host，因此 activation/post-sync 不再分别维护两段几乎平行的 host factory，也不再绕经额外的 shared-host pass-through layer。`ConversationSyncBridge` 负责把这些 post-sync outcome 路由回 view，`OpenCodianView` 只保留 `applySyncedConversationUpdate()` / `renderBackgroundTaskIndicatorIfNeeded()` 这类 render host 入口，background-task indicator 的 render/queue/flush 顺序则由 `BackgroundTaskIndicatorCoordinator` 承接，而 foreground live-signal reconcile 与 stream-like UI 写回也已直接收束到 coordinator 对 `BackgroundTaskLiveSignalCoordinator` / `TabRuntimeStateBridge` 的组合。

background task 的 conversation-derived timeline rebuild 现在也不再由 view 自己内联实现：`syncBackgroundTaskStateFromConversation()`、indicator reset 时的 runtime 清空、completion-segment 收集，以及 inline notice copy 组装都转交给 `BackgroundTaskTimelineService`；inline panel 的 DOM 创建、挂载、复用与清理则转交给 `BackgroundTaskInlinePanelRenderer`；indicator render、completion notice queue/flush、foreground live-signal reconcile 与 stream-like sync 顺序则由 `BackgroundTaskIndicatorCoordinator` 直接组合 `BackgroundTaskLiveSignalCoordinator` 和 `TabRuntimeStateBridge` 承接。另一方面，`BackgroundTaskLiveSignalCoordinator` 自身也会直接组合 `SessionTodoCoordinator`、`BackgroundTaskTimelineService` 和 `BackgroundTaskNoticeStateService` 来处理 stale follow-up，主动的 todo/status 拉取刷新、request-id stale guard，以及 stream/live-signal/tab-reset 三条运行时入口也都收束到同一个 `SessionTodoCoordinator`；这组 session todo host/wiring 则由 `SessionTodoHostAdapter` 统一装配。activation/open 和 post-sync 场景里 status + pending-question + todo 的组合刷新顺序仍由 `QuestionTodoStatusRefreshCoordinator` 统一承接，但 activation/open 侧残留的 dock writeback + supplemental refresh 现在先下沉到 `QuestionTodoActivationRefreshCoordinator`，background sync 下剩余的 rebuild / completion / stream-like follow-up 则进一步下沉到 `PostSyncQuestionTodoRefreshFacade`；post-sync 三段链路的剩余 host wiring 现在再由 `QuestionTodoBackgroundTaskRefreshHostAdapter` 统一装配，因此 view 不再直接维护完整 `QuestionTodoBackgroundTaskRefreshViewHost` 闭包，只保留 tab runtime、current-conversation writeback、单一 session todo host 与其它 bridge 装配。

tab conversation/session activation 写回现在也不再由 view 自己在 load / streaming activation / current-tab open / fork 等路径里逐项改 `currentConversation`、tab conversation 与 session reset：这些 active-tab state writeback 统一交给 `runtime/TabConversationStateBridge.ts`，view 只保留 activation/render orchestration。

tab 激活入口里剩余的 pane-activation UI preflight（`setActiveMessagesPane()`、focus preview、question dock、todo dock）现在也不再由 `OpenCodianView` 自己直接维护 pane DOM map；`services/ConversationTabRuntimeCoordinator.ts` 负责 tab switch / close / first-open / persisted restore / tab bar layout / stream-like state facade，`services/TabMessagesPaneCoordinator.ts` 已承接 messages pane 的 create / activate / remove / clear / scroll metrics lifecycle，`runtime/TabViewActivationBridge.ts` 只再通过 view host 触发 active-pane 切换与相邻 UI preflight。与此同时，activation/open 侧的 question dock + todo dock writeback 与 supplemental refresh 又进一步收束到 `services/QuestionTodoActivationRefreshCoordinator.ts`，相邻的 loaded/open-side background-task indicator writeback 则进一步收束到 `services/BackgroundTaskActivationIndicatorCoordinator.ts`，而 selector/model 相邻的 active-tab context usage identity / snapshot writeback 则进一步收束到 `services/ActiveTabContextUsageCoordinator.ts`，这样 bridge 只保留 pane、selector、send-button 与 hydration-tail 编排。loaded-conversation 的消息装载后壳层现在先由 `runtime/ConversationHydrationOutcomeBridge.ts` 统一串起 background-task rebuild、message rerender 与 post-render outcome，再复用 `TabViewActivationBridge`；status / pending question / session todo lazy refresh 仍由 `QuestionTodoStatusRefreshCoordinator` 共享给 activation/open 与 post-sync 入口，view 只保留 state writeback 与 host 装配。与此同时，streaming fast-path activation、empty-tab activation 本体与 current-tab new conversation open 的消息区清空 / turn reset 壳层，也进一步统一下沉到 `runtime/TabConversationActivationBridge.ts`。这两个 activation bridge 所需的 late-bound host shape 现在再由 `runtime/TabActivationBridgeHostFactory.ts` 从同一份 activation writeback seam 派生，因此 `OpenCodianView` 不再分别维护两段平行的 activation host factory。

streaming tab 激活时那条 active-conversation/session 写回 + baseline + selector/context/send-button outcome，loaded-conversation hydration 前的 activation state writeback，current-tab 新建会话后的 open shell，以及 empty-tab 激活时相邻的 active-pane reset shell，现在也不再由 view 自己分散内联；这些步骤已统一交给 `runtime/TabConversationActivationBridge.ts`，并继续复用 `TabConversationStateBridge`、`TabViewActivationBridge`、`QuestionTodoActivationRefreshCoordinator`、`BackgroundTaskActivationIndicatorCoordinator` 与 `ActiveTabContextUsageCoordinator`。不同的是，current-tab / new-tab 新建入口本身的“该不该创建、该显示什么 notice、该走 activate 还是 open”的分支，已经进一步前移到 `ConversationTabOpenCoordinator`；因此 `TabConversationActivationBridge` 只保留 shell/outcome 编排，不再兼管按钮入口的阻塞或提示决策。

首次打开聊天视图时那段 `loadConversations()`、persisted tab restore、restore 失败后的 tab state reset/flush，以及“复用首个已有 conversation / 不存在时创建新 conversation”的 fallback；header 上“新建会话”与“在当前 tab 新建会话”两条入口里的 max-tabs / streaming-block / notice 分支；以及 delete conversation / delete-all 后的 recovery/reset 路径，现在都先由 `services/ConversationLoadRecoveryCoordinator.ts` 统一收口。它再分别复用 `ConversationRestoreBootstrapCoordinator.ts`、`ConversationTabOpenCoordinator.ts`、`ConversationTabLifecycleRecoveryCoordinator.ts` 与 `ConversationViewStateService.ts`，因此 view 不再直接持有多条平行的 create/load/recovery 主链路。close-last-tab 的静默 fallback tab、delete/delete-all 复用 noticed new-tab 路径、persisted restore 失败后的 state reset/flush 与现有 activate/hydration 语义都保持不变。

loaded-conversation 切换里旧标题生成取消、background-task indicator reset、scheduled scroll cleanup、消息区清空、turn state reset，以及 hydration lifecycle shell，也不再由 `ConversationViewStateService` 直接通过散落 host 回调持有；这些壳层步骤现在先由 `runtime/ConversationTransitionBridge.ts` 统一桥接。随后消息容器的 `is-rehydrating` class、scroll snapshot、restore-bottom / restore-anchor / restore-distance 调度，以及 pane scroll metrics 回写，再由 `runtime/ConversationHydrationRenderBridge.ts` 承接，view 只保留 title/background indicator/message container/runtime 的真实实现。

loaded-conversation activate 前的 conversation lookup、reload retry、interrupted-tail 驱动的 server-sync 判定，以及 `load-conversation` sync 返回的 revert-state 写回，也不再由 `ConversationViewStateService` 直接通过散落的 host 回调组合；这些数据解析入口现在先由 `runtime/ConversationLoadRuntimeBridge.ts` 统一桥接，view 只保留真实的 conversation 查询、sync 与 revert-state 落点实现。

loaded-conversation 在消息拿到之后那段 `syncBackgroundTaskStateFromConversation()`、`renderMessages()`、post-render indicator/dock/status-question-todo outcome，以及 sync baseline commit，也不再由 `ConversationViewStateService` 直接握着多段 host 回调串起来；这些 outcome 现在先由 `runtime/ConversationHydrationOutcomeBridge.ts` 统一组合，再分别复用 `TabViewActivationBridge` 与 `TabConversationStateBridge`。

tab stream-like badge、background-task badge、rewind/fork 按钮禁用态，以及 attention 标记写回现在也不再由 view 自己散落地直接操作 `TabManager` 或消息区 DOM：这些 runtime→UI 写回统一交给 `runtime/TabRuntimeStateBridge.ts`，view 只保留 wrapper 方法与 host bridge。

除此之外，`ConversationSessionSignalRuntime` 现在会接入 `message.updated`、`message.part.updated` 和 `session.diff`，先按 session 匹配 tab，再交给 `ConversationSyncOrchestrationService` 做 debounce/dispatch，用于提前触发当前会话或后台 tab 的 authoritative sync，而不是只能等 2 秒轮询。

### question dock / pending question 编排

question dock 与 pending-question refresh 的主要 runtime/UI ownership 现在由 `QuestionDockCoordinator` 承担：

- `OpenCodianView` 只保留更窄的 `QuestionRuntimeViewHostAdapterHost`：提供 active tab / current session / runtime state、resolution-card gate，以及 sync follow-up host
- `OpenCodianView` 只保留更窄的 `QuestionRuntimeViewHostAdapterHost`：提供 active tab / current session / runtime state 与 scroll pin；resolution-card gate、tab attention 写回与 sync follow-up 已改由 adapter 直接复用 settings、`TabRuntimeStateBridge` 与 `ConversationSyncBridge`
- `QuestionDockSlotCoordinator` 现在代持 `QuestionDock` slot / instance 生命周期、`questionCardPosition` 设置门控和显式 render trigger；view 只在输入区构建、locale refresh、tab activation 与 close 时调用它
- `QuestionRuntimeViewHostAdapter` 会把 dock slot port、question display settings、OpenCode question API、session-status refresh，以及已有 `TabRuntimeStateBridge` / `ConversationSyncBridge` stable port 组合成 `QuestionRuntimeHostAdapter` 消费的 `QuestionRuntimeViewHost`
- `QuestionRuntimeHostAdapter` 统一装配 `QuestionInlineCardRenderer`、`QuestionResolutionCoordinator`、`QuestionDockCoordinator` 与 `QuestionResolutionFlowCoordinator`，并把 pending-question refresh / clear 与 dock-or-inline resolve flow 一起收束回同一份 question runtime bundle
- `QuestionDockCoordinator` 统一持有 pending-question refresh、waiter 保活、draft answer sanitize、dock render callbacks，以及回答/拒绝后的 status refresh + visible sync follow-up
- `QuestionResolutionFlowCoordinator` 会先尝试把请求交给上方 dock；如果当前设置仍使用 inline question card，才退回 `QuestionInlineCardRenderer`

### 消息区重渲编排

消息区的 render orchestration 现在由 `ConversationRenderService` 统一决定：

- `rerenderConversationMessages()`：整段历史重渲、scroll snapshot/restore、hydration begin/end
- `applySyncedConversationUpdate()`：先判定是否可增量，再决定 append / tail patch / full rerender
- `patchTrailingAssistantRender()`：只在前缀 rendered message 完全稳定时 patch 最后一条 assistant
- `getIncrementalRenderedMessageUpdate()`：作为纯 helper 判断当前 sync 是否还能走 append-only 路径
- `createConversationAssistantTailRenderPort()`：把 assistant tail 的正文签名、正文重渲和 persisted footer finalization 先收束成更小 port，再挂回 `ConversationRenderHost`

收到服务端新消息后，`applySyncedConversationUpdate()` 会优先尝试：

- patch 最后一条 assistant render
- 仅追加新增 render message
- 对纯文本 assistant 消息使用 pseudo-stream reveal

否则回退到整段重渲。

assistant notice card 的 tone / icon、OMO system-reminder 标题与 raw block、notice action label 等 DOM 细节现在由 `runtime/AssistantNoticeCardRenderer.ts` 承接；persisted assistant shell / notice / footer / timestamp 组装则进一步统一交给 `runtime/AssistantShellViewHostAdapter.ts`；而 user message footer 的 copy / rewind / fork / timestamp 组装由 `runtime/UserMessageFooterRenderer.ts` 承接。`OpenCodianView` 只保留 Markdown 渲染、assistant 正文 block 渲染与 rewind/fork 等副作用的 host 回调。

### 发送与流式渲染

第七阶段后，`OpenCodianView.sendMessage()` 已经退化成 UI 事件到 `runtime/SendPipelineRuntime.ts` 的薄桥接。完整发送子系统现在按下面的边界协作：

1. `OpenCodianView` 只负责把输入事件转交给 `SendPipelineRuntime`
2. `MessageSendPreparationService` 负责确认当前 conversation / active tab / runtime 可发送
3. `MessageSendPreparationService` 负责 server readiness、model catalog lazy load 与 selected model availability 检查
4. `MessageSendPreparationService` 先把 optimistic user message 落到本地 conversation，并保持 save / render / scroll 时序
5. 首条 user message 时，仍先写 fallback title，再按设置异步触发 AI title generation
6. `SendPipelineRuntime` 调用 `openCodeService.sendMessage()`，创建 streaming shell 与 `StreamController`
7. `SendPipelineRuntime` 装配 `StreamChunkRouter` 处理 chunk / pending / timeout / interruption
8. `SendPipelineRuntime` 装配 `StreamLocalFinalizer` 处理本地 shell finalization 与第一次本地保存
9. `MessageFinalizationService` 再接手最终 sync、post-sync patch/rerender、todo/save/attention 收尾

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
- 在正常完成时通过 `MessageFinalizationService` 再向服务端拉一轮最终消息，并按需 patch / rerender UI
- 追加 turn diff notice
- 刷新 session todos
- 更新 context usage

第七阶段后，这条链路的边界变成：

- send preflight / optimistic bootstrap / stream-enter state 切换，已迁到 `services/MessageSendPreparationService.ts`
- stream loop、pending/timeout/interruption 已迁到 `runtime/StreamChunkRouter.ts`
- 本地 streaming shell/notice 渲染、第一次本地保存已迁到 `runtime/StreamLocalFinalizer.ts`
- post-stream finalization / post-sync orchestration 已迁到 `services/MessageFinalizationService.ts`
- `OpenCodianView` 本身只保留 runtime host 装配与 bridge 方法；streaming tool-call start/end 与 primary-stream background-task finalize 触发也已经下沉到 `runtime/BackgroundTaskStreamTriggerCoordinator.ts`
- 消息区 patch / rerender 细节仍继续复用 `ConversationRenderService`

第八阶段起，`createSendPipelineRuntimeHost()` 也不再把全部 callback 混在一个匿名对象里，而是先按 host 能力簇分成：

- `SendPipelineViewPort`
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
- `role === 'user'` -> `renderUserMessageContent()`

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

用户消息渲染里：

- 可选调用 `prepareUserMessageMarkdownForDisplay()`
- 通过 `setupCollapsible()` 给长文本加折叠
- 渲染 context attachment chips
- 渲染 OMO 注入面板
- 通过 `UserMessageFooterRenderer` 追加 footer，并把 copy / rewind / fork 的真实副作用留在 host

渲染消息列表前还会经过 `getMessagesForRender()`，也就是先用 `renderGroups` 合并连续 assistant message。

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
- question：既支持输入区上方的 `QuestionDock`，也支持由 `QuestionRuntimeHostAdapter.ts` 装配的 `QuestionInlineCardRenderer` 管理内联待回答卡片，再由 `QuestionResolutionFlowCoordinator` 统一承接 dock-or-inline resolve flow，以及由 `QuestionResolutionCoordinator` + `QuestionResolutionCardRenderer` 协作管理的已回答/已拒绝回顾卡片；pending-question refresh / clear 的共享路由也继续留在这份 bundle 内，而相邻的 dock/API/attention/sync/status late-bound wiring 现在先经由 `services/QuestionRuntimeViewHostFactory.ts` 收束，再交给 `QuestionRuntimeViewHostAdapter.ts`
- background task：从 OMO 注入、`toolName === 'task'` 的 tool block、以及后续 system reminder 回写推导任务进度；运行态以内联状态条挂在对应 assistant turn 下，完成态则延迟落成持久化 notice；其中 timeline segment 推导、launch/completion runtime 重建、pending matching，以及 inline notice copy 组装已下沉到 `services/BackgroundTaskTimelineService.ts`，inline panel 的 DOM 创建、挂载、复用/清理已下沉到 `runtime/BackgroundTaskInlinePanelRenderer.ts`，indicator render 与 completion notice queue/flush 顺序已下沉到 `runtime/BackgroundTaskIndicatorCoordinator.ts`，streaming tool-call start/end 与 primary-stream finalize 触发已下沉到 `runtime/BackgroundTaskStreamTriggerCoordinator.ts`，live-signal reconciliation、authoritative-sync gate，以及 tab badge / finalize 共用的 live/grace-period running predicate 已下沉到 `services/BackgroundTaskLiveSignalCoordinator.ts`，而 tab stream-like/background-task badge 与 rewind-fork 按钮禁用态写回则进一步下沉到 `runtime/TabRuntimeStateBridge.ts`；hidden signal/background-tab sync 以及 active visible-conversation background sync 后的 question/todo/background-task refresh 组合装配已继续下沉到 `services/QuestionTodoBackgroundTaskRefreshHostAdapter.ts` 装配的 `services/PostSyncQuestionTodoRefreshFacade.ts` + `services/VisibleConversationPostSyncCoordinator.ts` + `services/BackgroundConversationPostSyncHandoffCoordinator.ts`，其中 facade 负责 question/todo refresh request，visible coordinator 负责 active-conversation state commit，handoff coordinator 负责 signal authoritative mark 与 background attention handoff；stopped/stale warning notice 的 content、fingerprint、suppression runtime 已下沉到 `services/BackgroundTaskNoticeStateService.ts`，completion notice 的 queued-state、fingerprint/content 则下沉到 `services/BackgroundTaskCompletionNoticeService.ts`，而两条链路共用的 persisted assistant notice append/dedupe 与 visible/hidden tab 后续动作已进一步下沉到 `services/PersistentAssistantNoticeService.ts`
- background task 的 stale 判定现在额外受 `backgroundTaskAwaitingAuthoritativeSync` / hydration 保护：reload 或首次装载后，只有在至少一次权威消息同步完成后，才允许把“仍在运行”降级成 stopped/stale notice；这段 gate + live-signal 决策现在集中在 `BackgroundTaskLiveSignalCoordinator`

session todo 这条子链路现在的边界是：

- `OpenCodianView`：tab runtime/state host，以及更薄的 session 选择与 bridge 装配
- `ConversationSessionSignalRuntime`：session sync/todo/status listener 生命周期、session→tab 路由、active-tab fallback、signal sync 调度，以及 live update 后的 background-task reconcile 触发
- `SessionTodoHostAdapter`：session todo state/dock/refresh 三段 host factory 与 service bundle 装配
- `SessionTodoCoordinator`：streaming todowrite snapshot、live-signal todo/status 写回、主动 refresh、dock render，以及 activation/empty-tab session reset 的统一入口
- `SessionTodoDockCoordinator`：session todo dock 的 slot 生命周期，以及 active/background tab 的 session→dock 渲染选择
- `QuestionTodoActivationRefreshCoordinator`：activation/open 侧的 question dock render、session todo dock writeback 与 supplemental refresh 编排
- `BackgroundTaskActivationIndicatorCoordinator`：activation/open 侧的 background-task indicator reset、conversation-derived runtime rebuild 与 render trigger 编排
- `ActiveTabContextUsageCoordinator`：activation/open 侧的 active-tab context usage identity / snapshot writeback 编排
- `QuestionRuntimeViewHostFactory`：question runtime 相邻的 dock/API/attention/sync/status late-bound host 派生
- `QuestionTodoBackgroundTaskRefreshHostAdapter`：`QuestionTodoStatusRefreshCoordinator`、`PostSyncQuestionTodoRefreshFacade`、`VisibleConversationPostSyncCoordinator` 与 `BackgroundConversationPostSyncHandoffCoordinator` 共用的 refresh-side host factory 与 service bundle 装配
- `QuestionRuntimeHostAdapter`：`QuestionInlineCardRenderer`、`QuestionResolutionCoordinator`、`QuestionDockCoordinator` 与 `QuestionResolutionFlowCoordinator` 共用的 host factory 与 service bundle 装配
- `QuestionTodoStatusRefreshCoordinator`：activation/open 与 post-sync 共享的 status + pending-question + todo 组合刷新顺序，以及 post-sync todo/status runtime gate
- `PostSyncQuestionTodoRefreshFacade`：background sync 下的 question/todo refresh session 配对，以及 rebuild / completion / stream-like follow-up
- `SessionTodoStateService`：todo/status runtime state、snapshot 规范化、stale notice suppression 与 persisted notice dedupe/restore
- `PersistentAssistantNoticeService`：session todo stale notice 的历史匹配、持久化 append，以及 visible/hidden tab 后续动作

background task notice 这条子链路现在的边界是：

- `OpenCodianView`：background-task service bundle、indicator / stream-trigger coordinator 的最薄 host bridge，以及上层触发入口
- `BackgroundTaskTimelineService`：launch/completion timeline segment 推导、conversation→runtime rebuild、pending matching、completion segment 收集，与 inline copy 组装
- `BackgroundTaskInlinePanelRenderer`：inline panel DOM 创建、位置挂载、Markdown 渲染、mount 复用与 active indicator element 清理
- `BackgroundTaskIndicatorCoordinator`：直接组合 live-signal reconcile、inline render、completion notice queue/flush 与 stream-like sync 编排
- `BackgroundTaskStreamTriggerCoordinator`：streaming tool-call start/end、todo refresh、background-task launch runtime 更新，与 primary-stream finalize 后的 waiting/reset trigger 编排
- `BackgroundTaskLiveSignalCoordinator`：authoritative-sync gate arm/clear、tab badge / finalize 共用的 indicator running predicate、live-signal reconciliation，以及 stale downgrade / reset 的运行时判定
- `TabConversationStateBridge`：active-tab conversation/session 激活写回、pending-question reset 与 sync fingerprint baseline 提交
- `TabConversationActivationBridge`：当前活动 tab 的 empty-state activation 与 current-tab 新建会话打开路径的消息区 shell cleanup、baseline commit，以及复用 `QuestionTodoActivationRefreshCoordinator` / `BackgroundTaskActivationIndicatorCoordinator` / `ActiveTabContextUsageCoordinator` 的后续刷新编排
- `TabViewActivationBridge`：tab/pane activation 预刷新写回，以及 streaming / empty-tab activation outcome 的 selector、send-button 与 loaded-conversation post-render outcome 编排；question/todo dock writeback 已委托 `QuestionTodoActivationRefreshCoordinator`，background-task indicator render 已委托 `BackgroundTaskActivationIndicatorCoordinator`，context usage identity/snapshot 已委托 `ActiveTabContextUsageCoordinator`
- `ConversationLoadRecoveryCoordinator`：create/load/bootstrap/delete-recovery/fork/rewind 的统一 conversation lifecycle surface
- `ConversationRestoreBootstrapCoordinator`：首开 load / persisted restore / fallback-create 决策与 restore 失败后的 tab state reset/flush
- `ConversationTabLifecycleRecoveryCoordinator`：tab close / conversation delete / delete-all reset 后的 pane cleanup、next-active activation 与 fallback-create recovery 决策
- `ConversationTransitionBridge`：loaded-conversation 的切换前 cleanup、消息区清空、turn reset 与 hydration lifecycle shell
- `ConversationHydrationOutcomeBridge`：loaded-conversation 消息装载后的 background-task rebuild、message rerender、post-render outcome 与 baseline commit 编排
- `TabRuntimeStateBridge`：tab stream-like / background-task badge、rewind-fork 按钮禁用态与 attention 标记的 runtime→UI 写回
- `QuestionTodoBackgroundTaskRefreshHostAdapter`：question/todo/background-task post-sync 三段 host wiring 与 service bundle 装配
- `QuestionTodoStatusRefreshCoordinator`：activation/open 与 post-sync 共享的 status + pending-question + todo 组合刷新顺序，以及 todo/status refresh runtime gate
- `PostSyncQuestionTodoRefreshFacade`：hidden signal/background-tab sync 与 active visible-conversation background sync 后的 question/todo/background-task refresh 组合装配
- `BackgroundConversationPostSyncHandoffCoordinator`：hidden signal/background-tab sync 后的 authoritative mark、background refresh 与 attention handoff 编排
- `BackgroundTaskNoticeStateService`：stopped/stale notice content、fingerprint、persisted dedupe 与 suppression runtime 协调
- `BackgroundTaskCompletionNoticeService`：completion notice queued state、content/fingerprint 与 persisted dedupe/append 协调；queued state 已不再挂在 view runtime 上
- `PersistentAssistantNoticeService`：session todo / background task / diff / model-unavailable 共享的 persisted notice append、conversation save、sync fingerprint 写回，以及 visible/hidden tab 后续动作

## 外观与控件

`OpenCodianView` 也是这些 UI 控件的装配点：

- header：logo、server badge、新建对话、新建当前 tab 对话、历史、设置
- toolbar：permission selector、model selector、context ring、effort selector
- appearance：theme preset、chat appearance CSS variables、自定义 CSS、背景图
- input panel glass：`InputPanelAppearanceCoordinator` 负责 SVG filter layer、adapter mount/unmount、action button class 与诊断日志
- experimental demo：`LiquidDiamondDemoController`（CPU / WebGL）与 `GlassOctahedronDemoController`

模型选择器本身支持：

- provider 分组
- 搜索过滤
- 键盘导航
- provider icon 异步加载
- 每个 tab 的 model override
- 保留 disabled / unavailable 模型的展示元数据，不把它们简单抹掉
- 会优先解析当前 tab 请求的模型；若它已被开关链路过滤，则自动回退到同 provider 默认模型 / 当前 effective catalog 的其他可用模型
- 当 effective catalog 为空时，trigger 会回退到默认机器人图标，并保留空 catalog 对应的 tooltip 文案

## 直接协作模块

- `OpenCodeService`：会话 CRUD、发送、stream、同步、question、todo、status、context usage
- `ConversationLoadRecoveryCoordinator`：create/load/bootstrap/delete-recovery/fork/rewind 的入口收束与现有 owner 组合
- `ConversationRestoreBootstrapCoordinator`：首开 tab 初始化、persisted restore、fallback create/activate 决策
- `ConversationTabLifecycleRecoveryCoordinator`：tab close / conversation delete / delete-all reset 后的 tab recovery create-or-activate 决策
- `ConversationViewStateService`：tab 激活和 conversation hydration 装载编排
- `ConversationRenderService`：消息区 full rerender、tail patch 和 append-only sync 编排
- `ConversationLoadRuntimeBridge`：loaded-conversation 的 resolve / reload retry、server-sync 判定与 revert-state 写回
- `TabConversationStateBridge`：active-tab conversation/session 写回、pending question reset 与 sync baseline 提交
- `TabConversationActivationBridge`：当前活动 tab 的 empty-state activation / current-tab 新建会话打开路径 shell orchestration 与后续 UI refresh 编排
- `TabViewActivationBridge`：tab/pane activation 预刷新写回与 streaming / empty-tab activation outcome UI 刷新
- `ActiveTabContextUsageCoordinator`：activation/open 与相邻 sync 路径的 active-tab context usage identity / snapshot writeback
- `ConversationTransitionBridge`：loaded-conversation 的 preflight cleanup、消息区 shell 与 hydration lifecycle bridge
- `ConversationHydrationOutcomeBridge`：loaded-conversation 消息装载后的 background-task rebuild、message rerender、post-render outcome 与 baseline commit
- `ConversationHydrationRenderBridge`：loaded-conversation hydration 的消息容器 scroll/class shell 与 pane metrics 回写
- `SendPipelineRuntime`：发送子系统总入口，负责真实 stream 调用、runtime 内部模块装配，以及向 `MessageFinalizationService` 交接
- `StreamChunkRouter`：发送子系统内部的 stream loop / pending / timeout / chunk router
- `StreamLocalFinalizer`：发送子系统内部的本地 shell finalization 与第一次本地保存
- `AssistantShellViewHostAdapter` / `AssistantShellRenderer` / `AssistantNoticeRenderer` / `AssistantErrorRenderer` / `AssistantPlainTextFallbackRenderer` / `AssistantStructuredContentRenderer` / `StreamingInlineCardRenderer` / `PermissionInlineCardRenderer` / `SendPipelineTrace` / `PendingIndicatorController` / `buildLocalStreamOutcome` / `StreamShellFinalizer` / `LocalStreamMessagePersistence`：发送子系统更细粒度的内部协作模块
- `MessageSendPreparationService`：`sendMessage()` 前半段的 send preflight、optimistic user message 落地，以及 stream-enter 状态编排
- `MessageFinalizationService`：`sendMessage()` 末段的 final sync、post-sync patch/rerender、todo/save/attention 收尾编排
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
- `TitleGenerationService`：AI 标题生成
- `composerContext`、`renderGroups`、`collapsible`、`forkMessages`
- `ui/modelSelector/*`：模型选择器列表渲染、交互和 trigger display state
- `ContextRing`、`QuestionDock`、`SessionTodoDock`、`NavigationSidebar`、`EffortSelector`

## 主要设置依赖

源码里直接读取的高频设置包括：

- `maxTabs`
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

## 注意事项

- 这个文件的大部分便捷 getter/setter 都默认指向“活动 tab”；改逻辑时必须先确认是不是应该改成显式 `tabId`。
- streaming、conversation sync、background task 和 question 队列都已经做成按 tab 隔离，不能再退回单全局状态。
- 会话同步会保留本地 client-only message，尤其是 interrupted assistant message 和本地 notice；不要把同步理解成简单的全量覆盖。
- `session.status` 只能代表主 runner 是否 `busy/retry/idle`；后台任务是否完成要看后续消息/提醒是否真正回写到会话历史。
- 重新渲染消息列表时，滚动恢复不再只按旧 `scrollTop`，而是按“到底 / 保持距底距离 / 保持可见 anchor”三态恢复，避免 hydration 后补写 inline/notice 时把视图重新顶上去。
- 当 tab 同时处于前台流式和后台任务存活状态时，tab 样式遵循“streaming 主态、background 次级标记”的优先级；不要把二者重新合并成同一套阻塞语义。

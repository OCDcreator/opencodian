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
| `applyLocaleTexts()` | 刷新工具提示、placeholder、dock 和 tab 文案 |
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

这些状态通过 `tabPaneStates: Map<TabId, TabPaneState>` 和实际消息 pane 绑定。每个 tab 都有自己的：

- streaming 控制器
- DOM pane
- todo / status / background task 状态
- context 草稿和 question 草稿

这就是多标签并发不共享一个全局 streaming 状态的实现基础。

### 视图级状态

除此之外，类里还维护若干跨 tab 的视图级状态：

- `currentConversation` / `currentConversationRevertState`
- 模型目录缓存：`availableModels`、`availableProviders`
- 服务器状态轮询和 badge 状态
- context file catalog 缓存
- model selector sticky header cleanup
- retained selection highlight 状态
- theme background / liquid glass / diamond demo / glass octahedron 相关 DOM 引用

## 主链路

### 打开与关闭

`onOpen()` 的顺序是固定的：

1. `buildUI()`
2. `initializeTabSystem()`
3. `startServerStatusLoop()`
4. 在 `messagesShellEl` 上创建 `MarkdownRenderService`
5. `wireEventHandlers()`
6. 启动 retained selection polling
7. 订阅 session todo/status/sync-event 更新
8. `initializeFirstTab()`

`onClose()` 则会反向清理：

- tab 持久化
- server status / conversation sync / selection polling / layout / scroll 定时器
- title generation
- effort selector、context ring、question dock、todo dock、navigation sidebar
- liquid glass adapter、SVG filter layer、diamond demo
- tab panes、tab bar、dropdown、markdown component 等

### 滚动辅助抽离

消息区的底部检测、scroll snapshot、重渲后恢复，现在由 `services/ScrollManager.ts` 提供纯 helper；`OpenCodianView` 只保留：

- 当前 tab / pane 的查找
- 是否应 auto-scroll 的业务判断
- restore 后刷新 navigation sidebar 可见性和 pane metrics

这次没有改变原有 bottom / preserve-anchor / preserve-distance 三种恢复语义，只是把算法从 view 内联实现挪到了可单测模块。

### 对话装载与后台同步

`loadConversation()` 的装载编排现在先交给 `services/ConversationViewStateService.ts`，而消息区 full rerender / tail patch / append-only 增量更新则交给 `services/ConversationRenderService.ts`；两者都通过 host 回调落回 view 内部能力。主链路仍然保持原来的语义：

- 在切换对话时取消旧对话的标题生成
- 清空当前消息区并重置 turn 状态
- 把 `openCodeSessionId` 交给 `openCodeService`
- 在必要时调用 `syncConversationMessagesFromServer()`
- 装载阶段进入 hydration：先重建历史 turn / inline background task，再等待后续 authoritative message sync 决定是否允许 stale 降级
- 重新渲染消息、背景任务指示器、todo dock、question dock
- 通过 `ConversationSyncHostAdapter` 组装 `ConversationSyncRuntimeCoordinator` / `ConversationSyncOrchestrationService` / `ConversationSyncBridge`，并刷新 2 秒一次的 conversation sync loop 生命周期
- 更新模型显示和 context usage

后台同步分两路：

- `syncVisibleConversationInBackground()`：同步当前活动 tab
- `syncBackgroundTaskTabsInBackground()`：同步非活动但仍有 background task 的 tab

`OpenCodianView` 现在只提供一份 `ConversationSyncViewHost`；真正把这份 view-state / render bridge 适配成 runtime/orchestration/bridge 三组 host 的层，是 `ConversationSyncHostAdapter`。这样 sync service bundle 的 wiring 不再散落在 view 构造函数里。

signal sync 与后台轮询里的 loop lifecycle、signal debounce、tab / conversation 选择、conversation 加载和 dispatch 编排现在先交给 `ConversationSyncOrchestrationService`。它会判断 signal 是否应回到当前可见会话，或转向 hidden tab sync；会把同一 tab 上短时间内连续到达的 signal reason 合并；轮询时也只会在确实存在 visible/background sync 目标时持有 interval，并只枚举非活动、仍有 background task、且 runtime 当前允许同步的 tab。

真正把 visible/signal/background 三条 sync 回调装配到一起的层现在是 `ConversationSyncBridge`：它会把 orchestration 的 dispatch 回调统一接到 server sync、fingerprint commit 和 post-sync coordinator，再把真正依赖当前 DOM/render host 的 `applySyncedConversationUpdate()` / `renderBackgroundTaskIndicatorIfNeeded()` 留在 view。hidden-tab 与 active-tab 同步入口仍通过 `ConversationSyncRuntimeCoordinator` 统一处理 tab runtime guard、`isConversationSyncInFlight` 生命周期，以及 per-tab fingerprint baseline 判定。

其中当前活动 tab 的后台同步收尾会把 question refresh、todo/status live refresh、active-conversation match 判定，以及 `currentConversationRevertState` / active-tab sync fingerprint 的 state commit 委托给 `BackgroundTaskPostSyncCoordinator`；`ConversationSyncBridge` 负责把这些 post-sync outcome 路由回 view，`OpenCodianView` 只保留 `applySyncedConversationUpdate()` / `renderBackgroundTaskIndicatorIfNeeded()` 这类真正依赖当前 DOM/render host 的路径。

除此之外，`subscribeToSessionSyncEvents()` 现在还会接入 `message.updated`、`message.part.updated` 和 `session.diff`，并先交给 `ConversationSyncOrchestrationService` 做 debounce/dispatch，用于提前触发当前会话或后台 tab 的 authoritative sync，而不是只能等 2 秒轮询。

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
- `OpenCodianView` 本身只保留 runtime host 装配与 bridge 方法
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
- `AssistantFooterPayload.ts`：封装 persisted assistant footer 传给 timestamp/copy renderer 的 timestamp、copy-content、model 与 status payload 组装
- `PersistedAssistantFooterFinalizer.ts`：封装 persisted assistant footer 的最终 renderer 调用，让 view 与 `ConversationRenderService` 都只通过 `messageEl` + `message` bridge 回到同一个 finalizer
- `SendPipelineTypes.ts`：定义 runtime 与 host 契约
- `AssistantShellRenderer.ts`：封装 assistant streaming shell 的创建、reveal 与 timestamp 收尾
- `AssistantNoticeRenderer.ts`：封装 stream error / interrupted notice 构造与 placeholder notice 渲染
- `AssistantPlainTextFallbackRenderer.ts`：封装无 structured blocks 的 resolved card + plain-text fallback 渲染
- `StreamingInlineCardRenderer.ts`：封装 permission/question inline card 的共享插入位置与 shell reveal
- `PermissionInlineCardRenderer.ts`：封装 permission inline card 的内容构造与按钮等待
- `QuestionInlineCardRenderer.ts`：封装 grouped/sequential question inline card 的内容构造、容器复用与按钮等待
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

`renderMessage()` 根据消息类型分成三路：

- `displayStyle === 'notice'` -> `renderNoticeCard()`
- `role === 'user'` -> `renderUserMessageContent()`
- 其余 assistant -> `renderAssistantMessageContent()`

assistant 渲染里：

- `contentBlocks` 会按块类型渲染
- structured assistant 分支由 `renderAssistantStructuredContent()` 消费 `buildQuestionResolutionCardRenderPlan()` 产出的 render plan
- persisted assistant footer 收尾由 `PersistedAssistantFooterFinalizer.finalizeFooter()` 统一执行；它内部再调用 `buildPersistedAssistantFooterPayload()` 组装 payload，其中 copy-content 继续委托 `resolveAssistantCopyContent()`，interrupted status badge 也由 footer helper 统一判断
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
- footer 上追加 copy、rewind、fork 按钮和时间

渲染消息列表前还会经过 `getMessagesForRender()`，也就是先用 `renderGroups` 合并连续 assistant message。

### context、选区与文件目录

这个视图把 composer context 相关逻辑也集中在本文件：

- 活动编辑器焦点预览通过 `createFocusContextPreview()` / `resolveFocusContextPreview()` 维护
- `addCurrentNoteContextFromActiveEditor()`、`addSelectionContextFromActiveEditor()`、`addChosenFileContextToActiveTab()` 负责把不同来源转成 `PromptContextItem`
- remote server 模式下，附件文本会经过 `validateRemoteContextText()`，单项上限是 `64 KiB`
- 文件选择器使用惰性构建的 `ContextFileCatalog`，并监听 vault `create/delete/rename` 做增量更新

选区高亮保留逻辑同样在这里：

- 会尝试同时保存 CodeMirror 偏移和 DOM range
- 通过轮询和 composer focus 事件维护 retained highlight

### question、todo 与 background task

这三个辅助子系统都由 view 负责路由：

- session todo/status：订阅入口仍在 view，但 normalized snapshot、status fingerprint、stale suppression 与 persisted notice 恢复已经下沉到 `services/SessionTodoStateService.ts`
- question：既支持输入区上方的 `QuestionDock`，也支持由 `QuestionInlineCardRenderer` 管理的内联待回答卡片，以及由 `QuestionResolutionCoordinator` + `QuestionResolutionCardRenderer` 协作管理的已回答/已拒绝回顾卡片
- background task：从 OMO 注入、`toolName === 'task'` 的 tool block、以及后续 system reminder 回写推导任务进度；运行态以内联状态条挂在对应 assistant turn 下，完成态则延迟落成持久化 notice；其中 live-signal reconciliation 与 authoritative-sync gate runtime 已下沉到 `services/BackgroundTaskLiveSignalCoordinator.ts`，hidden signal/background-tab sync 以及 active visible-conversation background sync 后的 question refresh、todo/status refresh、completion notice queue/flush、attention 标记与 active-conversation match 判定编排已下沉到 `services/BackgroundTaskPostSyncCoordinator.ts`，stopped/stale warning notice 的 content、fingerprint、persisted dedupe 与 suppression 已下沉到 `services/BackgroundTaskNoticeStateService.ts`，completion notice 的 queued-state、fingerprint/content 与 persisted dedupe/flush 则下沉到 `services/BackgroundTaskCompletionNoticeService.ts`
- background task 的 stale 判定现在额外受 `backgroundTaskAwaitingAuthoritativeSync` / hydration 保护：reload 或首次装载后，只有在至少一次权威消息同步完成后，才允许把“仍在运行”降级成 stopped/stale notice；这段 gate + live-signal 决策现在集中在 `BackgroundTaskLiveSignalCoordinator`

session todo 这条子链路现在的边界是：

- `OpenCodianView`：session todo/status 订阅、OpenCode 主动刷新、dock 装配，以及和 background task 的上层路由
- `SessionTodoStateService`：todo/status runtime state、snapshot 规范化、stale notice suppression 与 persisted notice dedupe/restore

background task notice 这条子链路现在的边界是：

- `OpenCodianView`：background task timeline 推导、inline panel 渲染，以及 post-sync coordinator / notice services 的 host bridge
- `BackgroundTaskLiveSignalCoordinator`：authoritative-sync gate arm/clear、live-signal reconciliation，以及 stale downgrade / reset 的运行时判定
- `BackgroundTaskPostSyncCoordinator`：hidden signal/background-tab sync 与 active visible-conversation background sync 后的 question refresh、todo/status refresh、completion notice queue/flush、attention 标记，以及 visible sync 的 active-conversation match/state-commit 编排
- `BackgroundTaskNoticeStateService`：stopped/stale notice content、fingerprint、persisted dedupe 与 suppression runtime 协调
- `BackgroundTaskCompletionNoticeService`：completion notice queued state、content/fingerprint 与 persisted dedupe/append 协调

## 外观与控件

`OpenCodianView` 也是这些 UI 控件的装配点：

- header：logo、server badge、新建对话、新建当前 tab 对话、历史、设置
- toolbar：permission selector、model selector、context ring、effort selector
- appearance：theme preset、chat appearance CSS variables、自定义 CSS、背景图
- input panel glass：SVG filter layer、adapter mount/unmount、诊断日志
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
- `ConversationViewStateService`：tab 初始化、persisted restore、tab 激活和 conversation hydration 装载编排
- `ConversationRenderService`：消息区 full rerender、tail patch 和 append-only sync 编排
- `SendPipelineRuntime`：发送子系统总入口，负责真实 stream 调用、runtime 内部模块装配，以及向 `MessageFinalizationService` 交接
- `StreamChunkRouter`：发送子系统内部的 stream loop / pending / timeout / chunk router
- `StreamLocalFinalizer`：发送子系统内部的本地 shell finalization 与第一次本地保存
- `AssistantShellRenderer` / `AssistantNoticeRenderer` / `AssistantPlainTextFallbackRenderer` / `AssistantStructuredContentRenderer` / `StreamingInlineCardRenderer` / `PermissionInlineCardRenderer` / `SendPipelineTrace` / `PendingIndicatorController` / `buildLocalStreamOutcome` / `StreamShellFinalizer` / `LocalStreamMessagePersistence`：发送子系统更细粒度的内部协作模块
- `MessageSendPreparationService`：`sendMessage()` 前半段的 send preflight、optimistic user message 落地，以及 stream-enter 状态编排
- `MessageFinalizationService`：`sendMessage()` 末段的 final sync、post-sync patch/rerender、todo/save/attention 收尾编排
- `TabManager` / `TabBar`：tab 生命周期和 tab 元数据
- `MarkdownRenderService`：Markdown 渲染
- `StreamController`：流式 assistant DOM 更新
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

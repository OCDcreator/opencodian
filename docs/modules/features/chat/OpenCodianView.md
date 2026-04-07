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
| `getIcon()` | 返回 Obsidian 图标 id `bot` |
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
7. 订阅 session todo/status 更新
8. `initializeFirstTab()`

`onClose()` 则会反向清理：

- tab 持久化
- server status / conversation sync / selection polling / layout / scroll 定时器
- title generation
- effort selector、context ring、question dock、todo dock、navigation sidebar
- liquid glass adapter、SVG filter layer、diamond demo
- tab panes、tab bar、dropdown、markdown component 等

### 对话装载与后台同步

`loadConversation()` 会：

- 在切换对话时取消旧对话的标题生成
- 清空当前消息区并重置 turn 状态
- 把 `openCodeSessionId` 交给 `openCodeService`
- 在必要时调用 `syncConversationMessagesFromServer()`
- 重新渲染消息、背景任务指示器、todo dock、question dock
- 启动 2 秒一次的 `startConversationSyncLoop()`
- 更新模型显示和 context usage

后台同步分两路：

- `syncVisibleConversationInBackground()`：同步当前活动 tab
- `syncBackgroundTaskTabsInBackground()`：同步非活动但仍有 background task 的 tab

收到服务端新消息后，`applySyncedConversationUpdate()` 会优先尝试：

- patch 最后一条 assistant render
- 仅追加新增 render message
- 对纯文本 assistant 消息使用 pseudo-stream reveal

否则回退到整段重渲。

### 发送与流式渲染

`sendMessage()` 是这个文件最重要的业务方法。它会：

1. 必要时新建 conversation
2. 读取当前 tab 的 `draftContextItems`
3. 先把用户消息乐观写入本地 conversation 并渲染到 UI
4. 首条用户消息时先写默认标题，再按设置异步触发 AI 标题生成
5. 检查 server availability，必要时通过 `ensureServerReadyForChat()` 给出启动/重试/跳过/进设置的交互卡片
6. 校验当前模型是否可用
7. 打开 tab 级 streaming 状态，并开始 context usage streaming
8. 调用 `openCodeService.sendMessage()`，传入 `sessionId`、模型选项和 `contextItems`
9. 用 `StreamController` 消费流式 chunk

chunk 处理里显式覆盖了这些分支：

- `message_start`
- `usage`
- `message_metadata`
- `message_stop`
- `file_edited`
- `permission_request`
- `question_request`
- 其余可转换为本地 `StreamChunk` 的 text / thinking / tool 事件

收尾阶段会：

- 把 streaming 内容组装成持久化的 assistant `ChatMessage`
- 在正常完成时再向服务端拉一轮最终消息并尝试 patch UI
- 追加 turn diff notice
- 刷新 session todos
- 更新 context usage

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
- `thinking` 块走 `ThinkingBlockRenderer`
- `tool_use` 块走 `ToolCallRenderer`
- `text` 块和普通 `content` 走 `MarkdownRenderService`
- 已解析的 `questionResolution` 会根据设置插入 resolved card

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

- session todo/status：通过 `openCodeService.subscribeToSessionTodoUpdates()` 和 `subscribeToSessionStatusUpdates()` 接入
- question：既支持输入区上方的 `QuestionDock`，也支持内联 question card 和已回答/已拒绝回顾卡片
- background task：从 OMO 注入和 `toolName === 'task'` 的 tool block 推导任务进度，并在必要时渲染 transient indicator 或 notice

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

## 直接协作模块

- `OpenCodeService`：会话 CRUD、发送、stream、同步、question、todo、status、context usage
- `TabManager` / `TabBar`：tab 生命周期和 tab 元数据
- `MarkdownRenderService`：Markdown 渲染
- `StreamController`：流式 assistant DOM 更新
- `ContextUsageService`：context usage state 维护
- `TitleGenerationService`：AI 标题生成
- `composerContext`、`renderGroups`、`collapsible`、`forkMessages`
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

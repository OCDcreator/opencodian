# OpenCodianView

> **源码**: `src/features/chat/OpenCodianView.ts`
> **状态**: [DRAFT]

## 概述

OpenCodian 插件的主聊天视图组件，继承 Obsidian `ItemView`，是整个插件最大且最复杂的文件（约 10500 行）。负责渲染侧边栏/主标签页中的完整聊天界面，管理多标签对话、流式响应渲染、上下文附件、权限卡片、问题卡片、会话待办、背景任务指示器、主题背景、OMO 兼容面板等所有 UI 交互。

## 导入关系

**上游**:
- `obsidian` — `ItemView`, `ItemView` 基类及 Obsidian API
- `../../main` — `OpenCodianPlugin` 插件实例
- `../../core/opencode` — `OpenCodeService`, `SessionActivityStatus`
- `../../core/types` — `ChatMessage`, `Conversation`, `PromptContextItem`, `QuestionRequest`, `SessionTodo`, `ToolCallInfo` 等
- `../../core/theme` — 主题预设定义
- `../../i18n` — 国际化 `t()` 函数
- `../../utils/streaming` — `StreamController`, `ThinkingBlockRenderer`, `ToolCallRenderer`
- `../../utils/markdown` — `MarkdownRenderService`
- `../../utils/glass` — 玻璃效果适配器
- `../../utils/icons/ProviderIconService` — 模型提供商图标
- `./chatAppearance`, `./composerContext`, `./renderGroups`, `./rendering/collapsible` — 同级模块
- `./services/TitleGenerationService`, `./services/ContextUsageService`
- `./tabs/*` — 标签系统
- `./ui/*` — 各 UI 子组件

**下游**: 被 `main.ts` 通过 `addView` 注册到 Obsidian workspace。

## 核心类型 / 接口

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
  focusContextPreview: FocusContextPreview | null;
  draftContextItems: PromptContextItem[];
  pendingQuestionRequests: QuestionRequest[];
  questionDraftAnswers: Map<string, string[][]>;
  // ... 完整约 30 个字段
}

interface TabPaneState {
  tabId: TabId;
  messagesEl: HTMLElement;
  runtime: TabRuntimeState;
}

interface BackgroundTaskLaunchInfo {
  launchId: string;
  taskId: string | null;
  description: string;
}

interface RetainedSelectionHighlight {
  path: string;
  editorView: EditorView | null;
  from: number | null;
  to: number | null;
  domRanges: Range[];
  captureSource: 'offsets' | 'dom' | 'mixed';
}

type ChatServerAvailability = 'checking' | 'running' | 'starting' | 'offline' | 'external';
```

## 核心逻辑

### 生命周期管理
`onOpen()` 初始化 UI 骨架、标签系统、事件监听、服务器状态轮询。`onClose()` 清理所有订阅、定时器、DOM 元素。

### 多标签并发
每个标签维护独立的 `TabRuntimeState`（含流控制器、消息元素引用、会话待办、问题队列等），存储在 `tabPaneStates: Map<TabId, TabPaneState>` 中。通过 `getTabRuntimeState(tabId)` 获取指定标签的运行时状态，实现真正的并发流式传输。

### 流式消息渲染
发送消息后，`sendMessage()` 创建 turn 元素，启动 `StreamController`，通过回调链逐步渲染 `text`、`thinking`、`tool_use`、`tool_result` 事件块。完成后进行乐观用户消息水合（optimistic hydration），用服务端最终内容替换本地预览。

### 上下文附件系统
composer 区域显示已附加文件的 chip 列表（`composerContext` 模块驱动）。支持通过 `+` 按钮打开文件选择器、从活动编辑器自动检测当前笔记/选中范围。附加的上下文在发送时编码为 `contextItems` 传递给 SDK。

### 保留选区高亮
当用户从编辑器切换到聊天时，通过 `RetainedSelectionHighlight` 机制在编辑器中保留视觉高亮，支持 CodeMirror6 偏移量和 DOM Range 双重捕获，250ms 轮询刷新。

### 会话待办（Session Todo）
通过 `global.syncEvent.subscribe()` 监听 `todo.updated` 事件，渲染 `SessionTodoDock`。支持过期检测（120s 超时）、过期通知卡片、流式传输期间的即时快照。

### 背景任务指示器
检测 OMO 注入的 background-task 提醒，在 UI 底部显示进度指示器，流结束后展示"已停止"通知卡片。15s 宽限期防止误报。

### 问题卡片系统
OpenCode `question.*` 请求可内联或停靠在输入区上方。支持分组标签、单答/全答模式、已答/已拒绝回顾卡片。问题路由到正确的标签页。

### OMO 兼容
检测 `[search-mode]` 注入提示和 `<system-reminder>` 标签，渲染为可展开面板和通知卡片。

### 主题外观
支持消息外壳背景图片（上传、模糊/深度/边缘混合调节）、玻璃效果输入面板（SVG 折射滤镜）、主题预设切换。通过 CSS 自定义属性驱动。

## 关键方法

| 方法 | 说明 |
|------|------|
| `onOpen()` | 视图打开时初始化 UI、事件、轮询 |
| `onClose()` | 视图关闭时清理所有资源 |
| `buildUI()` | 构建完整 DOM 骨架 |
| `buildHeader(header)` | 构建顶栏（服务器状态、模型选择器、操作按钮） |
| `sendMessage()` | 发送用户消息并启动流式响应 |
| `cancelStream()` | 取消当前流式传输 |
| `createTurn(tabId)` | 创建新的消息回合 DOM 结构 |
| `resetTurnState(tabId)` | 重置指定标签的回合状态 |
| `renderAssistantMessage()` | 渲染助手消息（含折叠、工具调用、思考块） |
| `renderUserMessage()` | 渲染用户消息（含上下文附件、操作按钮） |
| `handleToolCall()` | 处理工具调用事件渲染 |
| `handlePermissionRequest()` | 处理权限请求卡片 |
| `handleQuestionRequest()` | 处理问题请求卡片 |
| `applyChatAppearanceSettings()` | 应用聊天外观设置到 CSS 变量 |
| `applyTabBarLayout()` | 切换标签栏布局位置 |
| `applyLocaleTexts()` | 刷新所有 i18n 文本 |
| `initializeTabSystem()` | 初始化多标签系统 |
| `restorePersistedTabs()` | 从持久化存储恢复标签 |
| `persistTabState()` | 持久化当前标签状态 |
| `subscribeToSessionTodoUpdates()` | 订阅会话待办同步事件 |
| `subscribeToSessionStatusUpdates()` | 订阅会话状态同步事件 |
| `refreshCurrentConversationRendering()` | 重新渲染当前对话的所有消息 |
| `toggleLiquidDiamondDemo()` | 切换 Liquid Diamond 玻璃效果演示 |

## 数据流

```
用户输入 → sendMessage()
  → 附加 contextItems（来自 composerContext）
  → OpenCodeService.sendMessage() / SDK stream
  → StreamController 回调链
    → text/thinking/tool_use/tool_result 事件
    → 逐步更新 DOM（streamingMessageEl）
    → usage 事件 → ContextUsageService → ContextRing
    → question 事件 → QuestionDock / inline cards
    → todo.updated → SessionTodoDock
  → 流结束
    → optimistic hydration
    → 标题生成（TitleGenerationService）
    → diff 通知
    → idle sync loop
```

## 与其他模块的交互

- **TabManager / Tab / TabBar**: 多标签生命周期管理
- **OpenCodeService**: 所有后端通信（发送、流、CRUD）
- **StorageService**: 对话持久化、设置读取
- **MarkdownRenderService**: 助手消息 Markdown 渲染
- **StreamController / ThinkingBlockRenderer / ToolCallRenderer**: 流式渲染管线
- **ContextUsageService / ContextRing**: 上下文窗口用量追踪与显示
- **TitleGenerationService**: AI 对话标题生成
- **NavigationSidebar**: 前后用户消息导航
- **QuestionDock / questionDockState**: 问题请求 UI
- **SessionTodoDock**: 会话待办 UI
- **EffortSelector**: 努力/思考预算选择
- **chatAppearance**: CSS 变量构建
- **composerContext**: 上下文 chip 状态管理
- **renderGroups**: 助手消息分组
- **collapsible**: 长内容折叠
- **userMessageDisplay / userMessageActions**: 用户消息渲染与操作
- **forkMessages**: 对话分叉
- **GlassEffectAdapter**: 输入面板玻璃效果

## 配置项

通过 `plugin.settings` 访问的主要相关设置：
- `maxTabs` — 最大标签数
- `tabBarPosition` — 标签栏位置（header / below-header / input）
- `autoScroll` — 自动滚动
- `chatScrollMode` — 聊天滚动模式
- `chatAppearance` — 聊天外观（颜色、圆角、模糊等）
- `questionDisplayMode` / `questionCardPosition` — 问题卡片显示方式
- `titleMode` — 标题生成模式（default / ai）
- `aiTitleModel` — AI 标题模型覆盖
- `locale` — 界面语言
- `userMarkup` — 用户标记渲染偏好
- `permissionMode` — 权限模式

## 注意事项

- 约 10500 行，是项目最大文件，修改时需格外谨慎
- 所有标签相关操作必须通过 `getTabRuntimeState(tabId)` 获取正确的标签状态
- 流式传输状态按标签隔离，不要引入全局共享状态
- 保留选区高亮使用 CodeMirror6 API，需注意编辑器视图生命周期
- 主题外观通过 CSS 自定义属性驱动，DOM 结构变更需同步 `styles.css`
- `buildUI()` 和渲染方法直接操作 DOM，无虚拟 DOM 框架
- 服务器状态轮询间隔需平衡响应性和性能

## 待补充

- [ ] 完整的 `sendMessage()` 内部流程图
- [ ] 权限卡片处理详解
- [ ] 问题卡片路由与分组机制详解
- [ ] OMO 兼容层渲染规则
- [ ] idle conversation sync loop 时序图
- [ ] 乐观消息水合 (optimistic hydration) 规则
- [ ] LiquidDiamondDemo 控制器说明
- [ ] 完整的公有/私有方法索引
- [ ] 玻璃效果适配器集成点

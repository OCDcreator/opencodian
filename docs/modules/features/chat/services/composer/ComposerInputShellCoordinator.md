# ComposerInputShellCoordinator

> 2026-10-29（统一入口与 ZCode token）：所有后端的 `/` 同时列出命令与技能，`$` 只列技能；skill mode 只影响原生序列化。输入区接入 `ComposerInvocationEditor`，展示为图标与名称组成的原子标签，底层仍保存各目录项的 insertText。技能提交进入 prompt 准备确认通路，预检失败保留草稿。现有 textarea draft/selection/focus 接口保留。

> 2026-10-29（命令/技能标签）：命令与技能使用 Codex 桌面端风格的中性圆角标签，并复用 textarea 镜像层保留复制、编辑、撤销和发送原文。高亮按当前目录中的真实 insertText 精确匹配；Codex `$技能名` 仅在 Codex 后端且目录存在对应 codex-skill 时识别，Pi `/skill:技能名` 与其他后端 `/技能名` 保留原生语法。未知 token、路径和金额保持普通文本，prefixed `/skills 技能名` 兼容既有模式。

> 2026-10-09（composer placeholder）：占位 overlay 仅在 textarea.value 为空时显示，`is-hidden` 只用于非空值。用户 input、Pi `set_editor_text` 发出的同一 input 事件及 accepted/queued 后清稿均沿用既有 syncTextareaHeight；不改高度、overflow、layout 调度或 placeholder CSS/display 策略。现有 composer fixture 回归覆盖空白→输入→清空、accepted 清稿与真实 Pi host 程序写入/清空路径。

> 2026-10-08：纯文本与图像 prompt 均等待 onPreparationOutcome；accepted/queued 后仅清空尚未编辑的原草稿，rejected 与准备异常保留内容。准备中禁用重复发送，迟到回调不影响重建后的 textarea。command/shell 原有路径不变。
> 2026-09-24 (ZCode image recovery)：图片提交等待发送预检结果后才清空 textarea/chips；ZCode 模型不支持图片或原生目录不可读时，`rejected` 回调保留原草稿并显示 backend-specific Notice，用户可换模型后重试。accepted/queued 才会消费草稿。
> 2026-09-21 (advantage-parity R-F1)：composer content 顶部新增队列条宿主元素（setQueuedFollowUpBarElement host 缝，chips 行之上）。
> 2026-09-21 (advantage-parity R-E2)：新增 globe 按钮——双 host 缝（getActiveWebViewerTabContext + attachWebViewerTabContextToActiveTab）存在且当前活动 webviewer 标签页可解析时才渲染，点击时重验、失效自移除。
> 2026-09-21 (advantage-parity R-E1)：新增粘贴监听——整个粘贴为一条 http(s) URL 时拦截并经 host 缝 attachUrlContextToActiveTab 成网页 chip；嵌在长文本里的链接不拦截。

> **源码**: `src/features/chat/services/composer/ComposerInputShellCoordinator.ts`
> **状态**: [REVIEW]

> **新增（Codex）**: host 可选 `isCodexBackendActive?()`、`onCodexAgentMentionUnavailable?()` 与 `onCodexSkillsEmpty?()`；`refreshComposerSuggestionMenu` 将 Codex `$skill-name` 作为**一等触发**（与 `/` 同级优先）——检测到 `getCodexSkillMenuQuery` 非 null 即路由 `refreshSlashCommandMenu`，任何中间 agent/command/input-reset 逻辑都不会清空 textarea 或隐藏菜单。`onCodexAgentMentionUnavailable` 仅在未接入统一引用 loader 的兼容宿主输入 `@` 时触发；`onCodexSkillsEmpty` 在 skill 选择器无 skills 时触发。

## 概述

2026-09-18（R-C1）：host 接口新增两个可选钩子——输入监听中的 `onComposerInputChanged(value)` 与提交路径 `inputTextareaEl.value = ''` 后的 `onComposerSubmitted()`，把 composer 文本观察转交给 `VaultRetrievalComposerCoordinator`；未实现（或功能关闭）时零成本，输入/提交行为逐字节不变。

`ComposerInputShellCoordinator` 承接聊天输入区 shell 的 DOM 与 layout lifecycle，避免 `OpenCodianView` 继续直接维护 textarea、自适应高度、send/stop 按钮、slash autocomplete / `@agent` menu 和 composer stack metrics。

该 owner 当前仍是一个大文件，这是有意的：textarea、overlay、focus 恢复和 layout sync 共享同一批 DOM 引用与生命周期，拆散后比本地集中维护更容易引入回归。

它负责：

- 创建 input tab bar slot、assistant-follow-up suggestion row、composer shell、context row、textarea、**single-rail composer**（context strip → textarea → footer），以及挂在 composer shell 上方的 slash menu overlay
- 绑定 textarea Enter 提交、Shift+Enter 换行，以及 textarea 高度同步
- 维护 `opencodian-input-highlight-backdrop`：一个位于 textarea 后方的镜像 div，将已追踪的 `@agent` 提及和已知 slash item 渲染为带样式的 `<span>`；selected `@agent` span 会携带 `data-type="agent"`、`data-name` 和 `data-value`，textarea 文本设为透明（`color: transparent`），仅保留 caret 可见，实现输入框内的富文本高亮而不影响原生复制行为
- 在输入以 `/` 开头且光标仍停留在 command token 内时，把 slash autocomplete session 委托给 `SlashCommandMenuCoordinator`；`/skills <query>` 是允许继续显示 nested skill suggestions 的特殊前缀；加载中、无命令、无匹配或加载失败时保持可见状态提示，避免静默消失
- 在 prompt mode 下把 `@agent` 查询交给 `AgentMentionComposerController`，选中后保留可见 `@name` 文本，并在 submit 时附加 `SurfaceInvocationIntent.mentions`。该 mention 路径由独立的 `shouldHandleAgentMentions` seam 控制，与 agent selector 下拉解耦：Claude Code 即使无 Subagents 能力也保留 mention（有 `loadClaudeRuntimeAgents` 数据源 + 原文保留通路），OpenCode/Codex 仍随能力判断
- 在独立 footer slots 中按「附件 → permission → Agent → model/effort → send」挂载控件。Agent 使用 `ChatAgentSelectionCoordinator` 的真实当前选择，无图标，且仅在 `shouldMountAgentSelector` 允许时挂载；permission 由 selection controls 直接挂载，不混入 Agent 菜单。模型按钮与 effort 共用弹层
- 统一处理 submit gate、send/stop affordance、add-context 按钮事件，以及 capability-gated 的图片附件按钮事件
- 通过 `ResizeObserver` + `requestAnimationFrame` 维护 composer stack height，并触发 settled scroll
- 把 context usage ring 挂到 composer 外状态栏左侧，把字数统计挂到右侧；附件留在 `+` 菜单，capability hint 留在独立辅助弹层
- 根据全局插件设置中的 `activeBackend` 调整 placeholder 文案：Codex backend 活跃时显示 `chat.input.placeholderCodex`，其余 backend 使用 host 提供的 placeholder
- 当 host 报告的 composer availability state 为 `backend-offline` 时，从全局插件设置读取当前 backend display name，并使用 `chat.empty.backendOffline.titleWithBackend` / `descriptionWithBackend` 渲染带 backend 名称的外部 notice；这样 `OpenCodianView` 只需返回 generic offline state，backend 命名由输入区 owner 本地 decorate
- 暴露 `refreshToolbarControls()`，允许 backend/capability 切换后只重挂 footer 内的子控件并同步刷新 capability hint，而不重建 textarea、context row 或 single-rail 布局
- 拥有 `PromptSuggestionService` 实例，并将 `.opencodian-suggestion-bar` 挂到最后一条 assistant message 后面；该行语义上表示“这条 assistant 回复的下一步建议”，视觉上紧跟消息本身，而不是出现在 composer footer 或输入区顶部。当存在 active suggestion 时显示可点击的 `.opencodian-suggestion-chip`，点击后仅将 suggestion 文本插入 textarea（不会自动提交），并调用 `acceptActiveSuggestion()` 清除该 suggestion
- 通过**模块级 channel bus** (`promptSuggestionSink.ts`) 与当前会话 backend session id 同步：`build()` 时创建独立 channel (`createPromptSuggestionChannel`)、在 container 上 stamp scope (`stampPromptSuggestionScope`)，并订阅该 channel 的 session 变更 (`onPromptSuggestionSessionChange`)；`TabActivationRuntimeHostProvider` 在 conversation 切换时通过 `findPromptSuggestionScope(messagesContainer)` 发现对应 channel，再经 `emitPromptSuggestionSessionChange(sessionId, channelId)` 推送新值。该设计把 prompt suggestion lifecycle 完全移出 `OpenCodianView`，解决 suggestion 可能早于 `backendSessionId` writeback 到达的 race，同时避免多视图交叉污染
- `destroy()` 时移除 stamped scope (`removePromptSuggestionScope`) 并删除 channel (`deletePromptSuggestionChannel`)，防止 teardown 后残留 DOM attribute 导致 stale cross-talk
- suggestion chip 在以下路径自动隐藏：新用户 turn（`trySubmitCurrentInput` 调用 `clearActiveOnTurnStart`）、sink/backend 清除（`clearPromptSuggestionSink` 触发 `clearAll` + `renderSuggestionBar`）、coordinator destroy、session/conversation 切换

## 图片附件（2026-07-22）
## 输入区最大高度（2026-09-17）

- 文字区增长上限不再硬编码 240px：`syncTextareaHeight()` 改用 host 的 `getComposerTextareaMaxHeight()`（读 `chatAppearance.input.textareaMaxHeight`，归一化范围 120–480），host 未实现时回退 240。CSS 侧 `.opencodian-input` 同步 `max-height: var(--opencodian-composer-max-height, 240px)`。



- 仅在 active backend 声明图片能力时挂载图片按钮、文件选择、输入框粘贴和拖放监听。
- 支持 JPEG、PNG、GIF、WebP；读取为 base64 后展示可移除的缩略图。单张读取失败只显示本地 notice，不会丢弃已成功附加的图片。
- 会话级 drop surface 挂在 composer 输入区域的父容器，而不是小型 composer card；图片拖入时显示“松开以附加图片”，离开、销毁或放下后清理状态。
- prompt 模式中，含图片但文字为空也会提交；图片由 `MessageSendPreparationService` 随同 prompt 进入 backend-aware send pipeline。
- 缩略图为 button，点击交由 `ImagePreviewOverlay`；删除按钮保持独立，避免预览和移除互相抢占。
- 移除最后一张缩略图时，chip 容器（`.opencodian-composer-image-chips`）必须整体从 DOM 移除（与 `clearAttachedImages()` 一致）：空容器残留会带着外边距在有边框的 composer 卡片里渲染成输入区上方的空白条（2026-09-17 shadcn 主题实测踩坑，已加回归测试）。

> 2026-09-18 (R-A7)：图片 drop handler 之前先尝试 vault 路径拖拽——`dataTransfer.getData('text/plain')` 交给宿主的 `addVaultPathContextFromDrop`，**只有被认领的 drop 才 preventDefault**，编辑器内文本拖拽的默认插入行为不受影响；`dataTransfer.getData` 缺失（测试/异常宿主）时安全跳过。

## 维护约束

```typescript
export interface ComposerInputShellCoordinatorHost {
  attachSessionTodo(container: HTMLElement): void;
  attachQuestionDock(container: HTMLElement): void;
  setContextRowElement(element: HTMLElement | null): void;
  setTooltipLabel(element: HTMLElement, label: string, position?: 'bottom' | 'left' | 'right' | 'top'): void;
  getInputPlaceholder(): string;
  getSlashCommandSkillMode(): SlashCommandSkillMode;
  addChosenFileContextToActiveTab(): Promise<void>;
  registerEscapeHandler(handler: () => boolean): void;
  mountSelectionControls(toolbar: HTMLElement, options: { showModels: boolean; showPermissions: boolean }): void;
  mountContextUsageIndicator(container: HTMLElement): void;
  mountEffortSelector(container: HTMLElement): void;
  shouldMountAgentSelector?(): boolean;
  shouldHandleAgentMentions?(): boolean;
  isActiveTabStreaming(): boolean;
  cancelStreaming(): void;
  isTabForegroundBusy(): boolean;
  showProcessingBlockedNotice(): void;
  getComposerInputMode(): 'prompt' | 'shell';
  submitMessage(submission: ComposerInputSubmission, onPreparationOutcome?: (outcome: 'accepted' | 'queued' | 'rejected') => void): void | Promise<void>;
  loadSlashCommandMenuItems(): Promise<SlashCommandMenuItem[]>;
  loadAgentMentionCandidates?(): Promise<AgentMentionCandidate[]>;
  setComposerStackHeight(stackHeight: number): void;
  scheduleSettledScrollToBottomIfNeeded(): void;
  getComposerAvailabilityState?(): {
    kind: 'ready' | 'no-backend' | 'backend-offline';
    title?: string;
    description?: string;
  };
  /** Backend-specific capability chip rendered near the send action (null = no hint). */
  getComposerCapabilityHint?(): { text: string; tooltip?: string; insertText?: string } | null;
  /** Whether the active backend supports image input. */
  hasImageInputCapability?(): boolean;
}

export class ComposerInputShellCoordinator {
  build(container: HTMLElement): void;
  refreshToolbarControls(): void;
  getTabBarSlotEl(): HTMLElement | null;
  getComposerShellEl(): HTMLElement | null;
  getInputWrapperEl(): HTMLElement | null;
  focusInput(): void;
  applyLocaleTexts(): void;
  updateSendButtonState(): void;
  scheduleLayoutSync(): void;
  clearScheduledLayoutSync(): void;
  destroy(): void;
}
```

## 关键行为

- `build()` 一次性组装输入区 shell，并构建 **single-rail composer**：`opencodian-composer-content` 内部为 context strip → textarea → `opencodian-composer-input-row.opencodian-composer-action-zone`。footer 左侧按顺序为附件、permission slot、Agent slot、model slot，最右为 send/stop；context usage 与字数统计位于卡片外的 status bar。textarea 被 `opencodian-input-highlight-container` 包裹，内含 `opencodian-input-highlight-backdrop` 和 textarea 两个同级元素
- 输入位置的直接 child 固定为 `Todo → QuestionDock → input tab slot → Composer`，所以标签是输入框的直接前导，且 Todo 始终在问题卡上方；实际标签是否挂到该 slot 仍由 `ConversationTabRuntimeCoordinator` 的位置设置决定，Header 与标题下方的挂载逻辑不在本模块改动
- `build()` 之后会立即根据 host 的 composer availability state 同步输入壳层；当没有 enabled backend，或当前 backend 虽已启用但运行时不可连接时，textarea / add-context / send 会被禁用，但状态说明不再塞进 input wrapper，而是渲染为 composer 外部的 warning notice。coordinator 会从当前 chat DOM 自己推断活跃消息区与 empty-state notice：空会话继续复用消息区 empty-state notice；已有消息时则在消息区下缘、composer 上方显示 transient availability notice，避免把“当前 backend 不可用”写进输入框本体
- `build()` / `refreshToolbarControls()` 在 footer 挂载子控件后会清理空 slot；当当前 backend 没有 permission/Agent/model/context/effort 控件可显示时，对应空容器会被移除，避免留下无内容间距；refresh 时会同时清理旧的 context usage slot，避免状态栏重复挂载
- `refreshToolbarControls()` 会先销毁旧的 `ChatAgentSelectionCoordinator` DOM，再按最新 host capability gates 重建独立 Agent slot、permission/model controls、context usage 和模型内 effort slot，并立即重算 capability hint，用于 backend 切换时避免不支持的 Agent 或 capability 残留
- `build()` 会预创建脱离 composer 的 `.opencodian-suggestion-bar`，真正显示时通过 `getPromptSuggestionMountTarget()` host seam 把它插到“最后一条 assistant message 之后”；`getPromptSuggestionPlacementRoot()` 提供 `MutationObserver` 监听根，确保消息列表重渲染、hydrate 或 turn 合并后 suggestion 仍能重新贴回最新 assistant turn，而不是掉回 composer 区
- `build()` 设置 textarea 的 scroll 事件监听器，同步 backdrop 的 scrollTop 以保持滚动一致
- `syncHighlightBackdrop()` 读取当前 textarea 内容和 `agentMentionController.resolveMentionPillSpans()` 返回的有效 mention spans，将文本分段拼接为 HTML：普通文本原样转义，`@agent` 段包裹在 `opencodian-input-highlight-agent` span 内，并写入 agent pill metadata；slash 高亮则先依赖已加载的 `slashCommandMenuCatalogItems` 做精确判定，只把 catalog 中真实存在的 `/command`、direct `/skill`，以及 prefixed mode 下存在的 `/skills skill-name` 包裹为高亮 span。普通命令使用 `opencodian-input-highlight-command`，直接或 prefixed skill 使用 `opencodian-input-highlight-skill`，裸 `/skills` 入口仍按 command 语义显示；拼错的 `/using-superpowert` 这类未知 token 不会上色
- `syncTextareaHeight()` 在调整 textarea 高度的同时同步 backdrop 高度
- `buildComposerInputSubmission()` 继续从本模块 re-export，但实现已下沉到 `composerInputParsing.ts`；它会把当前 textarea 文本归一化成结构化 submission：普通文本 -> `prompt`、`/command ...` -> `command`、shell mode -> `shell`
- slash menu 作为 `opencodian-composer-shell` 的 overlay 子节点挂载，用 CSS `bottom: calc(100% + 8px)` 显示在输入框上方，而不是插入 textarea/footer 的内部内容流
- `@agent` menu 复用同一个 overlay 容器；当光标前 token 命中 `@query` 时优先展示 agent 候选，离开该 token 后再恢复 slash query 检测
- `focusInput()` 是唯一的公开 textarea focus seam，供权限和模型选择在成功写入后恢复 composer 输入焦点；它不接管各 selector 的选择或持久化逻辑
- `applyLocaleTexts()` 刷新 placeholder overlay 文本、add-context tooltip 和 send/stop tooltip；textarea 不再设置 `aria-label`，避免在 Obsidian Electron 中产生多余的原生 hover tooltip；host tooltip placement 支持 top/bottom/left/right，composer 当前主要使用 top 以避开鼠标和底部工具栏
- `updateSendButtonState()` 根据 streaming state 切换 send/stop icon 与 class
- **send/stop cancel settle window**（2026-10-21，F2 SEND-STOP-COLLISION）：send 与 stop 是同一坐标上的单个 morphing 控件。取消流式后紧接的点击可能落在过渡态控件上并静默吞掉草稿。现在 send/stop 点击在调用 `cancelStreaming()` 后立即进入 200ms settle window：`updateSendButtonState()` 即刻把控件收敛为当前状态的 affordance（通常已是 send icon），但保持 `disabled`（`updateSendButtonState` 的禁用条件新增 settle pending）；窗口内再次点击被 click handler 直接吞掉，不会二次 cancel 也不会提交。窗口结束时重新渲染：若 turn 已停止则恢复为可点击的 send，若仍在流式（cancel 未生效）则恢复为可点击的 stop。`destroy()` 会清掉挂起的 settle timer
- `updateComposerAvailabilityState()` 消费 host 给出的高层 surface 状态；当状态为 `backend-offline` 时，本模块会本地读取 active backend display name 并渲染带名称的 notice，而不需要 `OpenCodianView` 直接提供 backend 名称。这样“无 backend”和“backend offline”的高层运行时所有权仍留在 `OpenCodianView`，但文案装饰下沉到输入区 owner
- `renderCapabilityHint()` 向 host 查询可选的 `getComposerCapabilityHint()`，若返回非 null 结果则把 `.opencodian-input-capability-hint` 作为独立辅助弹层里的菜单行，并在 `build()`、`applyLocaleTexts()` 与 availability refresh 时刷新；若结果为 null 则移除该 element 并隐藏弹层。host 可选返回 `insertText`，使 hint 变成可点击插入 affordance，而不是单纯文案。当前 fallback hint 是 Claude Code 和 Codex backend 共用的 structured-output chip（OpenCode 不显示）：对用户展示为 compact `{ } JSON`，tooltip 会解释“固定结构返回结果、便于复制到其他工具、点击不会自动发送”，点击后底层仍只向 textarea 前置 `/json `，结构上不污染 OpenCode-only 路径，也不暗示任意 schema authoring
- `refreshSlashCommandMenu()` 只负责调用 `SlashCommandMenuCoordinator.refresh()`；菜单 coordinator 每次 slash query 刷新都会向 host 读取 merged visible menu items，再通过 `slashCommandMenuFilter.ts` 本地过滤。host 背后的 `SlashCommandMenuCatalogCache` 继续负责 TTL / pending promise / hidden-command cache key，因此设置页隐藏命令或切换 skill 模式后不会被 composer 层旧数组挡住，也不会每次按键直接打 SDK
- slash catalog 首次异步加载完成后，coordinator 会重新执行一次 backdrop 高亮同步，这样输入中的已知 slash item 能在 catalog 到位后立即着色，而未知 token 会自动退回普通文本
- `SlashCommandMenuCoordinator` 会把 `getSlashCommandSkillMode()` 传给过滤 helper；direct mode 直接展示 skill，prefixed mode 则顶层展示 `/skills` 并在 `/skills <query>` 下展示 nested skill suggestions
- 若 runtime/project catalog 返回空、过滤后无结果或加载失败，`refreshSlashCommandMenu()` 会渲染非交互式状态行；失败细节只进入 debug log，避免普通输入 `/` 时刷警告
- `tryHandleSlashCommandMenuKeydown()` 只把键盘事件交给 `SlashCommandMenuCoordinator.tryHandleKeydown()`；menu 打开时对 `ArrowUp` / `ArrowDown` / `Enter` / `Tab` / `Escape` 的具体处理在菜单 owner 内完成
- 选中 menu item 后，菜单 coordinator 使用局部替换：从光标位置反向扫描找到 `/xxx` 或 `/skills <query>` 的起始位置，只替换该部分并保留前后的文字；若无法定位则 fallback 为整段替换。prefixed skill suggestion 会写成 `/skills <id> `，真正执行仍留给现有 send pipeline + `SlashCommandExecutionService`
- prefixed mode 下如果先选中顶层 `/skills` 入口，`SlashCommandMenuCoordinator` 会立即保留菜单并切换到 nested skill 列表，而不是先关闭菜单再要求用户手动继续输入
- skill menu 的状态行、badge、来源文案和 item DOM 已下沉到 `slashCommandMenuRenderer.ts`；coordinator 继续只保留当前 query、选中项和事件编排
- `@agent` 的 query / filter / selection / pill span/source span 追踪与原子编辑保护已下沉到 `AgentMentionComposerController.ts`；coordinator 只负责把候选 catalog、textarea 和 overlay 元素接进去
- `@agent` 候选优先使用可选 `loadAgentMentionCandidates()` host seam；稳定 view 路径每次打开候选时重新读取 `loadSlashCommandMenuItems()` 返回的 shared catalog sidecar，避免为了 agent picker 加厚 `OpenCodianView`，同时让 agent hidden 写回后的 cache invalidation 立即生效
- Enter 提交现在先在 coordinator 边界把文本归类成结构化 composer submission，再交给 host 决定 prompt / command / shell 的后续 runtime owner，避免 slash / shell 语义再次退化成“只剩原始字符串”
- 若 command submission 包含 `precedingText`（即 `/command` 出现在行中），coordinator 在提交后仅清空命令部分，将 `precedingText` 保留在 textarea 中，供用户后续决定是否作为普通 prompt 发送
- 如果 prompt submission 中有仍存在的 selected `@agent` mention，coordinator 会附加 `invocationIntent.mentions`；不会把 `@agent` 只当纯文本 fallback，也不会提升用户手写但未选中的 `@name`
- 如果 `ChatAgentSelectionCoordinator` 当前有主 Agent 选择值，coordinator 会把它写入 `invocationIntent.primaryAgent`；`null` 继续表示跟随 OpenCode/project default
- `scheduleLayoutSync()` / `clearScheduledLayoutSync()` 收束 composer stack height 的 RAF 节流
- `destroy()` 释放 textarea/button refs、layout observer 和 context row ownership

## 与 `OpenCodianView` 的边界

- `OpenCodianView` 只创建 coordinator、提供 host callbacks，并把 shell DOM refs 暴露给相邻的 `InputPanelAppearanceCoordinator`
- merged runtime+project composer catalog 由 `OpenCodianView` host seam 通过 `SlashCommandMenuCatalogCache` 预热/缓存后传入，本模块自己不接 project config / SDK merge 细节
- `@agent` 候选由 `SlashCommandMenuCatalogCache` 携带的 sidecar 或测试/扩展用 direct host seam 提供；本模块不直接调用 SDK 或读取 config manager
- 主 Agent selector 由 `ChatAgentSelectionCoordinator` 拥有，并复用 `SlashCommandMenuCatalogCache` 的 default-candidate sidecar；本模块只在 submit 边界读取 selected agent id 并合并进 invocation intent，并把 Obsidian Scope 的 Escape 注册 seam 透传给它，确保 Agent / permission / model 卡共享同一优先级的关闭通道
- slash menu fuzzy scoring 已下沉到 `slashCommandMenuFilter.ts`，状态行/menu DOM 渲染已下沉到 `slashCommandMenuRenderer.ts`，菜单状态/选中/应用行为已下沉到 `SlashCommandMenuCoordinator.ts`；本模块只提供 textarea、menu element、catalog cache 和 layout/highlight callbacks
- shell mode 目前仍是一个 typed seam：coordinator 能产出 `shell` submission，但 stable UI host 还没有把它暴露成默认输入模式
- 既有 send pipeline、question/todo runtime 没有迁入本模块；model / permission selector 状态机 已进一步交给 `ChatSelectionControlsCoordinator`
- liquid-glass adapter mount、SVG filter 与 diagnostics 已进一步交给 `InputPanelAppearanceCoordinator`，本模块继续只负责 shell/layout lifecycle

本模块推进 commands item 6 的 chat-side slash autocomplete slice：把 slash menu DOM、键盘选择和 menu-item 应用留在输入区 owner 内，而 slash execution 仍继续委托给相邻 runtime seam。

## R-C2 扩展

2026-09-18 composer 输入行新增文生图按钮（`opencodian-composer-imagegen-btn`，sparkles 图标），以 host 可选成员 `onRequestImageGeneration?` 门控——未实现即不渲染，不会出现半接线按钮。

## 目录定位（2026-10-23）

- 源码位置：`src/features/chat/services/composer/ComposerInputShellCoordinator.ts`。
- 原位置：`src/features/chat/services/ComposerInputShellCoordinator.ts`；文件名、导出接口与业务职责保持不变。
- 随目录调整更新的依赖：`src/features/chat/services/composer/AgentMentionComposerController.ts`、`src/features/chat/services/selection/ChatAgentSelectionCoordinator.ts`、`src/features/chat/services/composer/composerInputParsing.ts`、`src/features/chat/services/send/MessageSendPreparationService.ts`、`src/features/chat/services/send/PromptSuggestionService.ts`、`src/features/chat/services/commands/SlashCommandMenuCatalogCache.ts`、`src/features/chat/services/commands/SlashCommandMenuCoordinator.ts`。

## 2026-10-26 Composer 可访问名称

Textarea 使用独立、每实例唯一的 visually-hidden 本地化标签，通过 aria-labelledby 关联；视觉 placeholder 继续 aria-hidden 且可随草稿隐藏。名称不会随输入消失，applyLocaleTexts 同步标签文本；不引入会触发宿主原生 tooltip 的 aria-label/title。发送、草稿和跨 tab 所有权不变。

## 2026-10-29 统一 @ 引用

可选 host `loadPromptReferenceCandidates(query)` 与 `getPromptReferenceContextKey()` 将当前后端/Vault/会话的文件、文件夹、会话及有效原生插件能力接入同一个菜单。原生 agent dispatch 能力关闭时，引用菜单仍然可用；Codex 在统一引用入口下不再弹出旧的「不支持 @agent」提示。插件能力是否显示由 host 的有效目录决定。

稳定引用从草稿解析为带 kind/label 的 CodeMirror 原子标签；镜像层使用同一标签。重叠高亮先过滤再交给编辑器，避免文件名中的 slash 技能名破坏引用装饰。鼠标选择通过 host textarea port 插入，不依赖 CodeMirror 内部焦点节点。发送保留稳定身份，引用准备由 send owner 执行。

`ComposerInputShellCoordinator.agentMention.test.ts` 增加原生 agent 能力关闭时的引用菜单和 Codex notice 抑制覆盖；原有 agent intent、slash 菜单、手写文字和删除行为继续回归测试。

## 2026-10-27 单轨 Composer（权限、Agent、模型 · 思考强度）

Composer 正文重新收束为「上下文 chips → textarea」两层；发送上方只有一条底栏，视觉顺序固定为：

1. `+` 附件菜单：添加文件、图片、生成图片、Web Viewer 标签页；沿用原 host seam 与 capability gating。
2. permission / sandbox / runtime badge：由 `ChatSelectionControlsCoordinator` 直接挂载到独立 permission slot，不再放进 Agent 菜单。
3. Agent：由 `ChatAgentSelectionCoordinator` 直接挂载到独立 Agent slot，显示当前选择或默认 Agent，不渲染触发图标。`shouldMountAgentSelector()` 为 false 时整个 slot 为空，不支持 Agent 的后端不会显示占位按钮。
4. 组合模型按钮：显示「模型 · 思考强度」，Chevron 紧跟内容而非被 `margin-left:auto` 推到 send 旁。模型图标优先按模型 ID 解析（DeepSeek、Moonshot、Anthropic 等），聚合网关只作后备；解析失败时隐藏图标，不回退机器人。模型名可截断，effort 保持可读；无 effort 轴时隐藏分隔符。
5. 发送/停止按钮：仍在同一位置切换；cancel settle window、IME Enter、草稿、附件、queued follow-up、context chips 与 per-tab streaming 全部未改。

底部状态栏位于 `.opencodian-composer-shell` 之外：左侧是既有 `ContextRing`，点击仍打开原 `ContextDetailModal`；右侧是字数统计，中间留作后续 session 指标扩展。

`mountSelectionControls(toolbar, options)` 的 options 增加可选 `modelContainer`，permission 挂在独立 toolbar，model selector 挂到模型 slot。shell 不直接调用 `mountEffortSelector`；effort 由 `ChatSelectionControlsCoordinator` 挂在模型弹层下半部。capability hint 留在独立辅助弹层，不影响主控件顺序。

菜单向上展开。窄于 500px 时通过 container query 收紧 permission、Agent 和模型间距，并使用独立 full/short 文本节点显示 effort 短标签（例如「关闭思考」→「关闭」），避免 CSS 伪元素导致读屏重复。

## Goal 与会话工作台（2026-10-30）

上下文圈环右侧增加独立 Goal slot。已预备目标按普通文本提交并保留原文；发送按钮 aria-label 表达目标动作。新增附图和插入草稿公共方法供工作台使用。

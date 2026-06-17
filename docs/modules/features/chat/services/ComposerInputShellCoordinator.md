# ComposerInputShellCoordinator

> **源码**: `src/features/chat/services/ComposerInputShellCoordinator.ts`
> **状态**: [REVIEW]

## 概述

`ComposerInputShellCoordinator` 承接聊天输入区 shell 的 DOM 与 layout lifecycle，避免 `OpenCodianView` 继续直接维护 textarea、自适应高度、send/stop 按钮、slash autocomplete / `@agent` menu 和 composer stack metrics。

该 owner 当前仍是一个大文件，这是有意的：textarea、overlay、focus 恢复和 layout sync 共享同一批 DOM 引用与生命周期，拆散后比本地集中维护更容易引入回归。

它负责：

- 创建 input tab bar slot、assistant-follow-up suggestion row、composer shell、context row、textarea、**layered composer**（context strip → textarea → input-row → runtime-dock），以及挂在 composer shell 上方的 slash menu overlay
- 绑定 textarea Enter 提交、Shift+Enter 换行，以及 textarea 高度同步
- 维护 `opencodian-input-highlight-backdrop`：一个位于 textarea 后方的镜像 div，将已追踪的 `@agent` 提及和已知 slash item 渲染为带样式的 `<span>`；selected `@agent` span 会携带 `data-type="agent"`、`data-name` 和 `data-value`，textarea 文本设为透明（`color: transparent`），仅保留 caret 可见，实现输入框内的富文本高亮而不影响原生复制行为
- 在输入以 `/` 开头且光标仍停留在 command token 内时，把 slash autocomplete session 委托给 `SlashCommandMenuCoordinator`；`/skills <query>` 是允许继续显示 nested skill suggestions 的特殊前缀；加载中、无命令、无匹配或加载失败时保持可见状态提示，避免静默消失
- 在 prompt mode 下把 `@agent` 查询交给 `AgentMentionComposerController`，选中后保留可见 `@name` 文本，并在 submit 时附加 `SurfaceInvocationIntent.mentions`。该 mention 路径由独立的 `shouldHandleAgentMentions` seam 控制，与 agent selector 下拉解耦：Claude Code 即使无 Subagents 能力也保留 mention（有 `loadClaudeRuntimeAgents` 数据源 + 原文保留通路），OpenCode/Codex 仍随能力判断
- 在 `opencodian-composer-runtime-dock` 内挂载 `ChatAgentSelectionCoordinator` 和 selection controls，提供 OpenCode default / primary agent、permission、model、badge 与 effort 控件；提交 prompt 时把该 composer 级选择附加为 `SurfaceInvocationIntent.primaryAgent`，选中后把焦点还给 textarea。agent selector 下拉的挂载由 `shouldMountAgentSelector`（纯 `AgentCapability.Subagents` 能力判断）决定，Claude Code / Codex 不声明该能力故不显示。runtime-dock 位于玻璃壳内部底部，是低视觉权重的状态行，刻入玻璃样式会从 `.opencodian-composer-shell--action-buttons-etched` 自动级联
- 统一处理 submit gate、send/stop affordance、add-context 按钮事件，以及 capability-gated 的图片附件按钮事件
- 通过 `ResizeObserver` + `requestAnimationFrame` 维护 composer stack height，并触发 settled scroll
- 把 selection controls 与 effort 挂到 runtime-dock，把 context usage ring 挂到 submit cluster；add context、image attach 和 capability hint 留在 input-row 的 context actions cluster
- 根据全局插件设置中的 `activeBackend` 调整 placeholder 文案：Codex backend 活跃时显示 `chat.input.placeholderCodex`，其余 backend 使用 host 提供的 placeholder
- 当 host 报告的 composer availability state 为 `backend-offline` 时，从全局插件设置读取当前 backend display name，并使用 `chat.empty.backendOffline.titleWithBackend` / `descriptionWithBackend` 渲染带 backend 名称的外部 notice；这样 `OpenCodianView` 只需返回 generic offline state，backend 命名由输入区 owner 本地 decorate
- 暴露 `refreshToolbarControls()`，允许 backend/capability 切换后只重挂 runtime-dock 内的 toolbar 子控件并同步刷新 capability hint，而不重建 textarea、context row 或 layered input 布局
- 拥有 `PromptSuggestionService` 实例，并将 `.opencodian-suggestion-bar` 挂到最后一条 assistant message 后面；该行语义上表示“这条 assistant 回复的下一步建议”，视觉上紧跟消息本身，而不是出现在 composer footer 或输入区顶部。当存在 active suggestion 时显示可点击的 `.opencodian-suggestion-chip`，点击后仅将 suggestion 文本插入 textarea（不会自动提交），并调用 `acceptActiveSuggestion()` 清除该 suggestion
- 通过**模块级 channel bus** (`promptSuggestionSink.ts`) 与当前会话 backend session id 同步：`build()` 时创建独立 channel (`createPromptSuggestionChannel`)、在 container 上 stamp scope (`stampPromptSuggestionScope`)，并订阅该 channel 的 session 变更 (`onPromptSuggestionSessionChange`)；`TabActivationRuntimeHostProvider` 在 conversation 切换时通过 `findPromptSuggestionScope(messagesContainer)` 发现对应 channel，再经 `emitPromptSuggestionSessionChange(sessionId, channelId)` 推送新值。该设计把 prompt suggestion lifecycle 完全移出 `OpenCodianView`，解决 suggestion 可能早于 `backendSessionId` writeback 到达的 race，同时避免多视图交叉污染
- `destroy()` 时移除 stamped scope (`removePromptSuggestionScope`) 并删除 channel (`deletePromptSuggestionChannel`)，防止 teardown 后残留 DOM attribute 导致 stale cross-talk
- suggestion chip 在以下路径自动隐藏：新用户 turn（`trySubmitCurrentInput` 调用 `clearActiveOnTurnStart`）、sink/backend 清除（`clearPromptSuggestionSink` 触发 `clearAll` + `renderSuggestionBar`）、coordinator destroy、session/conversation 切换

## 公开接口

```typescript
export interface ComposerInputShellCoordinatorHost {
  attachSessionTodo(container: HTMLElement): void;
  attachQuestionDock(container: HTMLElement): void;
  setContextRowElement(element: HTMLElement | null): void;
  setTooltipLabel(element: HTMLElement, label: string, position?: 'bottom' | 'left' | 'right' | 'top'): void;
  getInputPlaceholder(): string;
  getSlashCommandSkillMode(): SlashCommandSkillMode;
  addChosenFileContextToActiveTab(): Promise<void>;
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
  submitMessage(submission: ComposerInputSubmission): void | Promise<void>;
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
  applyLocaleTexts(): void;
  updateSendButtonState(): void;
  scheduleLayoutSync(): void;
  clearScheduledLayoutSync(): void;
  destroy(): void;
}
```

## 关键行为

- `build()` 一次性组装输入区 shell，并构建 **layered composer**：`opencodian-composer-content` 内部为 context strip → textarea → `opencodian-composer-input-row` → `opencodian-composer-runtime-dock`。`opencodian-composer-input-row` 左侧 `opencodian-composer-context-actions` 放 add context、image attach 和 capability hint，右侧 `opencodian-composer-submit-controls` 放 context usage ring 与 send/stop；`opencodian-composer-runtime-dock` 位于 input-row 下方，放 agent/model/permission/badge/effort controls；textarea 被 `opencodian-input-highlight-container` 包裹，内含 `opencodian-input-highlight-backdrop` 和 textarea 两个同级元素
- `build()` 之后会立即根据 host 的 composer availability state 同步输入壳层；当没有 enabled backend，或当前 backend 虽已启用但运行时不可连接时，textarea / add-context / send 会被禁用，但状态说明不再塞进 input wrapper，而是渲染为 composer 外部的 warning notice。coordinator 会从当前 chat DOM 自己推断活跃消息区与 empty-state notice：空会话继续复用消息区 empty-state notice；已有消息时则在消息区下缘、composer 上方显示 transient availability notice，避免把“当前 backend 不可用”写进输入框本体
- `build()` / `refreshToolbarControls()` 在 runtime-dock 挂载 toolbar 子控件后会清理空 slot；当当前 backend 没有 agent/model/permission/context/effort 控件可显示时，整个 `opencodian-input-toolbar` 会被移除（dock 在 `:empty` 时也通过 CSS 隐藏），避免空壳把 add/send 按钮悬在半空；refresh 时会同时清理旧的 context usage slot，避免 submit cluster 重复挂载
- `refreshToolbarControls()` 会先销毁旧的 `ChatAgentSelectionCoordinator` DOM，再按最新 host capability gates 重建 agent selector、model/permission controls、context usage 和 effort slot，并立即重算 capability hint；selection/agent/effort 目标是 runtime-dock，context usage 目标是 submit cluster，用于 Claude Code / OpenCode 切换时同时避免 OpenCode-only agent selector 与 Claude“结构化回复” (`/json`) hint 的残留/延迟消失
- `build()` 会预创建脱离 composer 的 `.opencodian-suggestion-bar`，真正显示时通过 `getPromptSuggestionMountTarget()` host seam 把它插到“最后一条 assistant message 之后”；`getPromptSuggestionPlacementRoot()` 提供 `MutationObserver` 监听根，确保消息列表重渲染、hydrate 或 turn 合并后 suggestion 仍能重新贴回最新 assistant turn，而不是掉回 composer 区
- `build()` 设置 textarea 的 scroll 事件监听器，同步 backdrop 的 scrollTop 以保持滚动一致
- `syncHighlightBackdrop()` 读取当前 textarea 内容和 `agentMentionController.resolveMentionPillSpans()` 返回的有效 mention spans，将文本分段拼接为 HTML：普通文本原样转义，`@agent` 段包裹在 `opencodian-input-highlight-agent` span 内，并写入 agent pill metadata；slash 高亮则先依赖已加载的 `slashCommandMenuCatalogItems` 做精确判定，只把 catalog 中真实存在的 `/command`、direct `/skill`，以及 prefixed mode 下存在的 `/skills skill-name` 包裹为高亮 span。普通命令使用 `opencodian-input-highlight-command`，直接或 prefixed skill 使用 `opencodian-input-highlight-skill`，裸 `/skills` 入口仍按 command 语义显示；拼错的 `/using-superpowert` 这类未知 token 不会上色
- `syncTextareaHeight()` 在调整 textarea 高度的同时同步 backdrop 高度
- `buildComposerInputSubmission()` 继续从本模块 re-export，但实现已下沉到 `composerInputParsing.ts`；它会把当前 textarea 文本归一化成结构化 submission：普通文本 -> `prompt`、`/command ...` -> `command`、shell mode -> `shell`
- slash menu 作为 `opencodian-composer-shell` 的 overlay 子节点挂载，用 CSS `bottom: calc(100% + 8px)` 显示在输入框上方，而不是插入 textarea/footer 的内部内容流
- `@agent` menu 复用同一个 overlay 容器；当光标前 token 命中 `@query` 时优先展示 agent 候选，离开该 token 后再恢复 slash query 检测
- `applyLocaleTexts()` 刷新 placeholder overlay 文本、add-context tooltip 和 send/stop tooltip；textarea 不再设置 `aria-label`，避免在 Obsidian Electron 中产生多余的原生 hover tooltip；host tooltip placement 支持 top/bottom/left/right，composer 当前主要使用 top 以避开鼠标和底部工具栏
- `updateSendButtonState()` 根据 streaming state 切换 send/stop icon 与 class
- `updateComposerAvailabilityState()` 消费 host 给出的高层 surface 状态；当状态为 `backend-offline` 时，本模块会本地读取 active backend display name 并渲染带名称的 notice，而不需要 `OpenCodianView` 直接提供 backend 名称。这样“无 backend”和“backend offline”的高层运行时所有权仍留在 `OpenCodianView`，但文案装饰下沉到输入区 owner
- `renderCapabilityHint()` 向 host 查询可选的 `getComposerCapabilityHint()`，若返回非 null 结果则把 `.opencodian-input-capability-hint` 作为 context actions cluster 里的小按钮，和 add context / image attach 放在同一区域，并在 `build()`、`applyLocaleTexts()` 与 availability refresh 时刷新；若结果为 null 则移除该 element。host 可选返回 `insertText`，使 hint 变成可点击插入 affordance，而不是单纯文案。当前 fallback hint 是 Claude Code 和 Codex backend 共用的 structured-output chip（OpenCode 不显示）：对用户展示为“结构化回复”，tooltip 会解释“固定结构返回结果、便于复制到其他工具、点击不会自动发送”，点击后底层仍只向 textarea 前置 `/json `，结构上不污染 OpenCode-only 路径，也不暗示任意 schema authoring
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
- 主 Agent selector 由 `ChatAgentSelectionCoordinator` 拥有，并复用 `SlashCommandMenuCatalogCache` 的 default-candidate sidecar；本模块只在 submit 边界读取 selected agent id 并合并进 invocation intent
- slash menu fuzzy scoring 已下沉到 `slashCommandMenuFilter.ts`，状态行/menu DOM 渲染已下沉到 `slashCommandMenuRenderer.ts`，菜单状态/选中/应用行为已下沉到 `SlashCommandMenuCoordinator.ts`；本模块只提供 textarea、menu element、catalog cache 和 layout/highlight callbacks
- shell mode 目前仍是一个 typed seam：coordinator 能产出 `shell` submission，但 stable UI host 还没有把它暴露成默认输入模式
- 既有 send pipeline、question/todo runtime 没有迁入本模块；model / permission selector 状态机 已进一步交给 `ChatSelectionControlsCoordinator`
- liquid-glass adapter mount、SVG filter 与 diagnostics 已进一步交给 `InputPanelAppearanceCoordinator`，本模块继续只负责 shell/layout lifecycle

本模块推进 commands item 6 的 chat-side slash autocomplete slice：把 slash menu DOM、键盘选择和 menu-item 应用留在输入区 owner 内，而 slash execution 仍继续委托给相邻 runtime seam。

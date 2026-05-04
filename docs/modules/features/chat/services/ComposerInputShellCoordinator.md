# ComposerInputShellCoordinator

> **源码**: `src/features/chat/services/ComposerInputShellCoordinator.ts`
> **状态**: [REVIEW]

## 概述

`ComposerInputShellCoordinator` 承接聊天输入区 shell 的 DOM 与 layout lifecycle，避免 `OpenCodianView` 继续直接维护 textarea、自适应高度、send/stop 按钮、slash autocomplete / `@agent` menu 和 composer stack metrics。

它负责：

- 创建 input tab bar slot、composer shell、context row、textarea、footer、toolbar slots，以及挂在 composer shell 上方的 slash menu overlay
- 绑定 textarea Enter 提交、Shift+Enter 换行，以及 textarea 高度同步
- 在输入以 `/` 开头且光标仍停留在第一个 command token 内时，显示 slash autocomplete menu；`/skills <query>` 是允许继续显示 nested skill suggestions 的特殊前缀；加载中、无命令、无匹配或加载失败时保持可见状态提示，避免静默消失
- 在 prompt mode 下把 `@agent` 查询交给 `AgentMentionComposerController`，选中后保留可见 `@name` 文本，并在 submit 时附加 `SurfaceInvocationIntent.mentions`
- 在 toolbar slot 内挂载 `ChatAgentSelectionCoordinator`，提供 OpenCode default / primary agent 下拉框；提交 prompt 时把该 composer 级选择附加为 `SurfaceInvocationIntent.primaryAgent`，选中后把焦点还给 textarea
- 统一处理 submit gate、send/stop affordance 和 add-context 按钮事件
- 通过 `ResizeObserver` + `requestAnimationFrame` 维护 composer stack height，并触发 settled scroll
- 把 selection controls/context-usage/effort 这些既有子控件挂到稳定的 toolbar slot

## 公开接口

```typescript
export interface ComposerInputShellCoordinatorHost {
  attachSessionTodo(container: HTMLElement): void;
  attachQuestionDock(container: HTMLElement): void;
  setContextRowElement(element: HTMLElement | null): void;
  setTooltipLabel(...): void;
  getInputPlaceholder(): string;
  getSlashCommandSkillMode(): SlashCommandSkillMode;
  addChosenFileContextToActiveTab(): Promise<void>;
  mountSelectionControls(toolbar: HTMLElement): void;
  mountContextUsageIndicator(container: HTMLElement): void;
  mountEffortSelector(container: HTMLElement): void;
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
}

export class ComposerInputShellCoordinator {
  build(container: HTMLElement): void;
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

- `build()` 一次性组装输入区 shell，并把 toolbar 子控件初始化交回 host seam
- `buildComposerInputSubmission()` 继续从本模块 re-export，但实现已下沉到 `composerInputParsing.ts`；它会把当前 textarea 文本归一化成结构化 submission：普通文本 -> `prompt`、`/command ...` -> `command`、shell mode -> `shell`
- slash menu 作为 `opencodian-composer-shell` 的 overlay 子节点挂载，用 CSS `bottom: calc(100% + 8px)` 显示在输入框上方，而不是插入 textarea/footer 的内部内容流
- `@agent` menu 复用同一个 overlay 容器；当光标前 token 命中 `@query` 时优先展示 agent 候选，离开该 token 后再恢复 slash query 检测
- `applyLocaleTexts()` 刷新 placeholder、add-context tooltip 和 send/stop tooltip
- `updateSendButtonState()` 根据 streaming state 切换 send/stop icon 与 class
- `refreshSlashCommandMenu()` 只在 slash trigger session 首次打开时向 host 拉取 merged visible menu items，后续同一次 `/...` 输入通过 `slashCommandMenuFilter.ts` 本地过滤，避免每次按键都重拉 runtime/project catalog
- `refreshSlashCommandMenu()` 会把 `getSlashCommandSkillMode()` 传给过滤 helper；direct mode 直接展示 skill，prefixed mode 则顶层展示 `/skills` 并在 `/skills <query>` 下展示 nested skill suggestions
- 若 runtime/project catalog 返回空、过滤后无结果或加载失败，`refreshSlashCommandMenu()` 会渲染非交互式状态行；失败细节只进入 debug log，避免普通输入 `/` 时刷警告
- `tryHandleSlashCommandMenuKeydown()` 在 menu 打开时拦截 `ArrowUp` / `ArrowDown` / `Enter` / `Tab` / `Escape`
- 选中 menu item 后，textarea 默认写成 `/<id> `；prefixed skill suggestion 会写成 `/skills <id> `，真正执行仍留给现有 send pipeline + `SlashCommandExecutionService`
- prefixed mode 下如果先选中顶层 `/skills` 入口，coordinator 会立即保留菜单并切换到 nested skill 列表，而不是先关闭菜单再要求用户手动继续输入
- skill menu 的状态行、badge、来源文案和 item DOM 已下沉到 `slashCommandMenuRenderer.ts`；coordinator 继续只保留当前 query、选中项和事件编排
- `@agent` 的 query / filter / selection / source span 追踪已下沉到 `AgentMentionComposerController.ts`；coordinator 只负责把候选 catalog、textarea 和 overlay 元素接进去
- `@agent` 候选优先使用可选 `loadAgentMentionCandidates()` host seam；稳定 view 路径则复用 `loadSlashCommandMenuItems()` 返回的 shared catalog sidecar，避免为了 agent picker 加厚 `OpenCodianView`
- Enter 提交现在先在 coordinator 边界把文本归类成结构化 composer submission，再交给 host 决定 prompt / command / shell 的后续 runtime owner，避免 slash / shell 语义再次退化成“只剩原始字符串”
- 如果 prompt submission 中有仍存在的 selected `@agent` mention，coordinator 会附加 `invocationIntent.mentions`；不会把 `@agent` 只当纯文本 fallback，也不会提升用户手写但未选中的 `@name`
- 如果 `ChatAgentSelectionCoordinator` 当前有主 Agent 选择值，coordinator 会把它写入 `invocationIntent.primaryAgent`；`null` 继续表示跟随 OpenCode/project default
- `scheduleLayoutSync()` / `clearScheduledLayoutSync()` 收束 composer stack height 的 RAF 节流
- `destroy()` 释放 textarea/button refs、layout observer 和 context row ownership

## 与 `OpenCodianView` 的边界

- `OpenCodianView` 只创建 coordinator、提供 host callbacks，并把 shell DOM refs 暴露给相邻的 `InputPanelAppearanceCoordinator`
- merged runtime+project composer catalog 由 `OpenCodianView` host seam 通过 `SlashCommandMenuCatalogCache` 预热/缓存后传入，本模块自己不接 project config / SDK merge 细节
- `@agent` 候选由 `SlashCommandMenuCatalogCache` 携带的 sidecar 或测试/扩展用 direct host seam 提供；本模块不直接调用 SDK 或读取 config manager
- 主 Agent selector 由 `ChatAgentSelectionCoordinator` 拥有，并复用 `SlashCommandMenuCatalogCache` 的 default-candidate sidecar；本模块只在 submit 边界读取 selected agent id 并合并进 invocation intent
- slash menu fuzzy scoring 已下沉到 `slashCommandMenuFilter.ts`，状态行/menu DOM 渲染已下沉到 `slashCommandMenuRenderer.ts`，本模块只消费过滤结果并编排选中/应用行为
- shell mode 目前仍是一个 typed seam：coordinator 能产出 `shell` submission，但 stable UI host 还没有把它暴露成默认输入模式
- 既有 send pipeline、question/todo runtime 没有迁入本模块；model / permission selector 状态机 已进一步交给 `ChatSelectionControlsCoordinator`
- liquid-glass adapter mount、SVG filter 与 diagnostics 已进一步交给 `InputPanelAppearanceCoordinator`，本模块继续只负责 shell/layout lifecycle

本模块推进 commands item 6 的 chat-side slash autocomplete slice：把 slash menu DOM、键盘选择和 menu-item 应用留在输入区 owner 内，而 slash execution 仍继续委托给相邻 runtime seam。

# ComposerInputShellCoordinator

> **源码**: `src/features/chat/services/ComposerInputShellCoordinator.ts`
> **状态**: [REVIEW]

## 概述

`ComposerInputShellCoordinator` 承接聊天输入区 shell 的 DOM 与 layout lifecycle，避免 `OpenCodianView` 继续直接维护 textarea、自适应高度、send/stop 按钮、slash autocomplete menu 和 composer stack metrics。

它负责：

- 创建 input tab bar slot、composer shell、context row、textarea、footer、toolbar slots，以及挂在 composer shell 上方的 slash menu overlay
- 绑定 textarea Enter 提交、Shift+Enter 换行，以及 textarea 高度同步
- 在输入以 `/` 开头且光标仍停留在第一个 command token 内时，显示 slash autocomplete menu；`/skills <query>` 是允许继续显示 nested skill suggestions 的特殊前缀；加载中、无命令、无匹配或加载失败时保持可见状态提示，避免静默消失
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
  submitMessage(message: string): void | Promise<void>;
  loadSlashCommandMenuItems(): Promise<SlashCommandMenuItem[]>;
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
- slash menu 作为 `opencodian-composer-shell` 的 overlay 子节点挂载，用 CSS `bottom: calc(100% + 8px)` 显示在输入框上方，而不是插入 textarea/footer 的内部内容流
- `applyLocaleTexts()` 刷新 placeholder、add-context tooltip 和 send/stop tooltip
- `updateSendButtonState()` 根据 streaming state 切换 send/stop icon 与 class
- `refreshSlashCommandMenu()` 只在 slash trigger session 首次打开时向 host 拉取 merged visible menu items，后续同一次 `/...` 输入通过 `slashCommandMenuFilter.ts` 本地过滤，避免每次按键都重拉 runtime/project catalog
- `refreshSlashCommandMenu()` 会把 `getSlashCommandSkillMode()` 传给过滤 helper；direct mode 直接展示 skill，prefixed mode 则顶层展示 `/skills` 并在 `/skills <query>` 下展示 nested skill suggestions
- 若 runtime/project catalog 返回空、过滤后无结果或加载失败，`refreshSlashCommandMenu()` 会渲染非交互式状态行；失败细节只进入 debug log，避免普通输入 `/` 时刷警告
- `tryHandleSlashCommandMenuKeydown()` 在 menu 打开时拦截 `ArrowUp` / `ArrowDown` / `Enter` / `Tab` / `Escape`
- 选中 menu item 后，textarea 默认写成 `/<id> `；prefixed skill suggestion 会写成 `/skills <id> `，真正执行仍留给现有 send pipeline + `SlashCommandExecutionService`
- `scheduleLayoutSync()` / `clearScheduledLayoutSync()` 收束 composer stack height 的 RAF 节流
- `destroy()` 释放 textarea/button refs、layout observer 和 context row ownership

## 与 `OpenCodianView` 的边界

- `OpenCodianView` 只创建 coordinator、提供 host callbacks，并把 shell DOM refs 暴露给相邻的 `InputPanelAppearanceCoordinator`
- merged runtime+project slash command catalog 由 `OpenCodianView` host seam 通过 `SlashCommandMenuCatalogCache` 预热/缓存后传入，本模块自己不接 project config / SDK merge 细节
- slash menu fuzzy scoring 已下沉到 `slashCommandMenuFilter.ts`，本模块只消费过滤结果并负责状态行/menu DOM 渲染
- 既有 send pipeline、question/todo runtime 没有迁入本模块；model / permission selector 状态机 已进一步交给 `ChatSelectionControlsCoordinator`
- liquid-glass adapter mount、SVG filter 与 diagnostics 已进一步交给 `InputPanelAppearanceCoordinator`，本模块继续只负责 shell/layout lifecycle

本模块推进 commands item 6 的 chat-side slash autocomplete slice：把 slash menu DOM、键盘选择和 menu-item 应用留在输入区 owner 内，而 slash execution 仍继续委托给相邻 runtime seam。

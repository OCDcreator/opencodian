# ComposerInputShellCoordinator

> **源码**: `src/features/chat/services/ComposerInputShellCoordinator.ts`
> **状态**: [REVIEW]

## 概述

`ComposerInputShellCoordinator` 承接聊天输入区 shell 的 DOM 与 layout lifecycle，避免 `OpenCodianView` 继续直接维护 textarea、自适应高度、send/stop 按钮和 composer stack metrics。

它负责：

- 创建 input tab bar slot、composer shell、context row、textarea、footer 和 toolbar slots
- 绑定 textarea Enter 提交、Shift+Enter 换行，以及 textarea 高度同步
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
  addChosenFileContextToActiveTab(): Promise<void>;
  mountSelectionControls(toolbar: HTMLElement): void;
  mountContextUsageIndicator(container: HTMLElement): void;
  mountEffortSelector(container: HTMLElement): void;
  isActiveTabStreaming(): boolean;
  cancelStreaming(): void;
  isTabForegroundBusy(): boolean;
  showProcessingBlockedNotice(): void;
  submitMessage(message: string): void | Promise<void>;
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
- `applyLocaleTexts()` 刷新 placeholder、add-context tooltip 和 send/stop tooltip
- `updateSendButtonState()` 根据 streaming state 切换 send/stop icon 与 class
- `scheduleLayoutSync()` / `clearScheduledLayoutSync()` 收束 composer stack height 的 RAF 节流
- `destroy()` 释放 textarea/button refs、layout observer 和 context row ownership

## 与 `OpenCodianView` 的边界

- `OpenCodianView` 只创建 coordinator、提供 host callbacks，并在外观 / glass 逻辑需要时读取 shell DOM refs
- 既有 send pipeline、question/todo runtime 没有迁入本模块；model / permission selector 状态机 已进一步交给 `ChatSelectionControlsCoordinator`
- liquid-glass adapter mount、SVG filter 和 diagnostics 仍留在 view，等后续 R17 input appearance/glass lane 处理

本模块推进 master plan 的 P1 `OpenCodianView composer input shell` lane：把输入区 DOM、textarea 行为、submit gate 与 layout metrics 从主 view 迁出，并把 selector toolbar 区域留给后续 dedicated owner 接管。

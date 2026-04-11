# ScrollManager

> **源码**: `src/features/chat/services/ScrollManager.ts`
> **状态**: [REVIEW]

## 概述

`ScrollManager.ts` 把聊天消息区里最容易反复出错的滚动辅助逻辑抽成了纯 helper：

- 判断消息容器是否接近底部
- 触发“滚到底部”并同步 programmatic guard
- 捕获重渲前的滚动恢复快照
- 在重渲后按 bottom / anchor / distance 三种模式恢复滚动位置

它不依赖 `OpenCodianView`、`TabManager` 或插件实例，只处理 DOM 元素和轻量状态对象。

## 公开接口

```typescript
export function isElementNearBottom(messagesEl: HTMLElement, threshold?: number): boolean;
export function scrollElementToBottom(
  messagesEl: HTMLElement,
  runtime?: ScrollRuntimeState | null,
  options?: ScrollToBottomOptions,
): void;
export function captureElementScrollRestoreSnapshot(
  messagesEl: HTMLElement,
  shouldStickToBottom: boolean,
  fallbackScrollTop?: number,
): ConversationScrollRestoreSnapshot;
export function restoreElementScrollAfterRender(
  messagesEl: HTMLElement,
  snapshot: ConversationScrollRestoreSnapshot,
  options?: RestoreElementScrollOptions,
): void;
```

## 与 `OpenCodianView` 的关系

- `OpenCodianView` 仍保留“按 tab 找 pane、刷新 sidebar、决定是否 auto-scroll”的视图级判断
- 具体 DOM 滚动读写和 snapshot 算法已转移到这里
- 这让后续继续拆分聊天视图时，可以先复用并单测滚动行为，而不必每次穿透整个 view

# ScrollManager

> **源码**: `src/features/chat/services/ScrollManager.ts`
> **状态**: [REVIEW]

## 概述

`ScrollManager.ts` 把聊天消息区里最容易反复出错的滚动辅助逻辑抽成了纯 helper 和一个有状态调度器：

- 判断消息容器是否接近底部
- 触发"滚到底部"并同步 programmatic guard
- 捕获重渲前的滚动恢复快照
- 把捕获快照与恢复时的 stick-to-bottom 状态、重建后容器实况调和成最终生效快照
- 在重渲后按 bottom / anchor / distance 三种模式恢复滚动位置，并在 anchor 模式下对晚加载内容（图片）做有限窗口的 anchor 重放
- `SettledScrollScheduler` 拥有 double-rAF 帧状态和取消逻辑，供 `TabMessagesPaneCoordinator` 直接调用

它不依赖 `OpenCodianView`、`TabManager` 或插件实例，只处理 DOM 元素和轻量状态对象。

## 公开接口

```typescript
export const LATE_CONTENT_SCROLL_REAPPLY_WINDOW_MS = 1500;

export function isElementNearBottom(messagesEl: HTMLElement, threshold?: number): boolean;
export function armProgrammaticScrollGuard(
  runtime: Pick<ScrollRuntimeState, 'programmaticScrollGuardUntil'>,
  behavior?: ScrollBehavior,
): void;
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
export function adjustScrollRestoreSnapshotForStickiness(
  snapshot: ConversationScrollRestoreSnapshot,
  stickToBottom: boolean,
): ConversationScrollRestoreSnapshot;
export function resolveEffectiveScrollRestoreSnapshot(
  messagesEl: HTMLElement,
  captured: ConversationScrollRestoreSnapshot,
  options: { preserveScrollPosition: boolean; stickToBottom: boolean; userScrollIntent?: boolean },
): ConversationScrollRestoreSnapshot;
export function restoreElementScrollAfterRender(
  messagesEl: HTMLElement,
  snapshot: ConversationScrollRestoreSnapshot,
  options?: RestoreElementScrollOptions,
): void;
export class SettledScrollScheduler {
  schedule(executor: () => void): void;
  clear(): void;
}
```

## 关键行为

- `armProgrammaticScrollGuard()` 从 `scrollElementToBottom()` 中抽出，让 scroll-to-bottom 以外的程序化变更（例如清空 messages container 导致 scrollTop 被钳制并触发 scroll 事件）也能把诱导滚动标记为 programmatic，避免 pane scroll handler 把重建误判为用户滚动、污染 `autoScrollEnabled`
- `adjustScrollRestoreSnapshotForStickiness()` 按恢复时的 stick-to-bottom 修正捕获快照：捕获时贴底但恢复时用户已离开底部，不再拖回底部（有 anchor 降级为 preserve-anchor，否则 preserve-distance），反之亦然
- `resolveEffectiveScrollRestoreSnapshot()` 决定恢复实际应用哪份快照：重建后的 pane 除非用户在重建期间滚动，否则停在 scrollTop 0；非零位置或 pane 记录的 `userScrollIntent`（包含明确滚到 0）都优先于 clear 前快照（近底则贴底，否则就地重捕快照）；`preserveScrollPosition === false` 时强制 bottom
- `restoreElementScrollAfterRender()` 的 `lateContentReapplyWindowMs`（取 `LATE_CONTENT_SCROLL_REAPPLY_WINDOW_MS` = 1500）只在 anchor 模式且带 anchorMessageId 时生效：窗口内以 capture 相位监听容器 `load` 事件并逐帧重放 anchor 位置；最后一次应用后用户滚动（scrollTop 偏离最后应用值）会立即 dispose 纠正，窗口结束自动停止
- `restoreElementScrollAfterRender()` 的首次同步恢复之后会安排一次 deferred rAF；若用户在此期间改变 `scrollTop` 或 runtime 标记 `userScrollIntentDuringHydration`，该帧会取消且不会覆盖用户位置。程序化滚动仍受 `programmaticScrollGuardUntil` 保护。
- `restoreElementScrollAfterRender()` 可通过 `isRestoreCurrent` 绑定 render/pane transaction；初次应用、rAF、late-load 重放和延迟清理都会检查 token，新 render 接管后旧 anchor listener 会被 dispose

## 与 `OpenCodianView` 的关系

- `OpenCodianView` 不再持有 `scrollToBottomFrameId` 或 rAF 取消逻辑；`SettledScrollScheduler` 拥有这些
- `TabMessagesPaneCoordinator` 持有 `SettledScrollScheduler` 实例的引用，在 layout/active-pane 切换时直接调用 `schedule()` 而非回退到宿主回调
- 具体 DOM 滚动读写和 snapshot 算法继续留在这里
- 这让后续继续拆分聊天视图时，可以先复用并单测滚动行为，而不必每次穿透整个 view

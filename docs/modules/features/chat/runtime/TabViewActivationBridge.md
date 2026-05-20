# TabViewActivationBridge

> **源码**: `src/features/chat/runtime/TabViewActivationBridge.ts`
> **状态**: [REVIEW]

## 概述

`TabViewActivationBridge` 把 `OpenCodianView` 中 tab 激活入口里剩余的 pane/UI 预刷新，以及 streaming / empty-tab 激活后的直接 UI outcome 刷新，继续扩展为 loaded-conversation 的 post-render / hydration-tail 轻量 UI writeback bridge：它统一负责切换 active messages pane，并按既有顺序触发 focus preview、composer layout、selector 和 send button 的刷新；其中 activation/open 相邻的 focus preview writeback 现在委托给 `FocusContextPreviewCoordinator`，activation/open 侧的 question dock 与 session todo dock 进一步委托给 `QuestionTodoActivationRefreshCoordinator`，loaded-conversation 的 awaited background-task indicator render 则委托给 `QuestionTodoBackgroundTaskActivationHostAdapter` 提供的 background-task activation port，而 selector 相邻的 context usage identity / snapshot writeback 现在再统一委托给 `ActiveTabContextUsageCoordinator`。

它不负责 conversation/session 写回、hydration 装载、消息区重渲，也不再直接持有 question/todo dock callback、background-task indicator render host、context usage identity/snapshot host，或 status / pending question / todo 三段 lazy refresh；这些仍分别留给 `TabConversationStateBridge`、`ConversationHydrationOutcomeBridge`、render host、`QuestionTodoActivationRefreshCoordinator` / `QuestionTodoStatusRefreshCoordinator`、adapter-owned background-task activation port 与 `ActiveTabContextUsageCoordinator`。bridge 只处理已经决定要激活某个 tab 后必须同步的非 dock UI writeback，其中 hydration 尾段的 layout / selector / context usage refresh 仍收敛在同一边界内，但不接管 hydrate 主流程。

## 公开接口

```typescript
export interface TabViewActivationBridgeHost {
  setActiveMessagesPane(tabId: TabId): void;
  scheduleComposerLayoutSync(): void;
  updateModelSelectorDisplay(): void;
  updateSendButtonState(): void;
}

export class TabViewActivationBridge {
  applyActivationPreflight(tabId: TabId): void;
  applyStreamingActivationOutcome(tabId: TabId, sessionId: string | null): void;
  applyEmptyActivationOutcome(tabId: TabId): void;
  applyLoadedConversationPostRenderOutcome(tabId: TabId | null, sessionId: string | null): Promise<void>;
  applyLoadedConversationHydrationTail(): void;
}
```

## 关键行为

- `applyActivationPreflight()` 保持原有 tab 激活预刷新顺序：先切换 pane，再经由 `FocusContextPreviewCoordinator` 刷新 focus preview，并把 question/todo preflight writeback 交给 `QuestionTodoActivationRefreshCoordinator`
- `applyStreamingActivationOutcome()` 保持 streaming fast-path 的后续刷新顺序：model selector → context usage identity → activation-side question/todo refresh（仅当调用方传入 OpenCode session id）→ send button，其中 context usage identity 已委托给 `ActiveTabContextUsageCoordinator`
- `applyEmptyActivationOutcome()` 保持 empty-tab 清空后的后续刷新顺序：activation-side empty question/todo refresh → model selector → context usage identity → send button，其中 context usage identity 已委托给 `ActiveTabContextUsageCoordinator`
- `applyLoadedConversationPostRenderOutcome()` 接管 loaded conversation 在消息重渲后、scroll restore 之前的 activation/render outcome：先经由 adapter-owned background-task activation port awaited 刷新 background-task indicator，再在调用方传入 OpenCode session id 时复用同一条 activation-side question/todo refresh；非 OpenCode backend 会传 `null` 跳过 OpenCode-only dock 刷新
- `applyLoadedConversationHydrationTail()` 接管 loaded conversation 在 scroll restore 之后的 hydration 尾段 UI 顺序：composer layout sync → model selector → context usage identity，然后把 context usage snapshot fetch 改成后台刷新；这样首开/首个恢复 tab 不会再被慢服务端 snapshot 串行阻塞
- `ConversationViewStateService.activateTab()` 现在只决定激活后走 streaming / hydration / empty-tab 哪条分支，不再直接持有这些 pane-level UI writeback
- `ConversationHydrationOutcomeBridge` 现在负责在消息装载后触发本 bridge 的 loaded-conversation post-render outcome；`ConversationViewStateService.loadConversation()` 继续保留 hydrate 主链路和 scroll restore，但不再直接持有这段 post-render outcome
- `ConversationViewStateService.loadConversation()` 也不再直接持有 composer/model/context usage 这段 hydration 尾部 writeback；activation/open 侧的 dock + supplemental refresh 现在先交给 `QuestionTodoActivationRefreshCoordinator`
- bridge 会为 hydration-tail 的后台 context usage refresh 输出调试耗时日志，方便继续排查 view-open 长尾
- `OpenCodianView` 提供给本 bridge 的 pane/composer/model/send-button host shape 现在先经由 `TabActivationBridgeHostFactory` 统一派生，不再单独维护一份 `createTabViewActivationBridgeHost()` 闭包
- 这样后续如果继续沿 P1 收紧 tab activation ownership，可以在不改动 hydrate 主链路的情况下扩展同一桥接边界

## 与 `OpenCodianView` 的边界

- `OpenCodianView` 继续保留真实的 pane DOM 所有权，以及 question/todo/selector/send-button 的具体渲染实现
- streaming 与 empty-tab activation 的 selector、send-button 刷新顺序，以及 loaded-conversation 的 post-render outcome 触发与 hydration 尾段的 composer/model 写回，现在都由本 bridge 统一编排；activation/open 侧的 question/todo dock 与 supplemental refresh 顺序交给 `QuestionTodoActivationRefreshCoordinator`，background-task indicator render 交给 adapter-owned background-task activation port，context usage identity/snapshot 则交给 `ActiveTabContextUsageCoordinator`
- focus preview 的真实 runtime 刷新不再经由 `OpenCodianView` host callback 直连，而是交给 `FocusContextPreviewCoordinator` 复用 file-open/editor-change 相邻的同一条入口
- `ConversationViewStateService` 只通过本 bridge 触发 activation preflight 与 hydration tail UI 刷新；loaded-conversation 的 post-render outcome 则经由 `ConversationHydrationOutcomeBridge` 复用本 bridge，streaming/empty 分支仍保持原来的 activation 决策
- 这条边界推进的是 master plan 的 P1 `tab / pane / conversation activation` ownership 迁移

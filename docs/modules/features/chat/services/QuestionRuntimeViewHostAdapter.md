# QuestionRuntimeViewHostAdapter

> **源码**: `src/features/chat/services/QuestionRuntimeViewHostAdapter.ts`
> **状态**: [REVIEW]

## 概述

`QuestionRuntimeViewHostAdapter` 负责把 `OpenCodianView` 持有的通用 tab/runtime 回调，与 question 专属依赖（设置、`QuestionDockSlotCoordinator`、OpenCode question API、session-status refresh）组合成 `QuestionRuntimeHostAdapter` 所需的 `QuestionRuntimeViewHost`。

这样 question runtime 的 host bridge 不再继续直接写在 view 里，而是落到一个只负责依赖拼装的 P2 helper。

当前这层 adapter 也会直接复用已有稳定 runtime port：question resolution-card gate 直接读取设置，tab attention 写回直接委托 `TabRuntimeStateBridge`，question resolve 后的 sync follow-up 直接委托 `ConversationSyncBridge`；因此 view 自己只需要继续暴露更窄的 tab/runtime 读取与 scroll pin 能力。

## 公开接口

```typescript
export interface QuestionRuntimeViewHostAdapterHost {
  getActiveTabId(): TabId | null;
  getTabRuntimeState(tabId: TabId | null): QuestionRuntimeState | null;
  ensureTabRuntimeState(tabId: TabId | null): QuestionRuntimeState | null;
  getCurrentConversationSessionId(): string | null | undefined;
  getSessionIdForTab(tabId: TabId | null): string | null | undefined;
  keepQuestionCardPinnedToBottom(tabId: TabId | null): void;
}

export function createQuestionRuntimeViewHostAdapter(...): QuestionRuntimeViewHost;
```

## 关键行为

- 透传 view 自己拥有的 tab/runtime 能力，例如 active tab、runtime state、resolution-card gate、sync follow-up
- 从 `QuestionDockSlotCoordinator` 读取当前 dock instance 与 above-input gate，而不是让 view 重新展开这组桥接
- 从设置读取 `questionDisplayMode` 与 `showAnsweredQuestionCards`，让 resolution-card gate 也不再回到 view
- 从 OpenCode question API 读取 pending question fetch、reply/reject 能力
- 直接复用 `TabRuntimeStateBridge.setNeedsAttention()` 写回 tab attention，而不是让 view 再包一层
- 直接复用 `ConversationSyncBridge.startConversationSyncLoop()` / `syncVisibleConversationInBackground()` 作为 dock resolve 之后的 sync follow-up host
- 复用 `SessionTodoStatusRefreshService.refreshTabSessionStatus()` 作为 dock resolve 之后的 status-refresh host

## 与其它模块的边界

- `OpenCodianView` 只提供更窄的 `QuestionRuntimeViewHostAdapterHost`，不再直接拼 `QuestionRuntimeViewHost`，也不再包装 attention/sync/resolution-card gate 这三类稳定 port
- `QuestionRuntimeHostAdapter` 继续负责真正的 question runtime bundle 装配；本模块只负责准备它消费的 host
- `QuestionDockSlotCoordinator` 继续拥有 slot lifecycle / render trigger；本模块只消费它暴露的 dock/gate port

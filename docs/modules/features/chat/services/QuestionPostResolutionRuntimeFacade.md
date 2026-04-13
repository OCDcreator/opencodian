# QuestionPostResolutionRuntimeFacade

> **源码**: `src/features/chat/services/QuestionPostResolutionRuntimeFacade.ts`
> **状态**: [REVIEW]

## 概述

`QuestionPostResolutionRuntimeFacade` 把 question resolve 之后仍需触发的 **session status refresh、conversation sync loop 重启，以及可见会话的补充 background sync** 收束到一个小型 runtime facade，专门负责：

- 让上方 question dock 与 inline fallback 在回答/拒绝成功后复用同一套 follow-up 编排
- 只保留与 tab/session/runtime state 相关的稳定 port，不让 `QuestionDockCoordinator` 和 `QuestionResolutionFlowCoordinator` 分别持有相同的 sync/status 细节
- 继续复用现有的 session status refresh 与 `ConversationSyncBridge` 能力，而不是把 question resolve 后的运行时收尾重新散落回 view

它不负责 pending-question 队列、inline card DOM、resolved card DOM 或 OpenCode 的 reply/reject 请求；这些仍分别留给 `QuestionDockCoordinator`、`QuestionInlineCardRenderer`、`QuestionResolutionCoordinator` 与 question API。

## 公开接口

```typescript
export interface QuestionPostResolutionRuntimeFacadeHost {
  getActiveTabId(): TabId | null;
  getTabRuntimeState(tabId: TabId | null): { isStreaming: boolean } | null;
  getSessionIdForTab(tabId: TabId | null): string | null | undefined;
  refreshTabSessionStatus(...): Promise<unknown>;
  startConversationSyncLoop(): void;
  syncVisibleConversationInBackground(): Promise<void>;
}

export class QuestionPostResolutionRuntimeFacade {
  followUpAfterResolution(tabId: TabId | null): Promise<void>;
}
```

## 关键行为

- `followUpAfterResolution()` 会先读取目标 tab 的 session id；没有 session 时直接退出，避免 question-only UI 状态误触发后续 sync
- 成功进入 follow-up 后，会继续沿用原有约定：异步刷新 session status、立即重启 conversation sync loop
- 只有当 resolved question 所在 tab 仍是 active tab，且当前 runtime 不处于 streaming 中时，才会继续触发 visible conversation background sync

## 与 question bundle 的边界

- `QuestionDockCoordinator` 现在在 dock 与 inline resolve 成功后统一调用本 facade；`QuestionResolutionFlowCoordinator` 不持有 sync/status follow-up 细节
- `QuestionPostResolutionRuntimeHostAdapter` 负责把共享的 tab/session runtime 读取、`SessionTodoCoordinator` 与 `ConversationSyncBridge` 组合成本 facade 所需的稳定 runtime host，`QuestionRuntimeHostAdapter` 只负责接收并装配它
- `OpenCodianView` 不需要新增 question-specific callback；question resolve 后的 follow-up 继续经由已有 status refresh 与 conversation sync bridge 完成

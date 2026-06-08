# TabConversationStateBridge

> **源码**: `src/features/chat/runtime/TabConversationStateBridge.ts`
> **状态**: [REVIEW]

## 概述

`TabConversationStateBridge` 把 `OpenCodianView` 里剩余的 active-tab conversation/session 写回收束成一个 dedicated bridge：它统一负责把当前 conversation 绑定回激活 tab、同步 OpenCode session、重置会话级 todo/status/pending-question 状态，并在需要时提交新的 sync fingerprint baseline。

它不负责消息区重渲、question dock DOM、background-task indicator DOM，或 tab stream-like badge；这些仍分别留给 `ConversationViewStateService`、`OpenCodianView` 的 render host，以及 `TabRuntimeStateBridge`。

## 公开接口

```typescript
export interface ActivateTabConversationOptions {
  clearRevertState?: boolean;
  resetSessionState?: boolean;
  resetBackgroundTaskSuppressedFingerprint?: boolean;
}

export interface TabConversationStateBridgeHost {
  getTabManager(): { setActiveTabConversation(...) } | null;
  getSessionIdForTab(tabId: TabId | null): string | null;
  setCurrentConversation(conversation: Conversation | null): void;
  setCurrentConversationRevertState(revertState: { messageID: string; partID?: string } | null): void;
  setOpenCodeSessionId(sessionId: string): void;
  applyConversationSessionSettings(conversation: Conversation | null): void;
  clearPendingQuestionsForTab(tabId: TabId | null): void;
  resetTabSessionState(tabId: TabId | null, sessionId: string | null): void;
  clearTabSessionState(tabId: TabId | null): void;
  resetBackgroundTaskSuppressedFingerprint(tabId: TabId | null): void;
  getConversationSyncFingerprint(messages: ChatMessage[]): string;
  setLastConversationSyncFingerprint(fingerprint: string): void;
  startConversationSyncLoop(): void;
  stopConversationSyncLoop(): void;
}

export class TabConversationStateBridge {
  syncActiveTabConversation(conversation: Pick<Conversation, 'id' | 'title'> | null): void;
  applyActiveConversation(tabId: TabId | null, conversation: Conversation, options?: ActivateTabConversationOptions): void;
  clearActiveConversation(tabId: TabId | null): void;
  commitConversationSyncBaseline(messages: ChatMessage[]): void;
}
```

## 关键行为

- `applyActiveConversation()` 统一处理 active-tab conversation 引用、`currentConversation`、session id、conversation session settings runtime reapply 与会话级 runtime reset，避免这些写回继续散落在 `OpenCodianView` 的多条 activation/fork/load 路径里
- session reset 现在使用 `getConversationBackendSessionId()`；只有 conversation 带 legacy `openCodeSessionId` 时才回写 `setOpenCodeSessionId()`，避免非 OpenCode 会话被错误塞进 OpenCode-only runtime slot
- session id 变化时才清掉 pending question，保持原来的跨 conversation wait-state 语义
- `resetSessionState` / `clearActiveConversation()` 现在分别复用 host 上的 `resetTabSessionState()` / `clearTabSessionState()`，把 todo/status 双写回折叠到共享 session todo facade 边界
- `clearActiveConversation()` 在 empty-tab 场景下会同时清空 conversation/session，并把 session settings runtime 恢复到 view 当前的 global default effective state
- `commitConversationSyncBaseline()` 把 fingerprint baseline 与 sync loop 启动收束成一个入口，供 hydration load 和 streaming/current-tab activation 复用

## 与 `OpenCodianView` 的边界

- `OpenCodianView` 现在只保留 activation/render orchestration、本地消息区清理，以及 model/context usage/question dock 的 UI 刷新
- `ConversationViewStateService` 现在通过 `TabConversationActivationBridge.applyLoadedConversationActivation()` 间接复用本 bridge，不再为 loaded-conversation state writeback 额外暴露一层 view host 回调
- `SessionTodoCoordinator` 负责承接本 bridge 的 todo/status reset 写回，因此 bridge 不再依赖 `OpenCodianView` 私有的 session todo helper
- 这条边界主轴仍推进 master plan 的 P1 `tab / pane / conversation activation` ownership，同时复用了本轮 P2 session todo runtime facade

# ConversationSyncBridge

> **源码**: `src/features/chat/services/ConversationSyncBridge.ts`
> **状态**: [REVIEW]

## 概述

`ConversationSyncBridge` 把 `OpenCodianView` 里 visible conversation sync、signal sync 和 background-tab polling sync 的 **callback 装配与 server-sync reason 绑定** 独立出来，专门负责：

- 把 `ConversationSyncOrchestrationService` 的 loop/signal dispatch 回调统一接到同一条 bridge
- 让 visible sync 继续通过 `ConversationSyncRuntimeCoordinator` 获取 active-tab runtime guard
- 为 signal/background sync 统一绑定 server-sync reason，并把 post-sync 路由委托给 dedicated router
- 为 visible sync 只负责 transport callback，post-sync request shaping 与 outcome dispatch 改由 dedicated router 承接

它不负责 tab / conversation 选择，也不负责 runtime lock / baseline fingerprint 判定；这些职责仍分别留在 `ConversationSyncOrchestrationService` 与 `ConversationSyncRuntimeCoordinator`。它也不直接操作消息 DOM，只把 `applySyncedConversationUpdate()` / `renderBackgroundTaskIndicatorIfNeeded()` 这类 render host 保留给 `OpenCodianView`，而这些 host 现在由 `ConversationSyncHostAdapter` 统一装配；view 再通过 `ConversationSyncBridgePortProvider` 把 loop / signal / visible-follow-up 端口分发给相邻 consumer。

## 公开接口

```typescript
export interface ConversationSyncBridgeHost {
  getCurrentConversation(): Conversation | null;
  getTabRuntimeState(tabId: TabId | null): ConversationSyncBridgeRuntime | null;
  syncConversationMessagesFromServer(...): Promise<ConversationSyncBridgeSyncResult>;
  applySyncedConversationUpdate(...): Promise<void>;
  renderBackgroundTaskIndicatorIfNeeded(...): Promise<void>;
}

export class ConversationSyncBridge {
  startConversationSyncLoop(): void;
  stopConversationSyncLoop(): void;
  clearScheduledSignalConversationSync(...): void;
  scheduleConversationSyncFromSignal(...): void;
  syncVisibleConversationInBackground(): Promise<void>;
  syncBackgroundTaskTabsInBackground(): Promise<void>;
}
```

## 关键行为

### visible sync bridge

- `syncVisibleConversationInBackground()` 先复用 `ConversationSyncRuntimeCoordinator.runVisibleConversationSync()`
- server sync 完成后，会把 visible sync context、`previousMessages` 与 `syncResult` 统一委托给 `ConversationSyncVisiblePostSyncRouter`
- bridge 不再内联 visible post-sync request shaping，也不再直接处理 DOM patch / indicator fallback

### signal / background sync bridge

- `scheduleConversationSyncFromSignal()` 不再在 view 里内联拼装 hidden-tab callback，而是统一交给 bridge 组装
- signal sync 会复用 orchestration 提供的 merged reason，并绑定 `sync-event:${reason}` 的 server-sync 标识
- signal/background-tab sync 完成后，bridge 会把 context 与 `syncResult` 委托给 `ConversationSyncBackgroundPostSyncRouter`
- hidden-tab `lastConversationSyncFingerprint` writeback 与 post-sync option shaping 不再留在 bridge 内部

## 与相邻模块的边界

- `ConversationSyncOrchestrationService`：负责 loop 生命周期、signal debounce、tab / conversation 选择与 dispatch
- `ConversationSyncRuntimeCoordinator`：负责 active/hidden tab 的 sync guard、lock 生命周期与 baseline fingerprint
- `ConversationSyncVisiblePostSyncRouter`：负责 visible sync 的 post-sync option shaping、`VisibleConversationPostSyncCoordinator` 调用与 DOM patch / indicator outcome dispatch
- `ConversationSyncBackgroundPostSyncRouter`：负责 signal/background-tab sync 的 option shaping、hidden-tab fingerprint writeback 与 post-sync coordinator 路由
- `VisibleConversationPostSyncCoordinator`：负责 visible sync 完成后的 question/todo refresh 与 current-conversation state-commit
- `BackgroundConversationPostSyncHandoffCoordinator`：负责 hidden/background sync 完成后的 signal state、question/todo/background-task refresh 与 attention handoff
- `ConversationSyncHostAdapter`：负责把 `OpenCodianView` 的单一 sync host 适配成 bridge 所需的 host 形状
- `ConversationSyncBridgePortProvider`：负责把 view 暴露的 flat bridge seam 重组为 loop、signal scheduler 与 visible-follow-up ports
- `OpenCodianView`：只保留 host bridge、flat lifecycle/signal/follow-up seam 与真正依赖 DOM 的 `applySyncedConversationUpdate()` / `renderBackgroundTaskIndicatorIfNeeded()`
- 最近两轮切片继续推进高优先级 sync ownership 收窄：bridge 保持纯粹的 sync transport，而 view-facing 的 loop / signal / visible-follow-up 转发则进一步下沉到 `ConversationSyncBridgePortProvider`

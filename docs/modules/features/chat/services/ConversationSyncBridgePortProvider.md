# ConversationSyncBridgePortProvider

> **源码**: `src/features/chat/services/ConversationSyncBridgePortProvider.ts`
> **状态**: [REVIEW]

## 概述

`ConversationSyncBridgePortProvider` 是夹在 `OpenCodianView` 与 conversation-sync 相邻 consumer 之间的一层薄 facade。它把 view 暴露的一份更扁平的 sync scheduling / visible-follow-up seam，重新分组为三组可复用 ports：

- `getLoopControl()`：提供 `startConversationSyncLoop()` / `stopConversationSyncLoop()`
- `getSignalScheduler()`：提供 signal debounce cleanup 与 `scheduleConversationSyncFromSignal()`
- `getVisibleSyncFollowUp()`：提供 question / post-resolution follow-up 仍需复用的 `startConversationSyncLoop()` + `syncVisibleConversationInBackground()`

它不负责 debounce、reason 绑定、visible/background sync transport，也不负责 tab/conversation 选择；这些行为仍分别留在 `ConversationSyncOrchestrationService` 与 `ConversationSyncBridge`。

## 公开接口

```typescript
export interface ConversationSyncBridgePortProviderHost {
  startConversationSyncLoop(): void;
  stopConversationSyncLoop(): void;
  clearScheduledSignalConversationSync(tabId: TabId | null): void;
  scheduleConversationSyncFromSignal(tabId: TabId | null, reason: SessionSyncEventUpdate['type']): void;
  syncVisibleConversationInBackground(): Promise<void>;
}

export interface ConversationSyncBridgePorts {
  getLoopControl(): ConversationSyncLoopControlPort;
  getSignalScheduler(): ConversationSyncSignalSchedulerPort;
  getVisibleSyncFollowUp(): ConversationSyncVisibleFollowUpPort;
}
```

## 关键行为

- 只做 port regrouping，不新增业务逻辑
- 保持 late-bound 调用，让 grouped ports 始终回到当前 host 暴露的 collaborator
- 让 `OpenCodianView` 不再维护多组 bridge forwarding wrapper，而改由 provider 统一向 activation、message-send、session-signal 与 question follow-up 暴露稳定入口

## 与相邻模块的边界

- `OpenCodianView`：只保留扁平的 conversation-sync lifecycle / signal / visible-follow-up seam
- `ConversationSyncBridge`：继续负责 loop 启停、signal dispatch、visible/background sync transport 与 post-sync router 对接
- `ConversationSyncOrchestrationService`：继续负责 signal debounce timer、tab/conversation 选择与 dispatch
- `TabActivationRuntimeHostProvider`、`ConversationSessionSignalRuntime`、`MessageSendPreparationService`、`QuestionPostResolutionRuntimeHostAdapter`：按需消费 regrouped ports，而不是各自从 view 重新索取 bridge forwarding callback

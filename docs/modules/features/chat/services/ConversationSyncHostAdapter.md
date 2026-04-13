# ConversationSyncHostAdapter

> **源码**: `src/features/chat/services/ConversationSyncHostAdapter.ts`
> **状态**: [REVIEW]

## 概述

`ConversationSyncHostAdapter` 把 `OpenCodianView` 里三段 sync host factory 和对应 service bundle 装配集中到一个模块，专门负责：

- 从单一 `ConversationSyncViewHost` 暴露 `ConversationSyncRuntimeCoordinator`、`ConversationSyncOrchestrationService`、`ConversationSyncBridge` 需要的 host 回调
- 让 runtime/orchestration/bridge 三个服务共享同一套 view-state 读取与 render bridge，而不是继续由 `OpenCodianView` 分散维护三组 `createConversationSync*Host()`
- 在不改变 sync 行为的前提下，把 sync service wiring 从主视图构造函数迁走
- 在 service bundle 内把 background/signal post-sync router 与现有 bridge/coordinator 串联起来

它不拥有任何 sync 业务规则：真正的 runtime lock、loop orchestration、server sync callback 装配与 post-sync 收尾仍分别由现有三个 sync 服务负责。

## 公开接口

```typescript
export interface ConversationSyncViewHost {
  getCurrentConversation(): Conversation | null;
  getActiveTabId(): TabId | null;
  getAllTabs(): readonly TabData[];
  getTab(tabId: TabId): TabData | null;
  getTabRuntimeState(tabId: TabId | null): ConversationSyncSignalRuntime | null;
  getConversationById(id: string): Promise<Conversation | null>;
  getConversationSyncFingerprint(messages: ChatMessage[]): string;
  syncConversationMessagesFromServer(...): Promise<ConversationSyncBridgeSyncResult>;
  applySyncedConversationUpdate(...): Promise<void>;
  renderBackgroundTaskIndicatorIfNeeded(...): Promise<void>;
}

export function createConversationSyncHosts(...): ConversationSyncHosts;
export function createConversationSyncServices(...): ConversationSyncServices;
```

## 关键行为

### shared host assembly

- `createConversationSyncHosts()` 从同一个 `ConversationSyncViewHost` 派生出 runtime/orchestration/bridge 三组 host
- 三组 host 都继续读取同一份 tab runtime、active tab、conversation 查询和 render bridge，避免 view 内部维护重复闭包
- bridge host 仍只暴露 `syncConversationMessagesFromServer()`、`applySyncedConversationUpdate()` 和 `renderBackgroundTaskIndicatorIfNeeded()` 这些真正依赖 view 的入口

### sync service bundle

- `createConversationSyncServices()` 先创建 shared hosts，再顺序实例化 `ConversationSyncRuntimeCoordinator`
- `ConversationSyncOrchestrationService` 继续复用同一个 runtime coordinator 作为 runtime gate
- `createConversationSyncServices()` 会先装配 `ConversationSyncBackgroundPostSyncRouter`
- `ConversationSyncBridge` 继续复用同一个 runtime coordinator、orchestration service、visible post-sync coordinator 与新 router

## 与 `OpenCodianView` 的边界

- `OpenCodianView` 现在只需要提供一份 `ConversationSyncViewHost`，不再直接持有三段 sync host factory 与 service wiring
- `ConversationSyncHostAdapter` 只负责把 view-state / render callback 映射成 sync 服务能消费的 host 形状
- `ConversationSyncRuntimeCoordinator`、`ConversationSyncOrchestrationService`、`ConversationSyncBridge` 的行为边界保持不变
- 这次切片继续推进高优先级 sync/post-sync ownership 收窄：让 bridge/router/coordinator 的装配继续留在 host adapter，而不是回流到主 view

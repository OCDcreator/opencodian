# ConversationSyncHostAdapter

> **源码**: `src/features/chat/services/ConversationSyncHostAdapter.ts`
> **状态**: [REVIEW]

## 概述

`ConversationSyncHostAdapter` 把 `OpenCodianView` 里三段 sync host factory 和对应 service bundle 装配集中到一个模块，专门负责：

- 从单一 `ConversationSyncViewHost` 暴露 `ConversationSyncRuntimeCoordinator`、`ConversationSyncOrchestrationService`、`ConversationSyncBridge` 需要的 host 回调
- 让 runtime/orchestration/bridge 三个服务共享同一套 view-state 读取与 render bridge，而不是继续由 `OpenCodianView` 分散维护三组 `createConversationSync*Host()`
- 在不改变 sync 行为的前提下，把 sync service wiring 从主视图构造函数迁走
- 在 service bundle 内把 visible/background 两个 post-sync router 与各自 dedicated coordinator 串联起来
- 通过 `assembleConversationSyncRuntime` 将 sync load host 派生、sync services 创建、bridge ports 装配合并为一步调用

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
  syncConversationMessagesFromCanonicalState(...): Promise<ConversationSyncBridgeSyncResult | null>;
  applySyncedConversationUpdate(...): Promise<void>;
  renderBackgroundTaskIndicatorIfNeeded(...): Promise<void>;
}

export function createConversationSyncHosts(...): ConversationSyncHosts;
export function createConversationSyncServices(...): ConversationSyncServices;

export interface ConversationSyncRuntimeAssemblyViewHost extends ConversationSyncViewHost {
  loadConversations(): Promise<void>;
  hasInterruptedLocalAssistantTail(messages: ChatMessage[]): boolean;
  setCurrentConversationRevertState(revertState: { messageID: string; partID?: string } | null): void;
}

export function assembleConversationSyncRuntime(deps): ConversationSyncRuntimeAssembly;
```

## 关键行为

### shared host assembly

- `createConversationSyncHosts()` 从同一个 `ConversationSyncViewHost` 派生出 runtime/orchestration/bridge 三组 host
- 三组 host 都继续读取同一份 tab runtime、active tab、conversation 查询和 render bridge，避免 view 内部维护重复闭包
- bridge host 现在同时暴露 `syncConversationMessagesFromServer()` 与 `syncConversationMessagesFromCanonicalState()`，让 `ConversationSyncBridge` 可以在同一套 view seam 上切换 authoritative reload 与 canonical local merge

### sync service bundle

- `createConversationSyncServices()` 先创建 shared hosts，再顺序实例化 `ConversationSyncRuntimeCoordinator`
- `ConversationSyncOrchestrationService` 继续复用同一个 runtime coordinator 作为 runtime gate
- `createConversationSyncServices()` 会把 `VisibleConversationPostSyncCoordinator` 接到 `ConversationSyncVisiblePostSyncRouter`，再把 `BackgroundConversationPostSyncHandoffCoordinator` 直接接到 `ConversationSyncBackgroundPostSyncRouter`
- `ConversationSyncBridge` 继续复用同一个 runtime coordinator、orchestration service，并把 visible/background post-sync 分别委托给两个 router

### full sync assembly

- `assembleConversationSyncRuntime()` 合并了 sync load host 派生、sync services 创建、bridge ports 装配三步
- 内部调用 `createConversationSyncLoadRuntimeHosts` 从 view host 派生 sync host 和 load bridge host
- 内部调用 `createConversationSyncServices` 创建 runtime coordinator、orchestration service、bridge
- 内部从已创建的 bridge 派生 bridge port host，消除了 OpenCodianView 需要先创建 bridge 再创建 ports 的循环依赖
- 返回 `conversationLoadRuntimeBridgeHost` 供 `ConversationLoadRuntimeBridge` 使用

## 与 `OpenCodianView` 的边界

- `OpenCodianView` 通过 `assembleConversationSyncRuntime` 一次性获得 sync services、bridge ports 和 load bridge host，不再分别调用 sync load factory、sync services factory 和 bridge port factory
- `ConversationSyncHostAdapter` 现在拥有完整的 sync runtime assembly lifecycle
- `ConversationSyncRuntimeCoordinator`、`ConversationSyncOrchestrationService`、`ConversationSyncBridge` 的行为边界保持不变

# TabActivationRuntimeViewHostFactory

> **源码**: `src/features/chat/services/TabActivationRuntimeViewHostFactory.ts`
> **状态**: [REVIEW]

## 概述

`TabActivationRuntimeViewHostFactory` 把 tab activation runtime 的 shared host assembly 和 bridge 实例化收束到 dedicated factory。

它有四层职责：

1. **Conversation sync runtime port** (`createTabActivationConversationSyncRuntimePort`): 把 fingerprint writeback 与 loop-control seam 收束为一个 runtime port。
2. **Conversation sync port assembly** (`assembleTabActivationConversationSyncRuntimePort`): 从更简洁的 host 接口一步创建 sync runtime port，内部调用 `createTabActivationConversationSyncRuntimePort`。Host 使用 `setActiveTabConversationSyncFingerprint` 命名替代 `setLastConversationSyncFingerprint`，语义更清晰。
3. **View host assembly** (`createTabActivationRuntimeViewHosts`): 从 grouped view ports 组合成 `TabActivationRuntimeHostAdapterHost`，交给 adapter 派生 activation / conversation-state / runtime-state bridge hosts。
4. **Bridge assembly** (`createTabActivationRuntimeAssembly`): 从 flat deps 直接创建 `TabConversationStateBridge`、`TabViewActivationBridge`、`TabConversationActivationBridge`、`TabRuntimeStateBridge` 四个 bridge 实例。OpenCodianView 不再直接实例化这些 bridge。

## 公开接口

```typescript
export interface TabActivationRuntimeViewHostFactoryHost { ... }
export function createTabActivationRuntimeViewHosts(host): TabActivationRuntimeBridgeHosts;

export interface TabActivationRuntimeAssemblyDeps {
  hostProviderHost: TabActivationRuntimeHostProviderHost;
  focusPreviewRefresh: AssemblyFocusContextPreviewPort;
  questionTodoActivationRefresh: AssemblyQuestionTodoActivationPort;
  backgroundTaskActivationIndicator: AssemblyBackgroundTaskActivationPort;
  activeTabContextUsage: AssemblyActiveTabContextUsagePort;
}

export interface TabActivationRuntimeAssembly {
  tabConversationStateBridge: TabConversationStateBridge;
  tabViewActivationBridge: TabViewActivationBridge;
  tabConversationActivationBridge: TabConversationActivationBridge;
  tabRuntimeStateBridge: TabRuntimeStateBridge;
}

export function createTabActivationRuntimeAssembly(deps): TabActivationRuntimeAssembly;

export interface TabActivationConversationSyncRuntimePortAssemblyHost {
  getConversationSyncFingerprint(messages): string;
  setActiveTabConversationSyncFingerprint(fingerprint), void;
  startConversationSyncLoop(), void;
  stopConversationSyncLoop(), void;
}

export function assembleTabActivationConversationSyncRuntimePort(
  host: TabActivationConversationSyncRuntimePortAssemblyHost,
): TabActivationConversationSyncRuntimePort;
```

## 边界

- `OpenCodianView` 只保留 `createTabActivationRuntimeHostProviderHost` 扁平 seam 实现，不再直接实例化 bridge 对象
- `OpenCodianView` 通过 `assembleTabActivationConversationSyncRuntimePort` 一步创建 sync runtime port，不再直接调用 `createTabActivationConversationSyncRuntimePort` 和手工构建 host
- grouped port 提供由 `TabActivationRuntimeHostProvider` 承担
- 本模块负责把 grouped view ports 组合成共享 activation runtime seam，并进一步组装为 bridge 实例
- `TabActivationRuntimeHostAdapter` 继续负责从共享 seam 派生 `TabActivationBridgeHosts`、`TabConversationStateBridgeHost` 与 `TabRuntimeStateBridgeHost`
- 这条边界推进 master plan 的 P1 activation / sync / runtime bridge ownership，避免 view 继续直接维护完整 adapter host shape

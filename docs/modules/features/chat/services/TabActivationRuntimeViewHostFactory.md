# TabActivationRuntimeViewHostFactory

> **源码**: `src/features/chat/services/TabActivationRuntimeViewHostFactory.ts`
> **状态**: [REVIEW]

## 概述

`TabActivationRuntimeViewHostFactory` 把 `OpenCodianView` 的 tab activation runtime host 装配下沉到一个 dedicated factory。view 现在只提供 late-bound 的 tab runtime、conversation state、question/todo、background task、conversation sync 与 UI writeback 端口；factory 负责组合成 `TabActivationRuntimeHostAdapterHost`，再交给既有 adapter 派生 activation / conversation-state / runtime-state bridge hosts。

它不负责实例化 `TabConversationActivationBridge`、`TabViewActivationBridge`、`TabConversationStateBridge` 或 `TabRuntimeStateBridge`，也不接管 activation 流程编排；这些仍由 `OpenCodianView` 的 service construction 与对应 runtime bridge 持有。本模块只负责 view-facing host seam assembly。

## 公开接口

```typescript
export interface TabActivationRuntimeViewHostFactoryHost {
  getTabRuntime(): TabActivationRuntimeTabPort;
  getConversationState(): TabActivationConversationStatePort;
  getQuestionTodoRuntime(): TabActivationQuestionTodoPort;
  getBackgroundTaskRuntime(): TabActivationBackgroundTaskPort;
  getConversationSyncRuntime(): TabActivationConversationSyncPort;
  getViewWriteback(): TabActivationViewWritebackPort;
}

export function createTabActivationRuntimeViewHosts(
  host: TabActivationRuntimeViewHostFactoryHost,
): TabActivationRuntimeBridgeHosts;
```

## 边界

- `OpenCodianView` 只保留具体 view/service port 的实现与 bridge 实例化顺序
- `TabActivationRuntimeViewHostFactory` 负责把 grouped view ports 组合成共享 activation runtime seam
- `TabActivationRuntimeHostAdapter` 继续负责从共享 seam 派生 `TabActivationBridgeHosts`、`TabConversationStateBridgeHost` 与 `TabRuntimeStateBridgeHost`
- 这条边界推进 master plan 的 P1 activation / sync / runtime bridge ownership，避免 view 继续直接维护完整 adapter host shape

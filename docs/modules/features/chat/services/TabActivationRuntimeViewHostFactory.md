# TabActivationRuntimeViewHostFactory

> **源码**: `src/features/chat/services/TabActivationRuntimeViewHostFactory.ts`
> **状态**: [REVIEW]

## 概述

`TabActivationRuntimeViewHostFactory` 把 tab activation runtime 的 shared host assembly 收束到一个 dedicated factory。现在由 `TabActivationRuntimeHostProvider` 先把 `OpenCodianView` 暴露的扁平 late-bound activation/runtime seam，重新分组为 tab runtime、conversation state、question/todo、background task、conversation sync 与 UI writeback 六组 ports；其中 conversation-sync runtime port 现已并回本模块，直接在 `TabActivationRuntimeViewHostFactory` 内收束 fingerprint writeback 与 loop-control seam。factory 再负责组合成 `TabActivationRuntimeHostAdapterHost`，并交给既有 adapter 派生 activation / conversation-state / runtime-state bridge hosts。

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

- `OpenCodianView` 只保留更扁平的 activation/runtime seam 实现与 bridge 实例化顺序
- grouped port 提供改由 `TabActivationRuntimeHostProvider` 承担
- `TabActivationRuntimeViewHostFactory` 负责把 grouped view ports 组合成共享 activation runtime seam
- `TabActivationRuntimeHostAdapter` 继续负责从共享 seam 派生 `TabActivationBridgeHosts`、`TabConversationStateBridgeHost` 与 `TabRuntimeStateBridgeHost`
- 这条边界推进 master plan 的 P1 activation / sync / runtime bridge ownership，避免 view 继续直接维护完整 adapter host shape

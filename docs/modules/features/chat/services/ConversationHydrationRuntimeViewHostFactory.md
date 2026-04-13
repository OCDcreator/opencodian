# ConversationHydrationRuntimeViewHostFactory

> **源码**: `src/features/chat/services/ConversationHydrationRuntimeViewHostFactory.ts`
> **状态**: [REVIEW]

## 概述

`ConversationHydrationRuntimeViewHostFactory` 把 `OpenCodianView` 里 loaded-conversation hydration 相关的 view-facing host 装配收束到一个 dedicated factory。view 现在只提供 late-bound 的 hydration render、hydration outcome、transition state 与 transition writeback 四组端口；factory 负责把它们重新组合成 `ConversationHydrationRenderBridge`、`ConversationHydrationOutcomeBridge` 与 `ConversationTransitionBridge` 需要的 host。

它不负责实例化 bridge 本身，也不接管 loaded-conversation 的 orchestration、消息重渲、scroll restore 或 activation tail；这些仍分别留给 `OpenCodianView`、`ConversationViewStateService`、对应 runtime bridge，以及 `TabViewActivationBridge` / `TabConversationStateBridge`。本模块只负责 hydration/transition 共享 seam 的 host assembly。

## 公开接口

```typescript
export interface ConversationHydrationRuntimeViewHostFactoryHost {
  getHydrationRenderRuntime(): ConversationHydrationRenderRuntimePort;
  getHydrationOutcomeRuntime(): ConversationHydrationOutcomeRuntimePort;
  getConversationTransitionState(): ConversationTransitionStatePort;
  getConversationTransitionWriteback(): ConversationTransitionWritebackPort;
}

export function createConversationHydrationRuntimeViewHosts(
  host: ConversationHydrationRuntimeViewHostFactoryHost,
): ConversationHydrationRuntimeViewHosts;
```

## 边界

- `OpenCodianView` 只保留 hydration render、hydration outcome 与 transition 相关真实实现，以及 bridge 实例化顺序
- `ConversationHydrationRuntimeViewHostFactory` 负责把这些 grouped view ports 组合成三份 hydration/transition bridge host seam
- `ConversationHydrationRenderBridge`、`ConversationHydrationOutcomeBridge` 与 `ConversationTransitionBridge` 的行为边界保持不变
- 这条边界推进 master plan 的 P1 activation / sync / runtime bridge ownership：让 loaded-conversation hydration/transition 的 host assembly 不再散落在 view 里

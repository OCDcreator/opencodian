# ConversationHydrationRuntimeViewHostFactory

> **源码**: `src/features/chat/services/ConversationHydrationRuntimeViewHostFactory.ts`
> **状态**: [REVIEW]

## 概述

`ConversationHydrationRuntimeViewHostFactory` 把 loaded-conversation hydration 相关的 host 装配，收束到一个 dedicated factory。`OpenCodianView` 现在只提供更扁平的 hydration/transition seam；factory 在模块内部把这份 seam 重新分组为 hydration render、hydration outcome、transition state 与 transition writeback 端口，再组合成 `ConversationHydrationRenderBridge`、`ConversationHydrationOutcomeBridge` 与 `ConversationTransitionBridge` 需要的 host。

它不负责实例化 bridge 本身，也不接管 loaded-conversation 的 orchestration、消息重渲、scroll restore 或 activation tail；这些仍分别留给 `OpenCodianView`、`ConversationViewStateService`、对应 runtime bridge，以及 `TabViewActivationBridge` / `TabConversationStateBridge`。本模块只负责 hydration/transition 共享 seam 的 host assembly。

## 公开接口

```typescript
export interface ConversationHydrationRuntimeViewHost extends
  ConversationHydrationRenderRuntimePort,
  ConversationHydrationOutcomeRuntimePort,
  ConversationTransitionStatePort,
  ConversationTransitionWritebackPort {}

export function createConversationHydrationRuntimeViewHosts(
  host: ConversationHydrationRuntimeViewHost,
): ConversationHydrationRuntimeViewHosts;
```

## 边界

- `OpenCodianView` 只保留扁平 hydration/transition seam 的真实实现，以及 bridge 实例化顺序
- `ConversationHydrationRuntimeViewHostFactory` 直接负责把扁平 seam 重新分组并组合成三份 hydration/transition bridge host seam
- `ConversationHydrationRenderBridge`、`ConversationHydrationOutcomeBridge` 与 `ConversationTransitionBridge` 的行为边界保持不变
- 这条边界推进 master plan 的 P1 activation / sync / runtime bridge ownership：让 loaded-conversation hydration/transition 的 host assembly 不再散落在 view 里

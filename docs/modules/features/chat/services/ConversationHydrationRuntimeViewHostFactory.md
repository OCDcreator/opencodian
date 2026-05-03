# ConversationHydrationRuntimeViewHostFactory

> **源码**: `src/features/chat/services/ConversationHydrationRuntimeViewHostFactory.ts`
> **状态**: [REVIEW]

## 概述

`ConversationHydrationRuntimeViewHostFactory` 把 loaded-conversation hydration 相关的 host 装配，收束到一个 dedicated factory。`OpenCodianView` 现在只提供更扁平的 hydration/transition seam；factory 在模块内部把这份 seam 重新分组为 hydration render、hydration outcome、transition state 与 transition writeback 端口，再组合成 `ConversationHydrationRenderBridge`、`ConversationHydrationOutcomeBridge` 与 `ConversationTransitionBridge` 需要的 host。

它现在也负责实例化这组三个 hydration runtime bridge，但不接管 loaded-conversation 的 orchestration、消息重渲、scroll restore 或 activation tail；这些仍分别留给 `ConversationViewStateService`、对应 runtime bridge，以及 `TabViewActivationBridge` / `TabConversationStateBridge`。本模块只负责 hydration/transition 共享 seam 的 host assembly 与桥接对象打包。

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

export function createConversationHydrationRuntimeBridges(
  host: ConversationHydrationRuntimeViewHost,
  tabConversationStateBridge: TabConversationStateBridge,
  tabViewActivationBridge: TabViewActivationBridge,
): ConversationHydrationRuntimeBridges;

export function assembleConversationHydrationRuntime(
  deps: ConversationHydrationRuntimeAssemblyDeps,
): ConversationHydrationRuntimeBridges;
```

## 边界

- `OpenCodianView` 通过 `assembleConversationHydrationRuntime` 一次性完成 hydration runtime 装配，不再直接调用 `createConversationHydrationRuntimeBridges`，也不再持有独立的 `createConversationHydrationRuntimeViewHost` 方法
- `ConversationHydrationRuntimeViewHostFactory` 拥有完整的 hydration bridge assembly 生命周期：从扁平 seam 到 host 重组，再到 bridge 实例化，全部收束在 factory 模块内
- `ConversationHydrationRenderBridge`、`ConversationHydrationOutcomeBridge` 与 `ConversationTransitionBridge` 的行为边界保持不变；hydration outcome seam 现在额外承接 conversation session visual-state reapply
- 这条边界推进 master plan 的 P1 activation / sync / runtime bridge ownership：让 loaded-conversation hydration/transition 的 host assembly 与 bridge construction 不再散落在 view 里

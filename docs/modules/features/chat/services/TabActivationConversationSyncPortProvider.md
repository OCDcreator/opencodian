# TabActivationConversationSyncPortProvider

> **源码**: `src/features/chat/services/TabActivationConversationSyncPortProvider.ts`
> **状态**: [REVIEW]

## 概述

`TabActivationConversationSyncPortProvider` 是夹在 `OpenCodianView` 与 tab-activation host wiring 之间的一层薄 facade。它把 tab activation 仍需复用的 conversation-sync fingerprint / loop-control seam 收束成一份稳定的 runtime port：

- `getConversationSyncFingerprint()`：读取当前消息集对应的 sync fingerprint
- `setLastConversationSyncFingerprint()`：回写 active-tab runtime 的 sync baseline
- `startConversationSyncLoop()` / `stopConversationSyncLoop()`：复用既有 conversation-sync loop control

这样 `createTabActivationRuntimeHostProviderHost()` 不再直接维护这组 fingerprint writeback forwarding wrapper，只保留对 regrouped runtime port 的引用。

## 公开接口

```typescript
export interface TabActivationConversationSyncRuntimePort {
  getConversationSyncFingerprint(messages: ChatMessage[]): string;
  setLastConversationSyncFingerprint(fingerprint: string): void;
  startConversationSyncLoop(): void;
  stopConversationSyncLoop(): void;
}

export interface TabActivationConversationSyncPortProviderHost {
  getConversationSyncFingerprint(messages: ChatMessage[]): string;
  setLastConversationSyncFingerprint(fingerprint: string): void;
  startConversationSyncLoop(): void;
  stopConversationSyncLoop(): void;
}

export function createTabActivationConversationSyncRuntimePort(
  host: TabActivationConversationSyncPortProviderHost,
): TabActivationConversationSyncRuntimePort;
```

## 边界

- `OpenCodianView`：只保留 fingerprint 读写与 loop control 的扁平 late-bound seam
- `TabActivationConversationSyncPortProvider`：只负责把这组 seam 重新组合成 tab-activation 可复用 runtime port
- `TabActivationRuntimeHostProvider`：继续负责 activation host 的其余 tab/runtime/conversation/question/background/view 分组
- `ConversationSyncBridgePortProvider`：继续负责更通用的 conversation-sync scheduling / signal / visible-follow-up regrouping

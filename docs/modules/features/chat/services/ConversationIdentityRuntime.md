# ConversationIdentityRuntime

> **源码**: `src/features/chat/services/ConversationIdentityRuntime.ts`
> **状态**: [REVIEW]

## 概述

`ConversationIdentityRuntime` 是聊天消息“身份/可见性”相关规则的集中 owner，承接了原先散落在 `OpenCodianView` 内的几类纯运行时逻辑：

- conversation sync / interrupted-sync 日志指纹生成
- 单条消息的 visual signature 计算
- conversation render list 的过滤、assistant merge、live compaction divider 注入与 compaction summary tagging

它只依赖一个很小的 host seam：canonical fingerprint builder、活动 tab id 与 tab context usage。这样 `OpenCodianView` 继续负责 wiring，而 fingerprint / render-shaping 规则本身可以被 sync/render 协调器稳定复用。

## 公开接口

```typescript
export interface ConversationIdentityRuntimeHost {
  getCanonicalConversationFingerprint(messages: ChatMessage[]): string | undefined;
  getActiveTabId(): TabId | null;
  getTabContextUsage(tabId: TabId): { compactingAt?: number | null } | null;
}

export class ConversationIdentityRuntime {
  getConversationSyncFingerprint(messages: ChatMessage[]): string;
  getInterruptedSyncPreservationLogFingerprint(
    conversation: Conversation,
    messages: ChatMessage[],
  ): string;
  getMessageVisualSignature(message: ChatMessage): string;
  getMessagesForRender(messages: ChatMessage[]): ChatMessage[];
  shouldRenderConversationMessage(message: ChatMessage): boolean;
}
```

## 关键行为

- `getConversationSyncFingerprint()` 先调用 host 注入的 canonical fingerprint builder；只有 builder 不可用时才退回原来的 JSON 字段映射，避免 view / service 自己重建 OpenCodeService 的判定逻辑
- `shouldRenderConversationMessage()` 继续隐藏 background-task completion reminder，但保留 notice、question resolution、OMO、compaction divider 等非纯文本消息
- `getMessagesForRender()` 继续串联 `renderGroups.ts` 里的 `buildMessageRenderGroups()` → `mergeAssistantMessagesForRender()` → `injectLiveCompactionDivider()` → `tagCompactionSummaries()`，把 render-list shaping 留在单一 owner 内

## 与 `OpenCodianView` 的边界

- `OpenCodianView` 只负责构造 host，并把现有 host adapter / render service / sync coordinator 回调切到 runtime
- `ConversationAuthoritativeSyncCoordinator`、`ConversationRenderService` 等消费方的接口不变；view 只是把原先 view-private 方法实现换成 runtime delegation
- `renderGroups.ts` 仍保留纯 helper 身份，不上升为新的 coordinator；`ConversationIdentityRuntime` 才是负责把这些 helper 组合成聊天身份规则的 cohesive runtime owner

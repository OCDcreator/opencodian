# ConversationAuthoritativeMessageMergeCoordinator

> **源码**: `src/features/chat/services/ConversationAuthoritativeMessageMergeCoordinator.ts`
> **状态**: [REVIEW]

## 概述

`ConversationAuthoritativeMessageMergeCoordinator` 收束 authoritative sync 里的 message merge 规则，统一负责：

- single-message client-only metadata preservation
- synced conversation message 与本地 assistant `modelId` 的补配
- 移除 `conversation.messages` 对 assistant content / contentBlocks / toolCalls / structured / parts 的并行 truth 补偿
- merge 时的 preservation debug payload 记录

它不负责 server fetch / revert-state / fingerprint / save，也不负责 optimistic user bubble hydration；这些职责仍分别留在 `ConversationAuthoritativeReloadCoordinator` 与 `ConversationAuthoritativeSyncCoordinator`。

## 公开接口

```typescript
export class ConversationAuthoritativeMessageMergeCoordinator {
  mergeClientOnlyMessageFields(...): ChatMessage;
  mergeSyncedConversationMessages(...): ChatMessage[];
}
```

## 关键行为

- `mergeClientOnlyMessageFields()` 现在只保留显式 client-only decoration：`questionResolution` 仍可在 synced message 缺失时沿用，`structured` 只会在 `claude-code` backend 且 synced message 缺失时保留，而 `contextAttachments` 只会对 canonical 仍然存在的 attachment 保留匹配项上的展示元数据；如果 authoritative snapshot 已经没有 attachment，就不会再把本地 attachment 列表整条补回去。
- `mergeSyncedConversationMessages()` 会把 source-message 对齐的 assistant modelId 回填到 synced messages，并在 sourceMessageId 缺失时回退到内容匹配。
- 只有真的保留了 metadata 时，才会继续通过 `logAssistantFinalizationDebug()` 输出 preservation debug payload。

## 与相邻模块的边界

- `ConversationAuthoritativeSyncCoordinator`：把 optimistic user hydration 需要的 single-message merge 委托给本模块
- `ConversationAuthoritativeReloadCoordinator`：把 conversation-level authoritative merge 委托给本模块，不重复实现 field/model merge 规则
- `OpenCodianView`：不直接感知这些 merge 细节，只继续通过 `ConversationAuthoritativeSyncCoordinator` 的 host seam 暴露依赖

# ConversationAuthoritativeMessageMergeCoordinator

> **源码**: `src/features/chat/services/ConversationAuthoritativeMessageMergeCoordinator.ts`
> **状态**: [REVIEW]

## 概述

`ConversationAuthoritativeMessageMergeCoordinator` 收束 authoritative sync 里的 message merge 规则，统一负责：

- single-message client-only field preservation
- synced conversation message 与本地 assistant `modelId` 的补配
- richer local assistant content blocks / tool calls / structured payload 的保留规则
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

- `mergeClientOnlyMessageFields()` 继续保留 context attachment、tool call、structured、parts 与 question resolution 等 client-only payload。
- 当 server assistant 缺少 rich blocks / tool metadata 时，仍优先保留本地更完整的 assistant payload。
- `mergeSyncedConversationMessages()` 会把 source-message 对齐的 assistant modelId 回填到 synced messages，并在 sourceMessageId 缺失时回退到内容匹配。
- preservation debug payload 仍经由原有 host 的 `logAssistantFinalizationDebug()` 输出，不改变现有日志口径。

## 与相邻模块的边界

- `ConversationAuthoritativeSyncCoordinator`：把 optimistic user hydration 需要的 single-message merge 委托给本模块
- `ConversationAuthoritativeReloadCoordinator`：把 conversation-level authoritative merge 委托给本模块，不重复实现 field/model merge 规则
- `OpenCodianView`：不直接感知这些 merge 细节，只继续通过 `ConversationAuthoritativeSyncCoordinator` 的 host seam 暴露依赖

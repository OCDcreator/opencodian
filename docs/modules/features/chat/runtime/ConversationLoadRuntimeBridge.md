# ConversationLoadRuntimeBridge

> **源码**: `src/features/chat/runtime/ConversationLoadRuntimeBridge.ts`
> **状态**: [REVIEW]

## 概述

`ConversationLoadRuntimeBridge` 把 loaded-conversation activation 里原本仍散落在 `ConversationViewStateService` / `OpenCodianView` host surface 上的 conversation resolve 与 server-sync 判定，收束成单独的 runtime bridge：它统一负责按需 reload conversations、重新解析目标 conversation，并在需要时执行 `load-conversation` server sync 与 revert-state 写回。

它不负责 activation preflight、hydration shell、active-tab conversation/session 写回、消息区重渲，或 post-render/question/todo/context usage 刷新；这些仍分别留给 `ConversationTransitionBridge`、`TabConversationStateBridge`、`ConversationViewStateService`、render host 与 `TabViewActivationBridge`。bridge 只承接 loaded-conversation 装载前的数据解析与同步入口。

## 公开接口

```typescript
export interface ConversationLoadRuntimeOptions {
  forceServerSync?: boolean;
}

export interface ResolveConversationOptions {
  reloadIfMissing?: boolean;
}

export interface ConversationLoadRuntimePort {
  resolveConversation(
    id: string,
    options?: ResolveConversationOptions,
  ): Promise<Conversation | null>;
  loadConversationMessages(
    conversation: Conversation,
    tabId: TabId | null,
    options?: ConversationLoadRuntimeOptions,
  ): Promise<ChatMessage[]>;
}
```

## 关键行为

- `resolveConversation()` 默认只做一次已知 conversation 查询，供 streaming activation 之类的快速路径复用
- `resolveConversation(..., { reloadIfMissing: true })` 会在首次 miss 后先触发 `loadConversations()`，再做一次 retry，保持 loaded-conversation hydration 原有的“reload 后再决定是否放弃”语义
- `loadConversationMessages()` 会把 `forceServerSync` 与本地消息状态交给 host 的 sync 判定逻辑，必要时统一走 `syncConversationMessagesFromServer(..., 'load-conversation')`
- server sync 返回 revert state 时，会立即写回 `currentConversationRevertState`，让 loaded-conversation activation 继续复用既有 rewind/revert 语义

## 与 `OpenCodianView` / `ConversationViewStateService` 的边界

- `OpenCodianView` 继续保留真实的 conversation 查询、server sync、interrupted-tail 判定与 revert-state 状态落点，但这些实现现在经由专门的 load-runtime host 暴露，而不再直接混在 `ConversationViewStateService` host surface 里
- `ConversationViewStateService` 现在只负责 restore / activation / hydration 的 orchestration，不再自己决定是否 reload conversation、是否 server sync，或直接持有 `load-conversation` sync 的 revert-state 写回
- 这条边界推进的是 master plan 的 P1 `OpenCodianView` 核心 ownership 迁移：把 loaded-conversation activation 的数据解析/sync 入口从 view-state service 继续收束到 dedicated runtime bridge

# ConversationAuthoritativeReloadCoordinator

> **源码**: `src/features/chat/services/ConversationAuthoritativeReloadCoordinator.ts`
> **状态**: [REVIEW]

## 概述

`ConversationAuthoritativeReloadCoordinator` 把 authoritative conversation reload / auth-sync 这一整段 lifecycle 从 `ConversationAuthoritativeSyncCoordinator` 里收束出来，统一负责：

- server message 拉取、hydrate 与 revert-state 查询
- authoritative merge 前后的 sync begin/fetch/finish debug payload 组装
- interrupted assistant / client-only notice preservation、fingerprint 计算与去重日志
- authoritative message apply、save、background-task authoritative-sync 标记与 active conversation context-usage refresh

它不负责 optimistic user bubble hydration，也不直接决定 client-only field / rich assistant block / modelId 的合并规则；这些职责分别留在 `ConversationAuthoritativeSyncCoordinator` 与 `ConversationAuthoritativeMessageMergeCoordinator`。

## 公开接口

```typescript
export class ConversationAuthoritativeReloadCoordinator {
  syncConversationMessagesFromServer(...): Promise<ConversationAuthoritativeSyncResult>;
}
```

## 关键行为

- `syncConversationMessagesFromServer()` 会先读取 server messages，再统一执行 hydrate、renderable filter、OMO background-task diagnostics 与 authoritative merge。
- merge 之后仍然按 timestamp 排序，并继续复用 per-tab `lastConversationSyncFingerprint` 判断本轮是否真的发生 authoritative 变化。
- preserved interrupted assistants 的日志 fingerprint 仍写回 tab runtime，避免 background/signal sync 重复刷同一条 preservation 日志。
- authoritative 变化发生时才会更新 `conversation.updatedAt` 并保存；无变化时仍会保留当前 message 集合与 fingerprint。
- 失败兜底仍返回当前 conversation messages 与 active conversation revert-state，不改变现有 auth-sync 完成门槛。

## 与相邻模块的边界

- `ConversationAuthoritativeSyncCoordinator`：保留 public facade 与 latest-user hydration owner，并把 conversation reload/auth-sync 委托给本模块
- `ConversationAuthoritativeMessageMergeCoordinator`：提供 client-only field / modelId / rich block merge 规则，本模块只消费其 merge 输出
- `ConversationSyncBridge`：继续负责 visible/signal/background sync transport，不感知本次内部 owner 拆分
- `OpenCodianView`：仍只暴露 server query、runtime fingerprint、context usage refresh 与 render host seam

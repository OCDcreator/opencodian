# ConversationAuthoritativeReloadCoordinator

> **源码**: `src/features/chat/services/ConversationAuthoritativeReloadCoordinator.ts`
> **状态**: [REVIEW]

## 概述

`ConversationAuthoritativeReloadCoordinator` 把 authoritative conversation reload / auth-sync 这一整段 lifecycle 从 `ConversationAuthoritativeSyncCoordinator` 里收束出来，统一负责：

- server message 拉取、hydrate 与 revert-state 查询
- authoritative merge 前后的 sync begin/fetch/finish debug payload 组装
- canonical-derived render input 的 compatibility/cache writeback、受限的本地 metadata 保留，以及 foreground render fingerprint / cache fingerprint 的分离判定
- authoritative message apply、serialized compatibility/cache writeback、background-task authoritative-sync 标记与 active conversation context-usage refresh

它不负责 optimistic user bubble hydration，也不直接决定 client-only field / rich assistant block / modelId 的合并规则；这些职责分别留在 `ConversationAuthoritativeSyncCoordinator` 与 `ConversationAuthoritativeMessageMergeCoordinator`。

## 公开接口

```typescript
export class ConversationAuthoritativeReloadCoordinator {
  syncConversationMessagesFromServer(...): Promise<ConversationAuthoritativeSyncResult>;
  syncConversationMessagesFromCanonicalState(...): Promise<ConversationAuthoritativeSyncResult | null>;
}
```

## 关键行为

- `syncConversationMessagesFromServer()` 会先读取 server messages，再统一执行 hydrate、renderable filter、OMO background-task diagnostics 与 authoritative merge。
- `syncConversationMessagesFromCanonicalState()` 会用 `getConversationBackendSessionId()` 解析 session identity，再把 `OpenCodeService` 的 canonical graph 先重组回 `OpenCodeCanonicalSessionState`，通过 `ConversationTurnViewModelBuilder.buildCanonicalRenderInput()` 生成稳定的 canonical render `ChatMessage[]`，最后复用同一套 renderable filter / merge / fingerprint / save 路径；拿不到 backend session 或 graph 时返回 `null`，由上层 bridge 做 gap recovery。如果当前本地会话刚经历了 `assistant-interrupted-*` timeout notice，而 canonical graph 里还没有挂到该最新 user turn 下的 assistant，本方法也会主动返回 `null`，强制上层回退到 server truth，避免 stale canonical 把延迟到达的 provider 回复永久挡在外面。
- server snapshot / revert 查询仍是 OpenCode-only sync 能力；缺失 backend session id 时返回空 snapshot，不伪造跨 backend history sync。
- `syncConversationMessagesFromServer()` 现在也会先把 raw `[{ info, parts[] }]` snapshot 投影到同一份 canonical render input，再进入 authoritative merge，避免 render path 与 reload path 各自维护一套 message hydrate 顺序。
- merge 之后仍然按 timestamp 排序，并继续复用 per-tab `lastConversationSyncFingerprint` 判断本轮是否真的发生 foreground render authoritative 变化；同时单独比较当前 `Conversation.messages` cache fingerprint，确保 canonical projection 已经是最新输入时仍会写回 stale compatibility cache。
- 只有在 authoritative snapshot 为空时，才继续保留本地 interrupted assistant 作为恢复兜底；如果本轮发送在服务端接受 user message 之前就失败并生成了无 `sourceMessageId` 的本地 error notice，也会保留这一整组本地失败 turn，避免后续 background sync 把用户气泡和错误卡片清空；额外地，若本地只剩 timeout warning notice、而 authoritative snapshot 仍停在“最新 user 已落盘但 assistant 还没回来”的状态，也会继续保留这张 notice，直到 server 真的补回 assistant 为止。
- preserved interrupted assistants 的日志 fingerprint 仍写回 tab runtime，避免 background/signal sync 重复刷同一条 preservation 日志。
- compatibility/cache writeback 通过 host 注入的 conversation write ticket + commit 执行；ticket 过期时跳过本轮 apply，避免 finalization / latest-user hydration / background sync 的异步写入互相覆盖。
- compatibility/cache writeback 变化发生时会更新 `conversation.updatedAt` 并保存；`changed` 仍只表达 foreground render fingerprint 是否变化，避免 finalization / post-sync 把 cache dirty 当成 render drift。
- 失败兜底仍返回当前 conversation messages 与 active conversation revert-state，不改变现有 auth-sync 完成门槛。

## 与相邻模块的边界

- `ConversationAuthoritativeSyncCoordinator`：保留 public facade 与 latest-user hydration owner，并把 conversation reload/auth-sync 委托给本模块
- `ConversationAuthoritativeMessageMergeCoordinator`：提供受限的 client-only metadata / modelId merge 规则，本模块在调用 `mergeSyncedConversationMessages()` 时传入 `conversation.backend`，让 merge coordinator 能只为 `claude-code` 之类已验证的 backend 保留 `structured` 字段
- `ConversationSyncBridge`：继续负责 visible/signal/background sync transport，不感知本次内部 owner 拆分
- `OpenCodianView`：仍只暴露 server query、runtime fingerprint、context usage refresh 与 render host seam

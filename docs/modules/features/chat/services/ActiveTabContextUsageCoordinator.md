# ActiveTabContextUsageCoordinator

> **源码**: `src/features/chat/services/ActiveTabContextUsageCoordinator.ts`
> **状态**: [REVIEW]

## 概述

`ActiveTabContextUsageCoordinator` 把 activation/open 路径里剩余的 **context usage identity writeback + snapshot refresh writeback** 收束成一个更窄的 coordinator。它专门负责：

- 在活动 tab 存在时，根据当前会话模型、模型目录解析结果和当前 conversation 元数据同步 context usage identity
- 在 loaded/open-side refresh 里拉取 session context usage snapshot，并只在 conversation/session 仍匹配时回写精确 token/cost
- 在同一条 snapshot refresh 里把 `Session.time.compacting` 投影到 active-tab context state，复用已有 context usage refresh seam 暴露 compaction live state
- 在无活动 tab 时统一清空 context ring，而不是让 bridge 或 view 分散判断
- 为 `TabViewActivationBridge` 与 `TabConversationActivationBridge` 提供共享的 activation/open-side context usage 边界

它不负责 stream chunk 的 usage 累积、stream begin/complete 标记，或 context ring 详情弹窗；这些职责仍分别留给 `ContextUsageService`、`OpenCodianView` 的 per-tab stream writeback 和 `ContextDetailModal`。它只承接 activation/open 与相邻 sync 路径上的 active-tab identity/snapshot writeback。

> **注意（更新）**：stream lifecycle 方法（`beginTabContextUsageStream`、`completeTabContextUsageStream`、`applyUsageChunkToTab`）、详情弹窗打开（`openContextUsageDetails`）和 indicator 刷新（`refreshContextUsageIndicator`）现已从 `OpenCodianView` 移入本 coordinator。Host 接口相应扩展了 per-tab 操作和 modal 委托端口。

2026-07-22 起，`applyContextUsageSnapshotToTab()` 还接收后端权威快照并立即刷新 active ring，同时按 backend session 独立限频（1 秒）持久化。每个延迟写入都保留 tab ID，因此后台标签页不会把快照写入当前前台 conversation。`syncIdentity()` 会在同一 session 的新通知到达前恢复 `Conversation.lastContextUsage`；没有该快照的旧 Codex 会话保持无精确表盘。

## 公开接口

```typescript
export interface ActiveTabContextUsageCoordinatorHost {
  hasActiveTab(): boolean;
  getCurrentConversation(): ActiveTabContextUsageConversation | null;
  getCurrentSessionModel(): ModelSelectorSelection | null;
  getCurrentSessionModelResolution(): ResolvedModelSelection;
  findKnownModelInfo(selection: ModelSelectorSelection | null): ModelSelectorKnownModelInfo | null;
  getActiveTabContextUsage(): TabContextState | null;
  setActiveTabContextUsage(contextUsage: TabContextState): void;
  renderContextUsageIndicator(state: TabContextState | null): void;
  getSessionContextUsageSnapshot(sessionId: string): Promise<ContextUsageSnapshot | null>;
  hasTab(tabId: string): boolean;
  getTabContextUsage(tabId: TabId | null): TabContextState | null;
  setTabContextUsage(tabId: TabId | null, contextUsage: TabContextState): void;
  getActiveTabId(): TabId | null;
  openContextUsageDetailsModal(contextState: TabContextState | null): void;
}

export class ActiveTabContextUsageCoordinator {
  syncIdentity(): void;
  refreshFromServer(): Promise<void>;
  beginTabContextUsageStream(tabId: TabId | null): void;
  completeTabContextUsageStream(tabId: TabId | null): void;
  applyUsageChunkToTab(tabId: TabId | null, chunk: Extract<StreamChunk, { type: 'usage' }>): void;
  openContextUsageDetails(): void;
  refreshContextUsageIndicator(): void;
}
```

## 关键行为

- `syncIdentity()` 保持原有 selector/context usage identity 的回写语义：先读取当前模型解析结果，再把 provider/model/session 元数据同步到 active tab context state；session identity 通过 `getConversationBackendSessionId()` 解析，以兼容旧 OpenCode 和未来非 OpenCode backend
- `syncIdentity()` 在没有 active tab 时只清空 indicator，不会错误回写旧 tab state
- `refreshFromServer()` 保持原有 stale guard：snapshot 返回后必须再次确认 current conversation id、backend session id 和 active-tab 仍匹配，才会写回精确 tokens/cost
- `refreshFromServer()` 使用 core-owned `ContextUsageSnapshot` DTO；OpenCode 与 Claude Code backend owners 都返回同一形状。本 coordinator 只允许这两个已接入精确 context snapshot 的 backend 发起 server refresh；Codex 等其他 backend 只同步 identity，不触发 OpenCode session API。
- `refreshFromServer()` 现在也会把 snapshot 里的 `compactingAt` 一起写回，并把该字段纳入 debug 指纹，避免 idle polling 时重复刷相同 compaction log
- `refreshFromServer()` 复用 `ContextUsageService.syncStateIdentity()` + `applyPreciseUsage()`，不重新实现 token/cost 汇总规则
- `refreshFromServer()` 会输出 debug 级别耗时日志，并区分 `skipped` / `empty` / `stale` / `committed`
- 这些日志现在通过共享 `shouldEmitLogFingerprint()` 做 payload 指纹限频：同一会话、同一 usage snapshot 的空闲轮询不会继续刷屏，但 usage 变化后会立刻重新输出
- `TabViewActivationBridge` 与 `TabConversationActivationBridge` 现在共享同一条 activation/open-side context usage writeback 边界，而不是分别持有 identity/snapshot host callback

## 与 `OpenCodianView` 的边界

- `OpenCodianView` 继续保留 model catalog / current conversation / tab manager / context ring 的真实所有权
- `ContextUsageService` 继续保留纯 state 变换逻辑；streaming usage chunk 的 begin/apply/complete 现在由本 coordinator 通过 host 的 per-tab 端口编排
- 详情弹窗通过 `host.openContextUsageDetailsModal()` 委托给 `OpenCodianView`，后者持有 `ContextDetailModal` 的完整构造上下文（conversation、systemPrompt、rawMessageLoader）
- indicator 刷新由 `refreshContextUsageIndicator()` 统一处理：从 host 读取 active-tab state，通过 `renderContextUsageIndicator` 回写
- `TabViewActivationBridge` 只保留 pane、layout、selector、send-button 与 loaded post-render 编排，不再直接持有 context usage identity/snapshot host
- `TabViewActivationBridge` 的 loaded-conversation hydration tail 现在只同步 identity，精确 snapshot 改为后台刷新；coordinator 继续负责 stale guard 和回写安全性
- `TabConversationActivationBridge` 只保留 current-tab open shell/outcome 编排，不再直接持有 context usage identity/snapshot host
- 这条边界推进的是 master plan 的 P2 `question / todo / background task` 相邻 activation/open ownership 收敛，同时为后续 P3 context/composer 链路留出更清晰的 context usage seam

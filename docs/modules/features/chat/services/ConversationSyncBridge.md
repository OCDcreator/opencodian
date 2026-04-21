# ConversationSyncBridge

> **源码**: `src/features/chat/services/ConversationSyncBridge.ts`
> **状态**: [REVIEW]

## 概述

`ConversationSyncBridge` 把 `OpenCodianView` 里 visible conversation sync、signal sync 和 background-tab polling sync 的 **callback 装配与 sync source 绑定** 独立出来，专门负责：

- 把 `ConversationSyncOrchestrationService` 的 loop/signal dispatch 回调统一接到同一条 bridge
- 让 visible sync 继续通过 `ConversationSyncRuntimeCoordinator` 获取 active-tab runtime guard
- 为 signal/background sync 区分 canonical local-merge 与 authoritative reload 两条路径，并把 post-sync 路由委托给 dedicated router
- 为 visible sync 只负责 transport callback，post-sync request shaping 与 outcome dispatch 改由 dedicated router 承接

它不负责 tab / conversation 选择，也不负责 runtime lock / baseline fingerprint 判定；这些职责仍分别留在 `ConversationSyncOrchestrationService` 与 `ConversationSyncRuntimeCoordinator`。它也不直接操作消息 DOM，只把 `applySyncedConversationUpdate()` / `renderBackgroundTaskIndicatorIfNeeded()` 这类 render host 保留给 `OpenCodianView`，而这些 host 现在由 `ConversationSyncHostAdapter` 统一装配；view 再通过 `ConversationSyncBridge` 模块内联导出的 port builder 把 loop / signal / visible-follow-up 端口分发给相邻 consumer。

## 公开接口

```typescript
export interface ConversationSyncBridgeHost {
  getCurrentConversation(): Conversation | null;
  syncConversationMessagesFromServer(...): Promise<ConversationSyncBridgeSyncResult>;
  syncConversationMessagesFromCanonicalState(...): Promise<ConversationSyncBridgeSyncResult | null>;
}

export class ConversationSyncBridge {
  startConversationSyncLoop(): void;
  stopConversationSyncLoop(): void;
  clearScheduledSignalConversationSync(...): void;
  scheduleConversationSyncFromSignal(...): void;
  applySessionSyncEvent(...): void;
  syncVisibleConversationInBackground(): Promise<void>;
  syncBackgroundTaskTabsInBackground(): Promise<void>;
}
```

## 关键行为

### visible sync bridge

- `syncVisibleConversationInBackground()` 先复用 `ConversationSyncRuntimeCoordinator.runVisibleConversationSync()`
- visible background sync 现在和 signal sync / background-tab polling 一样先尝试 `syncConversationMessagesFromCanonicalState()`，只有 canonical graph 缺失时才回退 `syncConversationMessagesFromServer()` 做 gap recovery
- sync 完成后，会把 visible sync context、`previousMessages` 与 `syncResult` 统一委托给 `ConversationSyncVisiblePostSyncRouter`
- bridge 不再内联 visible post-sync request shaping，也不再直接处理 DOM patch / indicator fallback

### signal / background sync bridge

- `scheduleConversationSyncFromSignal()` 不再在 view 里内联拼装 hidden-tab callback，而是统一交给 bridge 组装
- `applySessionSyncEvent()` 会把非 `session.diff` 的 message / part sync 直接路由到 canonical graph merge：先尝试从 `OpenCodeService` 的 canonical session graph 生成本地 sync 结果，再复用既有 visible/background post-sync router
- `applySessionSyncEvent()` 现在会直接忽略 `session.diff`，确保 diff 事件不再触发 message reload / authoritative correction
- `syncBackgroundTaskTabsInBackground()` 的 hidden/background-tab polling 也走 canonical-first：先从本地 canonical graph 投影 cache/render output，只有 canonical 缺失时才 server gap recovery
- canonical sync 结果现在也允许携带“可见文本没变、但隐藏 parts / synthetic metadata 已纠偏”的 fingerprint 漂移；是否真正 patch DOM 仍交给后续 render/visual fingerprint owner 决定
- 当 canonical graph 暂时缺口（例如当前 tab 还没拿到该 session snapshot，或 slash/command 刚返回但 sync event 尚未投影）时，bridge 会回退到 `syncConversationMessagesFromServer()` 做 gap recovery；该 server read 会先回填 canonical snapshot，再投影到本地 cache/render 输出
- `scheduleConversationSyncFromSignal()` 仍保留给真正需要 debounce 的 signal reload 场景；`session.diff` 不再经过这条路径
- signal/background-tab sync 完成后，bridge 会把 context 与 `syncResult` 委托给 `ConversationSyncBackgroundPostSyncRouter`
- hidden-tab `lastConversationSyncFingerprint` writeback 与 post-sync option shaping 不再留在 bridge 内部

## 与相邻模块的边界

- `ConversationSyncOrchestrationService`：负责 loop 生命周期、signal debounce、tab / conversation 选择与 dispatch
- `ConversationSyncRuntimeCoordinator`：负责 active/hidden tab 的 sync guard、lock 生命周期与 baseline fingerprint
- `ConversationSyncVisiblePostSyncRouter`：负责 visible sync 的 post-sync option shaping、`VisibleConversationPostSyncCoordinator` 调用与 DOM patch / indicator outcome dispatch
- `ConversationSyncBackgroundPostSyncRouter`：负责 signal/background-tab sync 的 option shaping、hidden-tab fingerprint writeback 与 post-sync coordinator 路由
- `VisibleConversationPostSyncCoordinator`：负责 visible sync 完成后的 question/todo refresh 与 current-conversation state-commit
- `BackgroundConversationPostSyncHandoffCoordinator`：负责 hidden/background sync 完成后的 signal state、question/todo/background-task refresh 与 attention handoff
- `ConversationSyncHostAdapter`：负责把 `OpenCodianView` 的单一 sync host 适配成 bridge 所需的 host 形状
- `ConversationSyncBridge` 模块内联导出的 port builder：负责把 view 暴露的 flat bridge seam 重组为 loop、signal scheduler 与 visible-follow-up ports
- `OpenCodianView`：只保留 host bridge、flat lifecycle/signal/follow-up seam 与真正依赖 DOM 的 `applySyncedConversationUpdate()` / `renderBackgroundTaskIndicatorIfNeeded()`
- 本轮 defragmentation 继续推进高优先级 sync ownership 收窄：bridge 保持纯粹的 sync transport，而 view-facing 的 loop / signal / visible-follow-up 转发已并回 `ConversationSyncBridge` 模块自身

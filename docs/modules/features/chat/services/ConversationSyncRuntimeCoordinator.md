# ConversationSyncRuntimeCoordinator

> **源码**: `src/features/chat/services/ConversationSyncRuntimeCoordinator.ts`
> **状态**: [REVIEW]

## 概述

`ConversationSyncRuntimeCoordinator` 把 `OpenCodianView` 里对话同步入口共用的 runtime guard、`isConversationSyncInFlight` 生命周期，以及 per-tab sync fingerprint baseline 判定独立出来，专门负责：

- 为 visible active-conversation sync 统一检查 active tab、session 可用性，以及 tab runtime 是否仍可发起同步
- 为 signal sync / background-tab sync 统一检查目标 tab runtime，并产出 `previousFingerprint`
- 用同一处 lock/unlock 包裹同步回调，避免这些入口各自手写 `isConversationSyncInFlight = true/false`

它不负责具体的服务端拉取、question/todo/background-task post-sync orchestration，也不负责 tab 枚举、conversation 查询或 signal/background polling dispatch；这些职责现在分别由 `ConversationSyncBridge`、`ConversationSyncOrchestrationService` 与 `BackgroundTaskPostSyncCoordinator` 承接。

## 公开接口

```typescript
export interface ConversationSyncRuntimeCoordinatorHost {
  getActiveTabId(): TabId | null;
  getTabRuntimeState(tabId: TabId | null): ConversationSyncRuntime | null;
  getConversationSyncFingerprint(messages: ChatMessage[]): string;
}

export class ConversationSyncRuntimeCoordinator {
  runVisibleConversationSync(...): Promise<boolean>;
  runTabConversationSync(...): Promise<boolean>;
}
```

## 关键行为

### visible sync 入口

- `runVisibleConversationSync()` 只接受当前 active tab 对应的 conversation
- 当 active tab 缺失、runtime 正在 streaming / 已有 sync 在飞，或 conversation 没有 `openCodeSessionId` 时，会直接跳过
- 真正的 sync 回调结束后，无论成功还是抛错，coordinator 都会负责清理 in-flight flag

### hidden tab sync 入口

- `runTabConversationSync()` 面向 `ConversationSyncOrchestrationService` 分派后的 signal sync 与 background-tab sync 复用
- 当 runtime 已有 `lastConversationSyncFingerprint` 时，直接把它作为 `previousFingerprint`
- 否则回退到 `getConversationSyncFingerprint(conversation.messages)`，保证 attention / post-sync 判断沿用原来的 baseline 语义

## 与 `OpenCodianView` 的边界

- `OpenCodianView` 仍负责暴露 render host；`ConversationSyncBridge` 负责把 runtime coordinator、server sync 和 post-sync 回调装配起来
- `ConversationSyncOrchestrationService` 负责 signal/background polling sync 的 tab/conversation 选择、conversation 加载与 dispatch
- `ConversationSyncRuntimeCoordinator` 只负责“这个 tab 现在能不能进 sync、进入后怎么持有 runtime lock、基线 fingerprint 怎么取”
- `BackgroundTaskPostSyncCoordinator` 继续负责 sync 完成后的 question/todo/background-task 收尾编排
- 这条边界继续服务 master plan 的 P1 `OpenCodianView` sync orchestration lane：sync 入口的 runtime guard / baseline / lock 生命周期归 coordinator，tab / conversation dispatch 归 orchestration service，具体拉取和 UI bridge 才回到 view

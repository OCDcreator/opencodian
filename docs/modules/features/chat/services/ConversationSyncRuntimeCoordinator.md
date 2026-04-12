# ConversationSyncRuntimeCoordinator

> **源码**: `src/features/chat/services/ConversationSyncRuntimeCoordinator.ts`
> **状态**: [REVIEW]

## 概述

`ConversationSyncRuntimeCoordinator` 把 `OpenCodianView` 里对话同步入口共用的 runtime guard、`isConversationSyncInFlight` 生命周期，以及 per-tab sync fingerprint baseline 判定独立出来，专门负责：

- 为 visible active-conversation sync 统一检查 active tab、session 可用性，以及 tab runtime 是否仍可发起同步
- 为 signal sync / background-tab sync 统一检查目标 tab runtime，并产出 `previousFingerprint`
- 用同一处 lock/unlock 包裹同步回调，避免这些入口各自手写 `isConversationSyncInFlight = true/false`

它不负责具体的服务端拉取、question/todo/background-task post-sync orchestration，也不负责 tab 枚举与 conversation 查询；这些职责仍分别留在 `OpenCodianView` 与 `BackgroundTaskPostSyncCoordinator`。

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

- `runTabConversationSync()` 面向 signal sync 与 background-tab sync 复用
- 当 runtime 已有 `lastConversationSyncFingerprint` 时，直接把它作为 `previousFingerprint`
- 否则回退到 `getConversationSyncFingerprint(conversation.messages)`，保证 attention / post-sync 判断沿用原来的 baseline 语义

## 与 `OpenCodianView` 的边界

- `OpenCodianView` 仍负责决定何时发起 visible/signal/background sync，以及 background tab 的枚举和 conversation 加载
- `ConversationSyncRuntimeCoordinator` 只负责“这个 tab 现在能不能进 sync、进入后怎么持有 runtime lock、基线 fingerprint 怎么取”
- `BackgroundTaskPostSyncCoordinator` 继续负责 sync 完成后的 question/todo/background-task 收尾编排
- 这让本轮沿着 master plan 的 P1 `OpenCodianView` sync orchestration lane，继续把共享运行时入口逻辑从主 view 挪到 dedicated coordinator，而不是把 guard / baseline / lock 生命周期散落在三个 sync 方法里

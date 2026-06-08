# ConversationSyncRuntimeCoordinator

> **源码**: `src/features/chat/services/ConversationSyncRuntimeCoordinator.ts`
> **状态**: [REVIEW]
> **最近更新**: Sync lock now advances writable tab lifecycle

## 概述

`ConversationSyncRuntimeCoordinator` 把 `OpenCodianView` 里对话同步入口共用的 runtime guard、`isConversationSyncInFlight` 兼容 flag 生命周期、`TabSessionLifecycleState` sync transition，以及 per-tab sync fingerprint baseline 判定独立出来，专门负责：

- 为 visible active-conversation sync 统一检查 active tab、session 可用性，以及 tab runtime 是否仍可发起同步
- 为 signal sync / background-tab sync 统一检查目标 tab runtime，并产出 `previousFingerprint`
- 用同一处 lock/unlock 包裹同步回调，避免这些入口各自手写 `isConversationSyncInFlight = true/false`
- 在进入/退出 sync lock 时推进 `TabSessionLifecycleState`：进入 `syncing`，退出回到 `idle`

它不负责具体的服务端拉取、question/todo/background-task post-sync orchestration，也不负责 tab 枚举、conversation 查询或 signal/background polling dispatch；这些职责现在分别由 `ConversationSyncBridge`、`ConversationSyncOrchestrationService`、`ConversationSyncVisiblePostSyncRouter` 与 `ConversationSyncBackgroundPostSyncRouter` 承接。它依赖的 host 也改由 `ConversationSyncHostAdapter` 统一装配，而不是继续留在 `OpenCodianView` 内部分散创建。

## 公开接口

```typescript
export interface ConversationSyncRuntimeCoordinatorHost {
  getActiveTabId(): TabId | null;
  getTabRuntimeState(tabId: TabId | null): ConversationSyncRuntime | null;
  getConversationSyncFingerprint(messages: ChatMessage[]): string;
  transitionTabSessionLifecycle(tabId: TabId | null, phase: WritableTabSessionPhase, reason: string): boolean;
}

export interface ConversationSyncTimeoutDiagnostic {
  readonly tabId: TabId;
  readonly conversationId: string;
  readonly openCodeSessionId?: string;
  readonly backendSessionId?: string;
  readonly ageMs: number;
  readonly phase: string;
  readonly reason: string | null;
  readonly isStreaming: boolean;
}

export interface ConversationSyncRuntimeCoordinatorOptions {
  readonly syncTimeoutMs?: number;
  readonly onSyncTimeout?: (diagnostic: ConversationSyncTimeoutDiagnostic) => void;
  readonly now?: () => number;
  readonly setTimeout?: (callback: () => void, delayMs: number) => ReturnType<typeof setTimeout>;
  readonly clearTimeout?: (handle: ReturnType<typeof setTimeout>) => void;
}

export class ConversationSyncRuntimeCoordinator {
  constructor(host: ConversationSyncRuntimeCoordinatorHost, options?: ConversationSyncRuntimeCoordinatorOptions);
  runVisibleConversationSync(...): Promise<boolean>;
  runTabConversationSync(...): Promise<boolean>;
}
```

## 关键行为

### visible sync 入口

- `runVisibleConversationSync()` 只接受当前 active tab 对应的 conversation
- 当 active tab 缺失、runtime 正在 streaming / 已有 sync 在飞，或 conversation 没有任何 backend session id 时，会直接跳过
- 真正的 sync 回调结束后，无论成功还是抛错，coordinator 都会负责清理 in-flight flag
- sync lock enter 会调用 `transitionTabSessionLifecycle(tabId, 'syncing', 'conversation-sync-lock')`
- sync lock release 会调用 `transitionTabSessionLifecycle(tabId, 'idle', 'conversation-sync-lock-release')`
- `syncing` 现在是 foreground-busy phase，因为 authoritative sync 可能写入 `Conversation.messages` compatibility/cache，必须阻止 foreground send 与其他 lifecycle writes 交错
- 默认 20 秒 sync timeout diagnostics 只观测 lock：超时时记录 tab/conversation/OpenCode legacy session/backend session identity、lock age、当前 lifecycle phase/reason 与 `isStreaming`；不会自动清理 `isConversationSyncInFlight`
- sync timeout payload 中的 `openCodeSessionId` 现在显式回退到 `undefined`（而不是把 `null` 误传为 truthy），与 `backendSessionId` 共同构成完整的 backend-neutral session identity 诊断字段。
- timeout timer 会在原始 sync callback settle 后由既有 `finally` 路径清除；真正恢复边界仍是 callback settle 后释放 lock

### hidden tab sync 入口

- `runTabConversationSync()` 面向 `ConversationSyncOrchestrationService` 分派后的 signal sync 与 background-tab sync 复用
- 当 runtime 已有 `lastConversationSyncFingerprint` 时，直接把它作为 `previousFingerprint`
- 否则回退到 `getConversationSyncFingerprint(conversation.messages)`，保证 attention / post-sync 判断沿用原来的 baseline 语义

## 与 `OpenCodianView` 的边界

- `OpenCodianView` 仍负责暴露 render host；`ConversationSyncBridge` 负责把 runtime coordinator、server sync 和 post-sync 回调装配起来
- `ConversationSyncHostAdapter` 负责把 `OpenCodianView` 的单一 sync host 适配成 runtime coordinator 所需的 host 形状
- `ConversationSyncOrchestrationService` 负责 signal/background polling sync 的 tab/conversation 选择、conversation 加载与 dispatch
- `ConversationSyncRuntimeCoordinator` 只负责“这个 tab 现在能不能进 sync、进入后怎么持有 runtime lock、如何推进 tab lifecycle、基线 fingerprint 怎么取”
- `ConversationSyncVisiblePostSyncRouter` 与 `ConversationSyncBackgroundPostSyncRouter` 继续负责 sync 完成后的 visible/background post-sync 路由
- 这条边界继续服务 master plan 的 P1 `OpenCodianView` sync orchestration lane：sync 入口的 runtime guard / baseline / lock 生命周期归 coordinator，tab / conversation dispatch 归 orchestration service，具体拉取和 UI bridge 才回到 view

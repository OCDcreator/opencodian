# QuestionTodoBackgroundTaskViewHostFactory

> **源码**: `src/features/chat/services/QuestionTodoBackgroundTaskViewHostFactory.ts`
> **状态**: [REVIEW]

## 概述

`QuestionTodoBackgroundTaskViewHostFactory` 把 `OpenCodianView` 里 question / todo / background-task activation 与 post-sync 共用的 view-level state writeback 收束成单一 host factory，专门负责：

- 从一份更窄的 `QuestionTodoBackgroundTaskViewHostFactoryHost` 同时派生 refresh-side 与 activation-side adapter host
- 复用 `getCurrentConversation()` 与 `syncBackgroundTaskStateFromConversation()` 这类跨入口共享的 read/write seam，避免 view 继续维护两段几乎平行的 host factory
- 把 `currentConversationRevertState` / sync fingerprint 写回、session todo dock render，以及 background-task indicator reset / render trigger 收敛到同一个 P2 host-assembly 模块

它不接管 question/todo/background-task 的业务规则；真正的 activation refresh、post-sync refresh 与 indicator rebuild 顺序仍分别留在既有 coordinator / host-adapter 模块里。

## 公开接口

```typescript
export interface QuestionTodoBackgroundTaskViewHostFactoryHost {
  getCurrentConversation(): Conversation | null;
  getTabRuntimeState(tabId: TabId | null): QuestionTodoStatusRefreshRuntime | null;
  syncBackgroundTaskStateFromConversation(...): void;
  setCurrentConversationRevertState(...): void;
  setTabConversationSyncFingerprint(...): void;
  renderSessionTodoDock(tabId: TabId | null): void;
  resetBackgroundTaskIndicator(): void;
  renderBackgroundTaskIndicatorIfNeeded(tabId: TabId | null): Promise<void>;
}

export function createQuestionTodoBackgroundTaskViewHosts(
  host: QuestionTodoBackgroundTaskViewHostFactoryHost,
): QuestionTodoBackgroundTaskViewHosts;
```

## 关键行为

- `createQuestionTodoBackgroundTaskViewHosts()` 以单一 host 为输入，同时返回 `refreshViewHostAdapterHost` 与 `activationViewHostAdapterHost`
- refresh-side host 只暴露 post-sync/question-todo 状态刷新需要的 current-conversation、runtime、background-task rebuild 与 sync-state writeback
- activation-side host 只暴露 dock render、indicator reset 与 render trigger，但继续复用同一份 current-conversation/background-task rebuild seam
- `OpenCodianView` 因此不再分别维护 `createQuestionTodoBackgroundTaskRefreshViewHostAdapterHost()` 与 `createQuestionTodoBackgroundTaskActivationViewHostAdapterHost()` 两条平行闭包链

## 与相邻模块的边界

- `QuestionTodoBackgroundTaskRefreshHostAdapter` 继续负责 post-sync question/todo/background-task service bundle 装配
- `QuestionTodoBackgroundTaskActivationHostAdapter` 继续负责 activation-side dock / indicator coordinator bundle 装配
- 这次切片推进的是 master plan 的 P2 `question / todo / background task` lane：进一步把 activation 与 post-sync 入口共用的 host wiring 从 `OpenCodianView` 移到 dedicated factory

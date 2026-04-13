# QuestionTodoActivationRefreshBridge

> **源码**: `src/features/chat/services/QuestionTodoActivationRefreshBridge.ts`
> **状态**: [REVIEW]

## 概述

`QuestionTodoActivationRefreshBridge` 把 activation/open 路径里那段稳定的 **session status + pending question + session todo supplemental refresh** 单独收束成一个更窄的 bridge。它专门负责：

- 在 streaming activation、loaded-conversation post-render、current-tab open 后并行启动 status、pending-question、todo 三条 lazy refresh
- 让 `QuestionTodoActivationRefreshCoordinator` 只负责 dock writeback 顺序，不再依赖同时承接 post-sync 规则的 coordinator
- 复用 `SessionTodoStatusRefreshService` 与 `QuestionDockCoordinator` 的既有刷新入口，而不是在 activation bridge host 上重新暴露三组 callback

它不负责 activation preflight、question/todo dock render、post-sync runtime gate、background-task rebuild 或 completion notice flush；这些职责仍分别留给 `QuestionTodoActivationRefreshCoordinator`、`QuestionTodoStatusRefreshCoordinator` 与 post-sync 相关 coordinator/facade。

## 公开接口

```typescript
export interface QuestionTodoActivationRefreshBridgeHost {
  refreshPendingQuestionsForTab(...): Promise<QuestionRequest[]>;
  refreshTabSessionStatus(...): Promise<SessionActivityStatus | null>;
  refreshTabSessionTodos(...): Promise<SessionTodo[]>;
}

export class QuestionTodoActivationRefreshBridge {
  refreshAfterActivation(tabId: TabId | null, sessionId: string | null | undefined): Promise<void>;
}
```

## 关键行为

- `refreshAfterActivation()` 保持原来的 activation/open fast path 语义：同步启动 status、pending-question、todo 三个 lazy refresh，不等待其中一个完成后才发起下一个
- bridge 不持有任何 runtime gate；activation 侧始终沿用旧行为直接触发这三条 refresh
- 它只暴露 activation 需要的窄 host，避免 post-sync 专属的 runtime/todo gate 数据继续泄漏到 activation 协调层

## 与 `OpenCodianView` 的边界

- `QuestionTodoBackgroundTaskRefreshHostAdapter` 现在从 shared refresh view host 派生本 bridge 需要的三条 callback，并把实例返回给 activation-side wiring
- `QuestionTodoActivationRefreshCoordinator` 通过本 bridge 触发 supplemental refresh，自身只保留 dock render/writeback 顺序
- `QuestionTodoStatusRefreshCoordinator` 则收窄为 post-sync question/todo/status refresh gate，不再同时承接 activation fast path
- 这条边界推进的是 master plan 的 P2 `question / todo / background task` lane：把 activation 与 post-sync 之间共享但职责不同的 refresh seam 显式拆开

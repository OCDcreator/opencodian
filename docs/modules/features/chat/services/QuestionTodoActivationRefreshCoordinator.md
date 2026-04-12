# QuestionTodoActivationRefreshCoordinator

> **源码**: `src/features/chat/services/QuestionTodoActivationRefreshCoordinator.ts`
> **状态**: [REVIEW]

## 概述

`QuestionTodoActivationRefreshCoordinator` 把 activation/open 路径里反复出现的 **question dock render + session todo dock writeback + supplemental status/question/todo refresh** 收束成一个更窄的 P2 coordinator。它专门负责：

- 在 tab activation preflight 时统一触发 question dock render 与 todo dock 的 tab 切换写回
- 在 streaming activation、loaded-conversation post-render、current-tab open 之后统一触发 todo dock render → question dock render → `QuestionTodoStatusRefreshCoordinator.refreshAfterActivation()`
- 让 `TabViewActivationBridge` 与 `TabConversationActivationBridge` 复用同一条 activation-side question/todo refresh 链，而不是各自直接拼装这些调用

它不负责 pane 切换、消息容器清空、background-task indicator、selector/context usage、conversation/session state writeback，或 post-sync background-task follow-up；这些仍分别由 activation bridge、state bridge、background-task coordinator 与 view host 承接。

## 公开接口

```typescript
export interface QuestionTodoActivationRefreshCoordinatorHost {
  renderQuestionDock(): void;
  updateSessionTodoDockForTab(tabId: TabId): void;
  renderSessionTodoDock(tabId: TabId | null): void;
}

export class QuestionTodoActivationRefreshCoordinator {
  applyActivationPreflight(tabId: TabId): void;
  applyConversationActivation(tabId: TabId | null, sessionId: string | null | undefined): void;
  applyEmptyActivation(tabId: TabId): void;
}
```

## 关键行为

- `applyActivationPreflight()` 保持原来的 preflight 顺序：question dock → todo dock tab writeback
- `applyConversationActivation()` 保持原来的 activation/open 顺序：todo dock render → question dock render → supplemental refresh
- `applyEmptyActivation()` 只刷新 empty-tab 需要的两个 dock，不触发 supplemental refresh

## 与 `OpenCodianView` 的边界

- `OpenCodianView` 只提供更窄的 host：question dock slot render、session todo dock render/update
- `TabViewActivationBridge` 不再直接持有 question/todo dock host 回调，只保留 pane、layout、selector、context usage、send button 与 background-task indicator writeback
- `TabConversationActivationBridge` 不再直接持有 question/todo dock host 回调，只在 current-tab open 路径复用本 coordinator
- 本模块推进的是 master plan 的 P2 `question / todo / background task` lane：把 activation/open 侧残留在 bridge host surface 上的 question/todo writeback 再下沉一层

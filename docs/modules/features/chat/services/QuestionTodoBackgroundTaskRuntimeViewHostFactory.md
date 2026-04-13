# QuestionTodoBackgroundTaskRuntimeViewHostFactory

> **源码**: `src/features/chat/services/QuestionTodoBackgroundTaskRuntimeViewHostFactory.ts`
> **状态**: [REVIEW]

## 概述

`QuestionTodoBackgroundTaskRuntimeViewHostFactory` 把 question / todo / background-task activation 与 post-sync 相邻的共享 view-host 装配收束到一个 dedicated factory。现在由 `QuestionTodoBackgroundTaskRuntimeHostProvider` 先把 `OpenCodianView` 暴露的扁平 late-bound runtime seam 重新分组为 conversation state、question/todo refresh runtime、activation writeback 与 background-task runtime 四组端口；factory 负责：

- 先组合出共享的 `VisibleConversationPostSyncStateViewHost`
- 再派生 `QuestionTodoBackgroundTaskRefreshHostAdapter`、`BackgroundConversationPostSyncHandoffHostAdapter` 与 `QuestionTodoBackgroundTaskActivationHostAdapter` 需要的三个 view host
- 让 `OpenCodianView` 不再内联 shared host 与三段 adapter 依赖装配

它不负责实例化 `VisibleConversationPostSyncCoordinator`、`QuestionTodoActivationRefreshBridge`、`BackgroundConversationPostSyncHandoffCoordinator` 或 activation-side coordinator；这些现在由 `QuestionTodoBackgroundTaskRuntimeServiceBundle` 按既有顺序继续装配。这个 factory 只负责 question/todo/background-task 共享 runtime seam 的 host assembly。

## 公开接口

```typescript
export interface QuestionTodoBackgroundTaskRuntimeViewHostFactoryHost {
  getConversationState(): QuestionTodoBackgroundTaskConversationStatePort;
  getQuestionTodoRefreshRuntime(): QuestionTodoBackgroundTaskRefreshRuntimePort;
  getQuestionTodoActivationWriteback(): QuestionTodoBackgroundTaskActivationWritebackPort;
  getBackgroundTaskRuntime(): QuestionTodoBackgroundTaskBackgroundRuntimePort;
}

export function createQuestionTodoBackgroundTaskRuntimeViewHosts(
  host: QuestionTodoBackgroundTaskRuntimeViewHostFactoryHost,
): QuestionTodoBackgroundTaskRuntimeViewHosts;
```

## 边界

- `OpenCodianView` 只保留更扁平的 runtime seam；grouped port 提供改由 `QuestionTodoBackgroundTaskRuntimeHostProvider` 承担，再把后续 service 实例化顺序交给 `QuestionTodoBackgroundTaskRuntimeServiceBundle`
- `QuestionTodoBackgroundTaskRuntimeViewHostFactory` 负责把 grouped port 重新组合成 visible-state、refresh、background handoff、activation 四条共享 host seam
- `QuestionTodoBackgroundTaskRefreshHostAdapter`、`BackgroundConversationPostSyncHandoffHostAdapter`、`QuestionTodoBackgroundTaskActivationHostAdapter` 的业务边界保持不变
- 这次切片推进的是 master plan 的 P2 `question / todo / background task` lane：把 grouped port 提供、grouped host assembly 与后续 service-bundle instantiation 拆到各自的单一职责模块

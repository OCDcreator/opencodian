# QuestionTodoBackgroundTaskRuntimeServiceBundle

> **源码**: `src/features/chat/services/QuestionTodoBackgroundTaskRuntimeServiceBundle.ts`
> **状态**: [REVIEW]

## 概述

`QuestionTodoBackgroundTaskRuntimeServiceBundle` 把 `OpenCodianView` 里 visible post-sync state、question/todo refresh 与 activation coordinator bundle 的实例化顺序收束到一个轻量 factory。它专门负责：

- 先复用 `QuestionTodoBackgroundTaskRuntimeViewHostFactory` 组装 shared question/todo/background-task view hosts
- 再按既有依赖顺序串起 `VisibleConversationPostSyncStateHostAdapter`、`QuestionTodoBackgroundTaskRefreshHostAdapter` 与 `QuestionTodoBackgroundTaskActivationHostAdapter`
- 只把 conversation sync 与 activation wiring 真正需要的四个 coordinator 暴露回 `OpenCodianView`

它不新增业务规则，也不改变各个 coordinator/facade 的职责；只负责把这段 P2 service-bundle assembly 从 view 构造函数里迁走。

## 公开接口

```typescript
export interface QuestionTodoBackgroundTaskRuntimeServiceBundle {
  visibleConversationPostSyncCoordinator: VisibleConversationPostSyncCoordinator;
  backgroundConversationPostSyncHandoffCoordinator: BackgroundConversationPostSyncHandoffCoordinator;
  questionTodoActivationRefreshCoordinator: QuestionTodoActivationRefreshCoordinator;
  backgroundTaskActivationIndicatorCoordinator: BackgroundTaskActivationIndicatorCoordinator;
}

export function createQuestionTodoBackgroundTaskRuntimeServiceBundle(
  host: QuestionTodoBackgroundTaskRuntimeViewHostFactoryHost,
): QuestionTodoBackgroundTaskRuntimeServiceBundle;
```

## 关键行为

- `createQuestionTodoBackgroundTaskRuntimeServiceBundle()` 先创建 shared runtime view hosts，再创建 visible-state services、refresh services、activation services，保留原有依赖顺序
- `VisibleConversationPostSyncStateCoordinator` 与 `QuestionTodoActivationRefreshBridge` 继续作为 bundle 内部依赖存在，不再由 `OpenCodianView` 直接持有
- 返回值只暴露 visible/background post-sync 与 activation 两侧真正需要的 coordinator，缩小 view 构造函数对中间 wiring 细节的感知面

## 与 `OpenCodianView` 的边界

- `OpenCodianView` 现在只提供 `QuestionTodoBackgroundTaskRuntimeViewHostFactoryHost` 的 grouped ports，并消费这一个 bundle factory 的返回值
- shared host assembly 仍留在 `QuestionTodoBackgroundTaskRuntimeViewHostFactory`
- refresh、visible state、background handoff、activation 的业务边界仍分别留在原有 adapter / coordinator 模块
- 这次切片继续推进 master plan 的 P2 `question / todo / background task` lane：把 post-sync/activation service-bundle instantiation 从主集成点继续下沉一层

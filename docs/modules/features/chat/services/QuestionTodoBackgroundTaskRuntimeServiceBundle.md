# QuestionTodoBackgroundTaskRuntimeServiceBundle

> **源码**: `src/features/chat/services/QuestionTodoBackgroundTaskRuntimeServiceBundle.ts`
> **状态**: [REVIEW]

## 概述

`QuestionTodoBackgroundTaskRuntimeServiceBundle` 现在直接收束 `OpenCodianView` 里 question / todo / background-task 的共享 host assembly 与 service instantiation 顺序。它专门负责：

- 直接消费 `OpenCodianView` 暴露的一份扁平 late-bound runtime seam
- 在模块内部组装 shared question/todo/background-task view hosts
- 再按既有依赖顺序串起 `VisibleConversationPostSyncStateHostAdapter`、`QuestionTodoBackgroundTaskRefreshHostAdapter` 与 `QuestionTodoBackgroundTaskActivationHostAdapter`
- 只把 conversation sync 与 activation wiring 真正需要的四个 coordinator 暴露回 `OpenCodianView`

它不新增业务规则，也不改变各个 coordinator/facade 的职责；只负责把这段 P2 service-bundle assembly 从 view 构造函数里迁走。

## 公开接口

```typescript
export interface QuestionTodoBackgroundTaskRuntimeServiceBundleHost {
  getCurrentConversation(): Conversation | null;
  setCurrentConversationRevertState(...): void;
  getConversationSyncRuntime(): Pick<
    TabConversationSyncFingerprintRuntimePort,
    'setTabConversationSyncFingerprint'
  >;
  getTabRuntimeState(tabId: TabId | null): QuestionTodoStatusRefreshRuntime | null;
  renderSessionTodoDock(tabId: TabId | null): void;
  getQuestionDockCoordinator(): QuestionDockCoordinatorPort;
  getSessionTodoStateService(): SessionTodoStateServicePort;
  getSessionTodoStatusRefreshService(): SessionTodoStatusRefreshServicePort;
  getQuestionDockSlotCoordinator(): QuestionDockSlotCoordinatorPort;
  getSessionTodoDockCoordinator(): SessionTodoDockCoordinatorPort;
  resetBackgroundTaskIndicator(): void;
  syncBackgroundTaskStateFromConversation(...): void;
  renderBackgroundTaskIndicatorIfNeeded(tabId?: TabId | null): Promise<void>;
  getBackgroundTaskIndicatorCoordinator(): BackgroundTaskIndicatorCoordinatorPort;
  getBackgroundTaskLiveSignalCoordinator(): BackgroundTaskLiveSignalCoordinatorPort;
  getTabRuntimeStateBridge(): TabRuntimeStateBridgePort;
}

export function createQuestionTodoBackgroundTaskRuntimeViewHosts(
  host: QuestionTodoBackgroundTaskRuntimeServiceBundleHost,
): QuestionTodoBackgroundTaskRuntimeViewHosts;

export interface QuestionTodoBackgroundTaskRuntimeServiceBundle {
  visibleConversationPostSyncCoordinator: VisibleConversationPostSyncCoordinator;
  backgroundConversationPostSyncHandoffCoordinator: BackgroundConversationPostSyncHandoffCoordinator;
  questionTodoActivationRefreshCoordinator: QuestionTodoActivationRefreshCoordinator;
  backgroundTaskActivationIndicatorCoordinator: BackgroundTaskActivationIndicatorCoordinator;
}

export function createQuestionTodoBackgroundTaskRuntimeServiceBundle(
  host: QuestionTodoBackgroundTaskRuntimeServiceBundleHost,
): QuestionTodoBackgroundTaskRuntimeServiceBundle;
```

## 关键行为

- `createQuestionTodoBackgroundTaskRuntimeViewHosts()` 直接从扁平 runtime seam 组装 visible-state、refresh、background handoff、activation 共用的 host
- `createQuestionTodoBackgroundTaskRuntimeServiceBundle()` 复用这份 shared host，再创建 visible-state services、refresh services、activation services，保留原有依赖顺序
- `VisibleConversationPostSyncStateCoordinator` 与 `QuestionTodoActivationRefreshBridge` 继续作为 bundle 内部依赖存在，不再由 `OpenCodianView` 直接持有
- 返回值只暴露 visible/background post-sync 与 activation 两侧真正需要的 coordinator，缩小 view 构造函数对中间 wiring 细节的感知面

## 与 `OpenCodianView` 的边界

- `OpenCodianView` 现在只提供一份更扁平的 P2 runtime seam，并消费这一个 bundle factory 的返回值
- 主调用链从 `OpenCodianView -> RuntimeServiceBundle -> RuntimeHostProvider -> RuntimeViewHostFactory -> adapter/services` 缩短为 `OpenCodianView -> RuntimeServiceBundle -> adapter/services`
- refresh、visible state、background handoff、activation 的业务边界仍分别留在原有 adapter / coordinator 模块
- 这次切片继续推进 master plan 的 P2 `question / todo / background task` lane：把 post-sync/activation service-bundle instantiation 从主集成点继续下沉一层

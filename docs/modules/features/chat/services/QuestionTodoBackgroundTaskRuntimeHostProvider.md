# QuestionTodoBackgroundTaskRuntimeHostProvider

> **源码**: `src/features/chat/services/QuestionTodoBackgroundTaskRuntimeHostProvider.ts`
> **状态**: [REVIEW]

## 概述

`QuestionTodoBackgroundTaskRuntimeHostProvider` 是夹在 `OpenCodianView` 与 `QuestionTodoBackgroundTaskRuntimeViewHostFactory` 之间的一层薄 facade。它把 view 暴露的一份更扁平的 late-bound runtime seam，重新分组为 factory 仍然需要的四组 ports：

- conversation state
- question/todo refresh runtime
- activation writeback
- background-task runtime

这样 `OpenCodianView` 不再直接维护 `QuestionTodoBackgroundTaskRuntimeViewHostFactoryHost` 的 grouped port 闭包布局，只保留更薄的一层 P2 runtime seam；现有 runtime view-host factory 与后续 service bundle 的职责保持不变。

## 公开接口

```typescript
export interface QuestionTodoBackgroundTaskRuntimeHostProviderHost {
  getCurrentConversation(): Conversation | null;
  setCurrentConversationRevertState(revertState: ConversationRevertStateSnapshot | null): void;
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
  syncBackgroundTaskStateFromConversation(
    conversation: Conversation,
    tabId?: TabId | null,
  ): void;
  renderBackgroundTaskIndicatorIfNeeded(tabId?: TabId | null): Promise<void>;
  getBackgroundTaskIndicatorCoordinator(): BackgroundTaskIndicatorCoordinatorPort;
  getBackgroundTaskLiveSignalCoordinator(): BackgroundTaskLiveSignalCoordinatorPort;
  getTabRuntimeStateBridge(): TabRuntimeStateBridgePort;
}

export function createQuestionTodoBackgroundTaskRuntimeViewHostFactoryHost(
  host: QuestionTodoBackgroundTaskRuntimeHostProviderHost,
): QuestionTodoBackgroundTaskRuntimeViewHostFactoryHost;
```

## 边界

- `OpenCodianView` 现在只提供扁平的 P2 runtime seam，并把 tab-scoped fingerprint writeback 通过 `TabConversationSyncFingerprintPortProvider` 复用给该 provider
- `QuestionTodoBackgroundTaskRuntimeHostProvider` 只负责重新分组，不新增业务逻辑
- `QuestionTodoBackgroundTaskRuntimeViewHostFactory` 继续负责从 grouped port 派生 shared visible/refresh/background/activation view hosts
- `QuestionTodoBackgroundTaskRuntimeServiceBundle` 继续掌握 visible-state、refresh、activation 三段 service-bundle 的实例化顺序

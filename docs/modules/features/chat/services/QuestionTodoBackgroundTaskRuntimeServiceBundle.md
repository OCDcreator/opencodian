# QuestionTodoBackgroundTaskRuntimeServiceBundle

> **源码**: `src/features/chat/services/QuestionTodoBackgroundTaskRuntimeServiceBundle.ts`
> **状态**: [REVIEW]

## 概述

`QuestionTodoBackgroundTaskRuntimeServiceBundle` 现在直接收束 `OpenCodianView` 里 question / todo / background-task 的共享 host assembly 与 service instantiation 顺序。它专门负责：

- 直接消费 `OpenCodianView` 暴露的一份扁平 late-bound runtime seam
- 在模块内部组装 shared question/todo/background-task view hosts，以及 stream-trigger 专用 host
- 再按既有依赖顺序串起 `VisibleConversationPostSyncStateHostAdapter`、`QuestionTodoBackgroundTaskRefreshHostAdapter` 与 `QuestionTodoBackgroundTaskActivationHostAdapter`
- 只把 conversation sync / activation wiring 真正需要的 coordinator，加上 stream-trigger runtime host 暴露回 `OpenCodianView`

它不新增业务规则，也不改变各个 coordinator/facade 的职责；只负责把这段 P2 service-bundle assembly 从 view 构造函数里迁走。

## 公开接口

```typescript
export interface QuestionTodoBackgroundTaskRuntimeServiceBundleHost {
  getActiveTabId(): TabId | null;
  getCurrentConversation(): Conversation | null;
  setCurrentConversationRevertState(...): void;
  getConversationSyncRuntime(): Pick<
    TabConversationSyncFingerprintRuntimePort,
    'setTabConversationSyncFingerprint'
  >;
  getTabRuntimeState(tabId: TabId | null): QuestionTodoStatusRefreshRuntime | null;
  getSessionIdForTab(tabId: TabId | null): string | null;
  renderSessionTodoDock(tabId: TabId | null): void;
  getQuestionDockCoordinator(): QuestionDockCoordinatorPort;
  getSessionTodoCoordinator(): SessionTodoCoordinatorPort;
  getQuestionDockSlotCoordinator(): QuestionDockSlotCoordinatorPort;
  resetBackgroundTaskIndicator(tabId: TabId | null): void;
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
  backgroundTaskActivationIndicatorCoordinator: BackgroundTaskActivationIndicatorPort;
  backgroundTaskStreamTriggerViewHost: BackgroundTaskStreamTriggerCoordinatorHost;
}

export function createQuestionTodoBackgroundTaskRuntimeServiceBundle(
  host: QuestionTodoBackgroundTaskRuntimeServiceBundleHost,
): QuestionTodoBackgroundTaskRuntimeServiceBundle;

export function createQuestionTodoBackgroundTaskRuntimeServiceBundleFromSeam(
  seam: QuestionTodoBackgroundTaskRuntimeSeam,
): QuestionTodoBackgroundTaskRuntimeServiceBundle;

export interface QuestionTodoBackgroundTaskRuntimeSeam
  extends Omit<
    QuestionTodoBackgroundTaskRuntimeServiceBundleHost,
    'resetBackgroundTaskIndicator' | 'syncBackgroundTaskStateFromConversation' | 'renderBackgroundTaskIndicatorIfNeeded'
  > {
  getBackgroundTaskHost(): Pick<BackgroundTaskViewHost,
    'resetBackgroundTaskIndicator' | 'syncBackgroundTaskStateFromConversation' | 'renderBackgroundTaskIndicatorIfNeeded'
  >;
}

export function assembleQuestionTodoBackgroundTaskRuntimeHost(
  seam: QuestionTodoBackgroundTaskRuntimeSeam,
): QuestionTodoBackgroundTaskRuntimeServiceBundleHost;
```

## 关键行为

- `assembleQuestionTodoBackgroundTaskRuntimeHost()` 从 seam 接口组装完整 host，把 `getBackgroundTaskHost()` 的 3 个方法（reset、sync、render）展开为 host 扁平属性；其余 seam 属性直接透传。这保证了 late binding——每次调用 reset/sync/render 时都重新解析最新的 backgroundTaskHost
- `createQuestionTodoBackgroundTaskRuntimeViewHosts()` 直接从扁平 runtime seam 组装 visible-state、refresh、background handoff、activation 共用的 host，并额外把 active-tab / session lookup + session todo bridge 收束成 `backgroundTaskStreamTriggerViewHost`
- `createQuestionTodoBackgroundTaskRuntimeServiceBundle()` 复用这份 shared host，再创建 visible-state services、refresh services、activation services，保留原有依赖顺序，并把 stream-trigger host 一并回传
- `createQuestionTodoBackgroundTaskRuntimeServiceBundleFromSeam()` 是新的便捷工厂，它内部调用 `assembleQuestionTodoBackgroundTaskRuntimeHost(seam)` 再传给 `createQuestionTodoBackgroundTaskRuntimeServiceBundle()`，让调用方（如 `OpenCodianView`）只需构造 seam 对象即可完成整个 bundle 的组装
- `VisibleConversationPostSyncStateCoordinator` 继续作为 bundle 内部依赖存在，而 activation/open 与 post-sync 共用的 supplemental refresh 则直接复用 bundle 内部的 `QuestionTodoStatusRefreshCoordinator`
- 返回值只暴露 visible/background post-sync、activation 两侧真正需要的 coordinator，以及 stream-trigger runtime host，缩小 view 构造函数对中间 wiring 细节的感知面

- `TabConversationSyncFingerprintRuntimePort` 是本 bundle 与 `PersistentAssistantNoticeService` 共用的最小 conversation-sync port；它覆盖 fingerprint 计算与 tab-scoped fingerprint 写回，避免为同一组函数再保留单独的 pass-through provider。

## 与 `OpenCodianView` 的边界

- `OpenCodianView` 不再内联组装 `assembleQuestionTodoBackgroundTaskRuntimeHost()`，改为构造 `QuestionTodoBackgroundTaskRuntimeSeam` 并传给本模块的 `createQuestionTodoBackgroundTaskRuntimeServiceBundleFromSeam()` 工厂
- seam 中 `getBackgroundTaskHost()` 返回 `this.backgroundTaskHost`，由工厂在每次调用时 late-resolve，保证 host 在 `createConversationRuntimeWiring()` 中赋值后才真正被消费
- 主调用链从 `OpenCodianView -> RuntimeServiceBundle -> RuntimeHostProvider -> RuntimeViewHostFactory -> adapter/services` 缩短为 `OpenCodianView -> RuntimeServiceBundle -> adapter/services`
- refresh、visible state、background handoff、activation 与 stream-trigger host assembly 的业务边界仍分别留在原有 adapter / coordinator 模块
- 这次切片继续推进 master plan 的 P2 `question / todo / background task` lane：把 post-sync/activation 之外残余的 background-task stream-trigger host assembly 也从主集成点继续下沉一层

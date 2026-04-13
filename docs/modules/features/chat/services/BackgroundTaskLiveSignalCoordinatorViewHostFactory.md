# BackgroundTaskLiveSignalCoordinatorViewHostFactory

> **源码**: `src/features/chat/services/BackgroundTaskLiveSignalCoordinatorViewHostFactory.ts`
> **状态**: [REVIEW]

## 概述

`BackgroundTaskLiveSignalCoordinatorViewHostFactory` 负责把 grouped background-task live-signal ports 重新装配为 `BackgroundTaskLiveSignalCoordinator` 现有的扁平 host 契约。它与 `BackgroundTaskLiveSignalCoordinatorHostProvider` 配合，把 `OpenCodianView` 从 coordinator host 的中间装配职责里抽离出来。

## 公开接口

```typescript
export interface BackgroundTaskLiveSignalCoordinatorViewHostFactoryHost {
  getBackgroundTaskRuntime(): {
    getTabRuntimeState(tabId: TabId | null): BackgroundTaskLiveSignalRuntime | null;
  };
  getSessionState(): {
    getSessionIdForTab(tabId: TabId | null): string | null;
    getTabSessionStatus(
      tabId: TabId | null,
      sessionId: string | null,
    ): SessionActivityStatus | null;
  };
  getViewWriteback(): {
    syncTabStreamLikeState(tabId: TabId | null): void;
    resetBackgroundTaskIndicator(tabId: TabId | null): void;
  };
}

export function createBackgroundTaskLiveSignalCoordinatorHost(
  host: BackgroundTaskLiveSignalCoordinatorViewHostFactoryHost,
): BackgroundTaskLiveSignalCoordinatorHost;
```

## 边界

- `BackgroundTaskLiveSignalCoordinatorViewHostFactory` 只做 host assembly，不承接 live-signal 业务逻辑
- `BackgroundTaskLiveSignalCoordinatorHostProvider` 负责把 view 的 flat seam 重新分组
- `BackgroundTaskLiveSignalCoordinator` 继续消费最终的扁平 host 契约并执行 reconcile 行为

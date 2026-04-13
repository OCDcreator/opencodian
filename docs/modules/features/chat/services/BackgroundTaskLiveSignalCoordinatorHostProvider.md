# BackgroundTaskLiveSignalCoordinatorHostProvider

> **源码**: `src/features/chat/services/BackgroundTaskLiveSignalCoordinatorHostProvider.ts`
> **状态**: [REVIEW]

## 概述

`BackgroundTaskLiveSignalCoordinatorHostProvider` 是夹在 `OpenCodianView` 与 `BackgroundTaskLiveSignalCoordinatorViewHostFactory` 之间的一层薄 facade。它把 view 暴露的一份更扁平的 background-task live-signal reconcile seam，重新分组为 factory 仍然需要的三组 ports：

- background-task runtime
- session state lookup
- view writeback

这样 `OpenCodianView` 不再直接维护 `BackgroundTaskLiveSignalCoordinator` host 的 grouped 闭包布局，只保留一份更薄、更晚绑定的 live-signal runtime seam；现有 factory 与 coordinator 的行为边界保持不变。

## 公开接口

```typescript
export interface BackgroundTaskLiveSignalCoordinatorHostProviderHost {
  getTabRuntimeState(tabId: TabId | null): BackgroundTaskLiveSignalRuntime | null;
  getSessionIdForTab(tabId: TabId | null): string | null;
  getTabSessionStatus(
    tabId: TabId | null,
    sessionId: string | null,
  ): SessionActivityStatus | null;
  syncTabStreamLikeState(tabId: TabId | null): void;
  resetBackgroundTaskIndicator(tabId: TabId | null): void;
}

export function createBackgroundTaskLiveSignalCoordinatorViewHostFactoryHost(
  host: BackgroundTaskLiveSignalCoordinatorHostProviderHost,
): BackgroundTaskLiveSignalCoordinatorViewHostFactoryHost;
```

## 边界

- `OpenCodianView` 只保留扁平的 live-signal reconcile seam 实现
- `BackgroundTaskLiveSignalCoordinatorHostProvider` 只负责重新分组，不新增业务逻辑
- `BackgroundTaskLiveSignalCoordinatorViewHostFactory` 继续负责把 grouped ports 重新拼成 `BackgroundTaskLiveSignalCoordinatorHost`
- `BackgroundTaskLiveSignalCoordinator` 继续负责 authoritative-sync gate、indicator predicate 与 stale-live-signal reconcile 决策

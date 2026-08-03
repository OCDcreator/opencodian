# ModifiedFilesSidebarCoordinator

> **源码**: `src/features/chat/services/ModifiedFilesSidebarCoordinator.ts`
> **状态**: [REVIEW]

## 概述

`ModifiedFilesSidebarCoordinator` owns the modified-files sidebar lifecycle for the chat surface. It keeps the right-edge entry and panel instance together so `OpenCodianView` only delegates mount/refresh/destroy calls.

## 公开接口

```ts
export class ModifiedFilesSidebarCoordinator {
  mountSidebar(parentEl: HTMLElement, app: App): void;
  refresh(sessionId: string | null, getEntries: (id: string) => SessionDiffEntry[], availability?: 'ready' | 'unavailable'): void;
  destroy(): void;
}
```

## 关键行为

- `mountSidebar()` replaces any existing `ModifiedFilesSidebar` before mounting into the nearest Chat `.opencodian-container`, so its percentage sizing and right inset resolve against the sidebar boundary rather than the wider workspace leaf.
- `refresh()` reads entries through the injected session lookup when a session is available, then updates the sidebar list, badge count, and ready/unavailable state. Capability gating affects whether entries can be read, not whether the configured entry is discoverable.
- `destroy()` clears the sidebar and all DOM references for view close or navigation sidebar rebuild.

## 边界

- The coordinator does not decide the active conversation; callers pass the active session id.
- The coordinator does not own canonical diff storage; `OpenCodeService.getCachedSessionDiffEntries()` remains the source of truth.
- `ModifiedFilesSidebar` still owns item rendering and file-open behavior.

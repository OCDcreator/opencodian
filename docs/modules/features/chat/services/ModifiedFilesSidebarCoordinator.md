# ModifiedFilesSidebarCoordinator

> **源码**: `src/features/chat/services/ModifiedFilesSidebarCoordinator.ts`
> **状态**: [REVIEW]

## 概述

`ModifiedFilesSidebarCoordinator` owns the modified-files sidebar lifecycle for the chat surface. It keeps the right-edge entry and panel instance together so `OpenCodianView` only delegates mount/refresh/destroy calls.

## 公开接口

```ts
export class ModifiedFilesSidebarCoordinator {
  mountSidebar(parentEl: HTMLElement, app: App): void;
  refresh(sessionId: string | null, getEntries: (id: string) => SessionDiffEntry[], availability?: 'ready' | 'unavailable', persistedMessages?: readonly ChatMessage[]): void;
  destroy(): void;
}
```

## 关键行为

- `mountSidebar()` replaces any existing `ModifiedFilesSidebar` before mounting into the nearest Chat `.opencodian-container`, so its percentage sizing and right inset resolve against the sidebar boundary rather than the wider workspace leaf.
- `refresh()` reads the canonical cached `session.diff` through the injected session lookup when a session is available. A non-empty canonical cache always wins.
- When the canonical cache is empty and availability is `ready`, `refresh()` rebuilds the current Session Change Sidebar from persisted `turn-diff` Turn Change Records. It keeps the latest entry for each file while preserving stable first-seen file order, so repeated turns do not inflate the file count.
- Capability gating affects whether canonical or persisted entries can be read, not whether the configured entry is discoverable. `unavailable` never exposes persisted OpenCode fallback data.
- `destroy()` clears the sidebar and all DOM references for view close or navigation sidebar rebuild.

## 边界

- The coordinator does not decide the active conversation; callers pass the active session id.
- The coordinator does not own canonical diff storage; `OpenCodeService.getCachedSessionDiffEntries()` remains the primary source of truth, while persisted Turn Change Records are reload-safe fallback evidence only.
- `ModifiedFilesSidebar` still owns item rendering and file-open behavior.

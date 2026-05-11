# BackgroundTaskCompletionNoticeService

> **源码**: `src/features/chat/services/BackgroundTaskCompletionNoticeService.ts`

## Responsibility

`BackgroundTaskCompletionNoticeService` is the compatibility surface for completion notice queue/flush callers that still expect a completion-only service. The implementation delegates to the consolidated `BackgroundTaskNoticeStateService`, so stopped/stale notice state and background-task completion notice state share one owner without forcing thick view wiring to change.

It is responsible for:

- preserving the existing `queueNotices()` and `flushQueuedNotices()` API used by `BackgroundTaskIndicatorCoordinator`
- exposing completion event/info/runtime types from the consolidated notice owner
- adapting the completion-only host shape to the broader notice service host

It does not own stopped/stale notice suppression, pending launch fingerprints, timeline segment assembly, or live-signal reconciliation.

## Public API

```typescript
export type BackgroundTaskCompletionNoticeRuntime = BackgroundTaskNoticeStateRuntime;

export interface BackgroundTaskCompletionNoticeServiceHost {
  getTabRuntimeState(tabId: TabId | null): BackgroundTaskCompletionNoticeRuntime | null;
  appendPersistentAssistantNoticeMessage(options: BackgroundTaskCompletionNoticeMessageOptions): Promise<void>;
}

export class BackgroundTaskCompletionNoticeService {
  queueNotices(...): void;
  flushQueuedNotices(...): Promise<void>;
}
```

## Notes

- Completion queue state lives in `BackgroundTaskNoticeStateService`.
- The adapter exists to keep `OpenCodianView` outside this Class B service consolidation while still reducing the real notice implementation to one owner.

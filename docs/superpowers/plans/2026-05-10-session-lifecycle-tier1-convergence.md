# Session Lifecycle Tier 1 Convergence Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make OpenCodian's first-tier session lifecycle risks testable by adding a writable per-tab lifecycle owner and serialized per-conversation message writes.

**Architecture:** Keep `OpenCodianView.ts` as a wiring shell and place new runtime ownership in focused services under `src/features/chat/services/`. Preserve the existing canonical-first message graph while making compatibility-cache writes pass through a single queue/token guard. This plan covers the council review's Tier 1 only; LRU/full-message cache eviction belongs in a separate plan because it touches storage shape and long-running memory policy.

**Tech Stack:** TypeScript, Jest, Obsidian plugin runtime, OpenCode SDK/HTTP session state, existing `npm run verify` gates.

---

## Scope Check

The council review recommends five improvements. This plan implements the two Tier 1 improvements:

- Per-tab writable lifecycle state machine.
- Per-conversation write serialization with monotonic version tickets.

The following council items are intentionally outside this plan:

- LRU full-message cache.
- `OpenCodeSessionStateStore.deleteSession()` eviction API.
- Final removal of all runtime reads from `Conversation.messages`.

Those items need a separate storage/cache plan after this one lands because their tests and rollback risks are different.

## File Structure

- Create `src/features/chat/services/TabSessionLifecycleState.ts`
  - Pure state-machine reducer for writable per-tab lifecycle phase.
  - No DOM, no Obsidian APIs, no save/render side effects.
- Modify `src/features/chat/services/TabSessionPhase.ts`
  - Keep the public UI phase helper, but derive it from writable lifecycle state plus existing context/server overlays.
- Modify `src/features/chat/services/ConversationTabRuntimeCoordinator.ts`
  - Own tab lifecycle transitions and expose small transition helpers.
  - Keep compatibility writes to `isStreaming` and `isConversationSyncInFlight` during migration.
- Modify `src/features/chat/services/MessageSendPreparationService.ts`
  - Mark `preparing` and `streaming` through the coordinator instead of setting only booleans.
- Modify `src/features/chat/runtime/StreamLocalFinalizer.ts`
  - Mark `finalizing` and `syncing` around finalization.
- Modify `src/features/chat/services/ConversationSyncRuntimeCoordinator.ts`
  - Use lifecycle-aware sync entry/exit.
- Create `src/features/chat/services/ConversationWriteSerializationService.ts`
  - Per-conversation write queue and monotonic tickets.
- Modify these write hotspots to call the serialized write service through host ports:
  - `src/features/chat/services/MessageSendPreparationService.ts`
  - `src/features/chat/runtime/LocalStreamMessagePersistence.ts`
  - `src/features/chat/services/MessageFinalizationService.ts`
  - `src/features/chat/services/ConversationAuthoritativeReloadCoordinator.ts`
  - `src/features/chat/services/ConversationAuthoritativeSyncCoordinator.ts`
  - `src/features/chat/OpenCodianView.ts`
- Add/update tests:
  - `tests/unit/features/chat/TabSessionLifecycleState.test.ts`
  - `tests/unit/features/chat/ConversationTabRuntimeCoordinator.phase.test.ts`
  - `tests/unit/features/chat/ConversationSyncRuntimeCoordinator.test.ts`
  - `tests/unit/features/chat/ConversationWriteSerializationService.test.ts`
  - focused existing tests for each migrated write hotspot if they already cover that module.
- Update docs:
  - `docs/modules/features/chat/services/TabSessionPhase.md`
  - Create `docs/modules/features/chat/services/TabSessionLifecycleState.md`
  - Create `docs/modules/features/chat/services/ConversationWriteSerializationService.md`
  - Refresh `docs/status/session-lifecycle-council-review-2026-05-10.md` with an implementation-plan link only if this plan is committed in the same branch.

## Task 1: Add The Pure Writable Lifecycle State Machine

**Files:**
- Create: `src/features/chat/services/TabSessionLifecycleState.ts`
- Modify: `src/features/chat/services/TabSessionPhase.ts`
- Test: `tests/unit/features/chat/TabSessionLifecycleState.test.ts`
- Test: `tests/unit/features/chat/ConversationTabRuntimeCoordinator.phase.test.ts`

- [ ] **Step 1: Write the failing lifecycle reducer test**

Create `tests/unit/features/chat/TabSessionLifecycleState.test.ts`:

```typescript
import {
  createInitialTabSessionLifecycleState,
  deriveTabSessionPhaseFromLifecycle,
  isForegroundBusyTabSessionPhase,
  transitionTabSessionLifecycle,
} from '../../../../src/features/chat/services/TabSessionLifecycleState';

describe('TabSessionLifecycleState', () => {
  it('starts idle and treats idle as not foreground busy', () => {
    const state = createInitialTabSessionLifecycleState();

    expect(state.phase).toBe('idle');
    expect(state.sequence).toBe(0);
    expect(isForegroundBusyTabSessionPhase(state.phase)).toBe(false);
  });

  it('increments a monotonic sequence for every accepted transition', () => {
    const idle = createInitialTabSessionLifecycleState();
    const preparing = transitionTabSessionLifecycle(idle, 'preparing', 'send-preflight');
    const streaming = transitionTabSessionLifecycle(preparing, 'streaming', 'stream-started');
    const finalizing = transitionTabSessionLifecycle(streaming, 'finalizing', 'stream-finally');
    const syncing = transitionTabSessionLifecycle(finalizing, 'syncing', 'server-sync');
    const done = transitionTabSessionLifecycle(syncing, 'idle', 'final-save');

    expect([preparing.phase, streaming.phase, finalizing.phase, syncing.phase, done.phase]).toEqual([
      'preparing',
      'streaming',
      'finalizing',
      'syncing',
      'idle',
    ]);
    expect(done.sequence).toBe(5);
    expect(done.reason).toBe('final-save');
  });

  it('keeps all active local phases foreground busy', () => {
    expect(isForegroundBusyTabSessionPhase('preparing')).toBe(true);
    expect(isForegroundBusyTabSessionPhase('streaming')).toBe(true);
    expect(isForegroundBusyTabSessionPhase('finalizing')).toBe(true);
    expect(isForegroundBusyTabSessionPhase('syncing')).toBe(true);
    expect(isForegroundBusyTabSessionPhase('cancelled')).toBe(false);
    expect(isForegroundBusyTabSessionPhase('error')).toBe(false);
  });

  it('keeps server and context overlays lower priority than local lifecycle phases', () => {
    expect(deriveTabSessionPhaseFromLifecycle({
      lifecycle: transitionTabSessionLifecycle(createInitialTabSessionLifecycleState(), 'syncing', 'sync'),
      isContextCompacting: true,
      sessionStatus: { type: 'busy' },
    })).toBe('syncing');

    expect(deriveTabSessionPhaseFromLifecycle({
      lifecycle: createInitialTabSessionLifecycleState(),
      isContextCompacting: true,
      sessionStatus: { type: 'retry', attempt: 1, message: 'retrying', next: 1 },
    })).toBe('compacting');

    expect(deriveTabSessionPhaseFromLifecycle({
      lifecycle: createInitialTabSessionLifecycleState(),
      sessionStatus: { type: 'busy' },
    })).toBe('server-busy');
  });
});
```

- [ ] **Step 2: Run the failing lifecycle test**

Run:

```bash
npm run test -- tests/unit/features/chat/TabSessionLifecycleState.test.ts --runInBand
```

Expected: FAIL with a TypeScript/Jest module resolution error for `TabSessionLifecycleState`.

- [ ] **Step 3: Create the lifecycle reducer**

Create `src/features/chat/services/TabSessionLifecycleState.ts`:

```typescript
import type { SessionActivityStatus } from '../../../core/opencode';

export type WritableTabSessionPhase =
  | 'idle'
  | 'preparing'
  | 'streaming'
  | 'finalizing'
  | 'syncing'
  | 'cancelled'
  | 'error';

export type TabSessionPhase =
  | WritableTabSessionPhase
  | 'compacting'
  | 'server-busy'
  | 'server-retrying';

export interface TabSessionLifecycleState {
  readonly phase: WritableTabSessionPhase;
  readonly sequence: number;
  readonly reason: string | null;
  readonly changedAt: number;
}

export interface TabSessionLifecycleSignals {
  readonly lifecycle: TabSessionLifecycleState;
  readonly isSameSessionStreamingInAnotherTab?: boolean;
  readonly isContextCompacting?: boolean;
  readonly sessionStatus?: SessionActivityStatus | null;
}

export function createInitialTabSessionLifecycleState(now = 0): TabSessionLifecycleState {
  return {
    phase: 'idle',
    sequence: 0,
    reason: null,
    changedAt: now,
  };
}

export function transitionTabSessionLifecycle(
  state: TabSessionLifecycleState,
  phase: WritableTabSessionPhase,
  reason: string,
  now = Date.now(),
): TabSessionLifecycleState {
  if (state.phase === phase && state.reason === reason) {
    return state;
  }

  return {
    phase,
    sequence: state.sequence + 1,
    reason,
    changedAt: now,
  };
}

export function deriveTabSessionPhaseFromLifecycle(
  signals: TabSessionLifecycleSignals,
): TabSessionPhase {
  if (
    signals.lifecycle.phase === 'preparing'
    || signals.lifecycle.phase === 'streaming'
    || signals.lifecycle.phase === 'finalizing'
    || signals.lifecycle.phase === 'syncing'
  ) {
    return signals.lifecycle.phase;
  }

  if (signals.isSameSessionStreamingInAnotherTab) {
    return 'streaming';
  }

  if (signals.isContextCompacting) {
    return 'compacting';
  }

  if (signals.sessionStatus?.type === 'retry') {
    return 'server-retrying';
  }

  if (signals.sessionStatus?.type === 'busy') {
    return 'server-busy';
  }

  return signals.lifecycle.phase;
}

export function isForegroundBusyTabSessionPhase(phase: TabSessionPhase): boolean {
  return phase === 'preparing'
    || phase === 'streaming'
    || phase === 'finalizing'
    || phase === 'syncing'
    || phase === 'compacting'
    || phase === 'server-busy'
    || phase === 'server-retrying';
}
```

- [ ] **Step 4: Replace `TabSessionPhase.ts` with a compatibility wrapper**

Replace `src/features/chat/services/TabSessionPhase.ts` with:

```typescript
import {
  createInitialTabSessionLifecycleState,
  deriveTabSessionPhaseFromLifecycle,
  isForegroundBusyTabSessionPhase,
  type TabSessionLifecycleSignals,
  type TabSessionLifecycleState,
  type TabSessionPhase,
  type WritableTabSessionPhase,
} from './TabSessionLifecycleState';

export type {
  TabSessionLifecycleSignals,
  TabSessionLifecycleState,
  TabSessionPhase,
  WritableTabSessionPhase,
};

export {
  createInitialTabSessionLifecycleState,
  deriveTabSessionPhaseFromLifecycle,
  isForegroundBusyTabSessionPhase,
};

export interface TabSessionPhaseSignals extends Omit<TabSessionLifecycleSignals, 'lifecycle'> {
  readonly lifecycle?: TabSessionLifecycleState;
  readonly isStreaming?: boolean;
  readonly isConversationSyncInFlight?: boolean;
}

export function deriveTabSessionPhase(signals: TabSessionPhaseSignals): TabSessionPhase {
  const fallbackLifecycle = createInitialTabSessionLifecycleState();
  const phase = signals.lifecycle?.phase
    ?? (signals.isStreaming ? 'streaming' : null)
    ?? (signals.isConversationSyncInFlight ? 'syncing' : null)
    ?? fallbackLifecycle.phase;

  return deriveTabSessionPhaseFromLifecycle({
    lifecycle: {
      ...(signals.lifecycle ?? fallbackLifecycle),
      phase,
    },
    isSameSessionStreamingInAnotherTab: signals.isSameSessionStreamingInAnotherTab,
    isContextCompacting: signals.isContextCompacting,
    sessionStatus: signals.sessionStatus,
  });
}
```

- [ ] **Step 5: Update the existing phase tests for the new busy semantics**

Modify `tests/unit/features/chat/ConversationTabRuntimeCoordinator.phase.test.ts`:

```typescript
import {
  createInitialTabSessionLifecycleState,
  deriveTabSessionPhase,
} from '../../../../src/features/chat/services/TabSessionPhase';
```

In `createRuntimeState()`, add the lifecycle state:

```typescript
tabSessionLifecycle: createInitialTabSessionLifecycleState(),
```

Replace the existing syncing test with:

```typescript
it('treats syncing as foreground busy because it can overwrite the local message cache', () => {
  const fixture = createFixture({ sessionStatus: null });
  fixture.pane.runtimeByTab.set('tab-syncing', createRuntimeState({
    isConversationSyncInFlight: true,
    tabSessionLifecycle: {
      phase: 'syncing',
      sequence: 1,
      reason: 'visible-sync',
      changedAt: 100,
    },
  }));

  expect(fixture.coordinator.getTabSessionPhase('tab-syncing')).toBe('syncing');
  expect(fixture.coordinator.isTabForegroundBusy('tab-syncing')).toBe(true);
});
```

- [ ] **Step 6: Run focused tests**

Run:

```bash
npm run test -- tests/unit/features/chat/TabSessionLifecycleState.test.ts tests/unit/features/chat/ConversationTabRuntimeCoordinator.phase.test.ts --runInBand
```

Expected: PASS.

- [ ] **Step 7: Commit Task 1**

```bash
git add src/features/chat/services/TabSessionLifecycleState.ts src/features/chat/services/TabSessionPhase.ts tests/unit/features/chat/TabSessionLifecycleState.test.ts tests/unit/features/chat/ConversationTabRuntimeCoordinator.phase.test.ts
git commit -m "refactor: add tab session lifecycle state"
```

## Task 2: Wire Lifecycle Transitions Through Tab Runtime Owners

**Files:**
- Modify: `src/features/chat/services/ConversationTabRuntimeCoordinator.ts`
- Modify: `src/features/chat/services/MessageSendPreparationService.ts`
- Modify: `src/features/chat/runtime/SendPipelineTypes.ts`
- Modify: `src/features/chat/runtime/SendPipelineRuntime.ts`
- Modify: `src/features/chat/runtime/StreamLocalFinalizer.ts`
- Modify: `src/features/chat/services/ConversationSyncRuntimeCoordinator.ts`
- Test: `tests/unit/features/chat/ConversationTabRuntimeCoordinator.phase.test.ts`
- Test: `tests/unit/features/chat/ConversationSyncRuntimeCoordinator.test.ts`

- [ ] **Step 1: Write failing coordinator tests for transition ownership**

Append to `tests/unit/features/chat/ConversationTabRuntimeCoordinator.phase.test.ts`:

```typescript
it('moves through preparing, streaming, finalizing, syncing, and idle using coordinator transitions', () => {
  const fixture = createFixture({ sessionStatus: null });
  fixture.pane.runtimeByTab.set('tab-life', createRuntimeState());

  fixture.coordinator.transitionTabSessionLifecycle('tab-life', 'preparing', 'send-preflight');
  expect(fixture.coordinator.getTabSessionPhase('tab-life')).toBe('preparing');
  expect(fixture.coordinator.isTabForegroundBusy('tab-life')).toBe(true);

  fixture.coordinator.setStreaming('tab-life', true);
  expect(fixture.coordinator.getTabSessionPhase('tab-life')).toBe('streaming');

  fixture.coordinator.transitionTabSessionLifecycle('tab-life', 'finalizing', 'stream-finally');
  expect(fixture.coordinator.getTabSessionPhase('tab-life')).toBe('finalizing');

  fixture.coordinator.updateConversationSyncRuntime('tab-life', { inFlight: true });
  expect(fixture.coordinator.getTabSessionPhase('tab-life')).toBe('syncing');

  fixture.coordinator.updateConversationSyncRuntime('tab-life', { inFlight: false });
  expect(fixture.coordinator.getTabSessionPhase('tab-life')).toBe('idle');
});
```

- [ ] **Step 2: Run the failing coordinator test**

Run:

```bash
npm run test -- tests/unit/features/chat/ConversationTabRuntimeCoordinator.phase.test.ts --runInBand
```

Expected: FAIL because `transitionTabSessionLifecycle()` is not exposed by `ConversationTabRuntimeCoordinator`.

- [ ] **Step 3: Add lifecycle state to the tab runtime interface**

In `src/features/chat/services/ConversationTabRuntimeCoordinator.ts`, update imports:

```typescript
import {
  createInitialTabSessionLifecycleState,
  deriveTabSessionPhase,
  isForegroundBusyTabSessionPhase,
  transitionTabSessionLifecycle,
  type TabSessionLifecycleState,
  type TabSessionPhase,
  type WritableTabSessionPhase,
} from './TabSessionPhase';
```

Extend `ConversationTabRuntimeState`:

```typescript
export interface ConversationTabRuntimeState extends TabMessagesPaneRuntimeState {
  currentTurnBodyEl: HTMLElement | null;
  tabSessionLifecycle: TabSessionLifecycleState;
  isConversationSyncInFlight: boolean;
  lastConversationSyncFingerprint: string | null;
  backgroundTaskIndicatorEl: HTMLElement | null;
  backgroundTaskInlineEls: Map<string, HTMLElement>;
  turnBodyByAnchorKey: Map<string, HTMLElement>;
  pendingEditedFiles: Set<string>;
  queuedFollowUpSend?: PrepareMessageSendOptions | null;
}
```

- [ ] **Step 4: Add coordinator transition methods**

Add these methods to `ConversationTabRuntimeCoordinator`:

```typescript
transitionTabSessionLifecycle(
  tabId: TabId | null,
  phase: WritableTabSessionPhase,
  reason: string,
): boolean {
  const runtime = this.getRuntimeState(tabId);
  if (!runtime) {
    return false;
  }

  runtime.tabSessionLifecycle = transitionTabSessionLifecycle(
    runtime.tabSessionLifecycle ?? createInitialTabSessionLifecycleState(),
    phase,
    reason,
  );
  return true;
}

private syncLegacyRuntimeFlagsFromLifecycle(runtime: Runtime): void {
  runtime.isStreaming = runtime.tabSessionLifecycle.phase === 'streaming';
  runtime.isConversationSyncInFlight = runtime.tabSessionLifecycle.phase === 'syncing';
}
```

Replace `setStreaming()` with:

```typescript
setStreaming(tabId: TabId | null, isStreaming: boolean): void {
  const runtime = this.getRuntimeState(tabId);
  if (!runtime) {
    return;
  }

  runtime.isStreaming = isStreaming;
  runtime.tabSessionLifecycle = transitionTabSessionLifecycle(
    runtime.tabSessionLifecycle ?? createInitialTabSessionLifecycleState(),
    isStreaming ? 'streaming' : 'idle',
    isStreaming ? 'stream-started' : 'stream-cleared',
  );
}
```

Replace the `inFlight` branch in `updateConversationSyncRuntime()`:

```typescript
if (update.inFlight !== undefined) {
  runtime.isConversationSyncInFlight = update.inFlight;
  runtime.tabSessionLifecycle = transitionTabSessionLifecycle(
    runtime.tabSessionLifecycle ?? createInitialTabSessionLifecycleState(),
    update.inFlight ? 'syncing' : 'idle',
    update.inFlight ? 'conversation-sync-started' : 'conversation-sync-finished',
  );
}
```

Replace `getTabSessionPhase()` with:

```typescript
getTabSessionPhase(tabId: TabId | null = this.getActiveTabId()): TabSessionPhase {
  const runtime = this.getRuntimeState(tabId);
  if (!runtime) {
    return 'idle';
  }

  const sameSessionStreaming = this.isSameSessionStreamingInAnotherTab(tabId);
  return deriveTabSessionPhase({
    lifecycle: runtime.tabSessionLifecycle ?? createInitialTabSessionLifecycleState(),
    isSameSessionStreamingInAnotherTab: sameSessionStreaming,
    isContextCompacting: typeof this.host.getTabContextUsage(tabId)?.compactingAt === 'number',
    sessionStatus: this.host.getTabSessionStatus(tabId, this.host.getSessionIdForTab(tabId)),
  });
}
```

- [ ] **Step 5: Initialize lifecycle state in `OpenCodianView` runtime creation**

In `src/features/chat/OpenCodianView.ts`, import:

```typescript
import { createInitialTabSessionLifecycleState } from './services/TabSessionPhase';
```

In the object returned by `createInitialTabRuntimeState()`, add:

```typescript
tabSessionLifecycle: createInitialTabSessionLifecycleState(),
```

- [ ] **Step 6: Add lifecycle host methods to send preparation**

In `src/features/chat/services/MessageSendPreparationService.ts`, extend `MessageSendPreparationHost`:

```typescript
transitionTabSessionLifecycle(
  tabId: TabId | null,
  phase: WritableTabSessionPhase,
  reason: string,
): boolean;
```

Import `WritableTabSessionPhase` from `./TabSessionPhase`.

In `prepareMessageSend()`, after the foreground-busy check and before the first server/model await, add:

```typescript
this.host.transitionTabSessionLifecycle(tabId, 'preparing', 'send-preflight');
```

In every branch after that line that returns `null`, first restore idle:

```typescript
this.host.transitionTabSessionLifecycle(tabId, 'idle', 'send-preflight-cancelled');
return null;
```

In `enterStreamingState()`, replace the boolean-only transition with:

```typescript
enterStreamingState(tabId: TabId | null): void {
  this.host.transitionTabSessionLifecycle(tabId, 'streaming', 'stream-started');
  this.host.setStreaming(tabId, true);
  this.host.syncTabStreamLikeState(tabId);
  this.host.beginTabContextUsageStream(tabId);
}
```

In `createMessageSendPreparationHost()` wire the method:

```typescript
transitionTabSessionLifecycle: (tabId, phase, reason) =>
  tabRuntime.transitionTabSessionLifecycle(tabId, phase, reason),
```

- [ ] **Step 7: Mark finalization through the send pipeline**

In `src/features/chat/runtime/SendPipelineTypes.ts`, add to the host type used by `StreamLocalFinalizer`:

```typescript
transitionTabSessionLifecycle(
  tabId: TabId | null,
  phase: WritableTabSessionPhase,
  reason: string,
): boolean;
```

In `src/features/chat/runtime/SendPipelineRuntime.ts`, pass the host method through `createSendPipelineRuntimeHost()`:

```typescript
transitionTabSessionLifecycle: (tabId, phase, reason) =>
  deps.transitionTabSessionLifecycle(tabId, phase, reason),
```

In `src/features/chat/OpenCodianView.ts`, add the dependency in `createSendPipelineHost()`:

```typescript
transitionTabSessionLifecycle: (tabId, phase, reason) =>
  this.conversationTabRuntimeCoordinator.transitionTabSessionLifecycle(tabId, phase, reason),
```

In `src/features/chat/runtime/StreamLocalFinalizer.ts`, add before `this.options.routedStream.resetStreamingState()`:

```typescript
this.options.host.transitionTabSessionLifecycle(
  this.options.preparedSend.tabId,
  'finalizing',
  'stream-local-finalizer',
);
```

In `markSyncInFlight()`, after setting `isConversationSyncInFlight`, add:

```typescript
this.options.host.transitionTabSessionLifecycle(
  this.options.preparedSend.tabId,
  'syncing',
  'stream-finalization-sync',
);
```

- [ ] **Step 8: Make sync runtime use the lifecycle owner**

In `src/features/chat/services/ConversationSyncRuntimeCoordinator.ts`, extend `ConversationSyncRuntime`:

```typescript
tabSessionLifecycle: TabSessionLifecycleState;
```

Extend `ConversationSyncRuntimeCoordinatorHost`:

```typescript
transitionTabSessionLifecycle(
  tabId: TabId | null,
  phase: WritableTabSessionPhase,
  reason: string,
): boolean;
```

Import the lifecycle types from `./TabSessionPhase`.

In `withConversationSyncLock()`, replace the direct in-flight writes:

```typescript
runtime.isConversationSyncInFlight = true;
this.host.transitionTabSessionLifecycle(tabId, 'syncing', 'conversation-sync-lock');
try {
  await callback({
    tabId,
    conversation,
    runtime,
  });
  return true;
} finally {
  runtime.isConversationSyncInFlight = false;
  this.host.transitionTabSessionLifecycle(tabId, 'idle', 'conversation-sync-unlock');
}
```

Wire `transitionTabSessionLifecycle` in `ConversationSyncHostAdapter`.

- [ ] **Step 9: Run lifecycle wiring tests**

Run:

```bash
npm run test -- tests/unit/features/chat/ConversationTabRuntimeCoordinator.phase.test.ts tests/unit/features/chat/ConversationSyncRuntimeCoordinator.test.ts --runInBand
```

Expected: PASS.

- [ ] **Step 10: Commit Task 2**

```bash
git add src/features/chat/services/ConversationTabRuntimeCoordinator.ts src/features/chat/services/MessageSendPreparationService.ts src/features/chat/runtime/SendPipelineTypes.ts src/features/chat/runtime/SendPipelineRuntime.ts src/features/chat/runtime/StreamLocalFinalizer.ts src/features/chat/services/ConversationSyncRuntimeCoordinator.ts src/features/chat/OpenCodianView.ts tests/unit/features/chat/ConversationTabRuntimeCoordinator.phase.test.ts tests/unit/features/chat/ConversationSyncRuntimeCoordinator.test.ts
git commit -m "refactor: route tab lifecycle transitions through runtime owner"
```

## Task 3: Add Per-Conversation Write Serialization

**Files:**
- Create: `src/features/chat/services/ConversationWriteSerializationService.ts`
- Test: `tests/unit/features/chat/ConversationWriteSerializationService.test.ts`

- [ ] **Step 1: Write the failing serialization tests**

Create `tests/unit/features/chat/ConversationWriteSerializationService.test.ts`:

```typescript
import type { Conversation } from '../../../../src/core/types';
import {
  ConversationWriteSerializationService,
} from '../../../../src/features/chat/services/ConversationWriteSerializationService';

function createConversation(id = 'conversation-1'): Conversation {
  return {
    id,
    title: 'Conversation',
    createdAt: 1,
    updatedAt: 1,
    openCodeSessionId: 'session-1',
    messages: [],
  };
}

describe('ConversationWriteSerializationService', () => {
  it('runs writes for the same conversation in order', async () => {
    const service = new ConversationWriteSerializationService();
    const conversation = createConversation();
    const events: string[] = [];

    await Promise.all([
      service.commit({
        conversation,
        ticket: service.createTicket(conversation.id),
        reason: 'first',
        write: async () => {
          events.push('first-start');
          await Promise.resolve();
          events.push('first-end');
        },
      }),
      service.commit({
        conversation,
        ticket: service.createTicket(conversation.id),
        reason: 'second',
        write: () => {
          events.push('second');
        },
      }),
    ]);

    expect(events).toEqual(['first-start', 'first-end', 'second']);
    expect(service.getVersion(conversation.id)).toBe(2);
  });

  it('skips stale tickets after a newer write has committed', async () => {
    const service = new ConversationWriteSerializationService();
    const conversation = createConversation();
    const staleTicket = service.createTicket(conversation.id);

    const fresh = await service.commit({
      conversation,
      ticket: service.createTicket(conversation.id),
      reason: 'fresh',
      write: () => {
        conversation.updatedAt = 2;
      },
    });
    const stale = await service.commit({
      conversation,
      ticket: staleTicket,
      reason: 'stale-sync',
      write: () => {
        conversation.updatedAt = 3;
      },
    });

    expect(fresh.applied).toBe(true);
    expect(stale.applied).toBe(false);
    expect(conversation.updatedAt).toBe(2);
    expect(service.getVersion(conversation.id)).toBe(1);
  });

  it('does not block another conversation id', async () => {
    const service = new ConversationWriteSerializationService();
    const first = createConversation('conversation-1');
    const second = createConversation('conversation-2');
    const events: string[] = [];
    let releaseFirst: (() => void) | null = null;

    const firstWrite = service.commit({
      conversation: first,
      ticket: service.createTicket(first.id),
      reason: 'first',
      write: () => new Promise<void>((resolve) => {
        releaseFirst = () => {
          events.push('first');
          resolve();
        };
      }),
    });

    await service.commit({
      conversation: second,
      ticket: service.createTicket(second.id),
      reason: 'second',
      write: () => {
        events.push('second');
      },
    });
    releaseFirst?.();
    await firstWrite;

    expect(events).toEqual(['second', 'first']);
  });
});
```

- [ ] **Step 2: Run the failing serialization test**

Run:

```bash
npm run test -- tests/unit/features/chat/ConversationWriteSerializationService.test.ts --runInBand
```

Expected: FAIL with a module resolution error for `ConversationWriteSerializationService`.

- [ ] **Step 3: Create the serialization service**

Create `src/features/chat/services/ConversationWriteSerializationService.ts`:

```typescript
import type { Conversation } from '../../../core/types';

export interface ConversationWriteTicket {
  readonly conversationId: string;
  readonly version: number;
}

export interface ConversationWriteCommitResult {
  readonly applied: boolean;
  readonly version: number;
  readonly reason: string;
}

export interface ConversationWriteCommitOptions {
  readonly conversation: Conversation;
  readonly ticket: ConversationWriteTicket;
  readonly reason: string;
  readonly write: () => void | Promise<void>;
}

export class ConversationWriteSerializationService {
  private readonly queues = new Map<string, Promise<void>>();
  private readonly versions = new Map<string, number>();

  createTicket(conversationId: string): ConversationWriteTicket {
    return {
      conversationId,
      version: this.getVersion(conversationId),
    };
  }

  getVersion(conversationId: string): number {
    return this.versions.get(conversationId) ?? 0;
  }

  async commit(options: ConversationWriteCommitOptions): Promise<ConversationWriteCommitResult> {
    const previous = this.queues.get(options.conversation.id) ?? Promise.resolve();

    let resolveQueue: () => void = () => undefined;
    const currentQueue = new Promise<void>((resolve) => {
      resolveQueue = resolve;
    });
    this.queues.set(options.conversation.id, previous.then(() => currentQueue, () => currentQueue));

    await previous.catch(() => undefined);

    try {
      const currentVersion = this.getVersion(options.conversation.id);
      if (
        options.ticket.conversationId !== options.conversation.id
        || options.ticket.version !== currentVersion
      ) {
        return {
          applied: false,
          version: currentVersion,
          reason: options.reason,
        };
      }

      await options.write();
      const nextVersion = currentVersion + 1;
      this.versions.set(options.conversation.id, nextVersion);
      return {
        applied: true,
        version: nextVersion,
        reason: options.reason,
      };
    } finally {
      resolveQueue();
      if (this.queues.get(options.conversation.id) === currentQueue) {
        this.queues.delete(options.conversation.id);
      }
    }
  }
}
```

- [ ] **Step 4: Run serialization tests**

Run:

```bash
npm run test -- tests/unit/features/chat/ConversationWriteSerializationService.test.ts --runInBand
```

Expected: PASS.

- [ ] **Step 5: Commit Task 3**

```bash
git add src/features/chat/services/ConversationWriteSerializationService.ts tests/unit/features/chat/ConversationWriteSerializationService.test.ts
git commit -m "refactor: add serialized conversation write service"
```

## Task 4: Route High-Risk Message Writes Through Serialized Commits

**Files:**
- Modify: `src/features/chat/OpenCodianView.ts`
- Modify: `src/features/chat/services/MessageSendPreparationService.ts`
- Modify: `src/features/chat/runtime/LocalStreamMessagePersistence.ts`
- Modify: `src/features/chat/services/MessageFinalizationService.ts`
- Modify: `src/features/chat/services/ConversationAuthoritativeReloadCoordinator.ts`
- Modify: `src/features/chat/services/ConversationAuthoritativeSyncCoordinator.ts`
- Test: `tests/unit/features/chat/ConversationAuthoritativeSyncCoordinator.test.ts`
- Test: `tests/unit/features/chat/ConversationAuthoritativeSyncCoordinator.canonicalProjection.test.ts`
- Test: `tests/unit/features/chat/ConversationSyncRuntimeCoordinator.test.ts`

- [ ] **Step 1: Add the write service to `OpenCodianView`**

In `src/features/chat/OpenCodianView.ts`, import:

```typescript
import {
  ConversationWriteSerializationService,
  type ConversationWriteTicket,
} from './services/ConversationWriteSerializationService';
```

Add a private field:

```typescript
private readonly conversationWriteSerializationService = new ConversationWriteSerializationService();
```

Add helper methods:

```typescript
private createConversationWriteTicket(conversationId: string): ConversationWriteTicket {
  return this.conversationWriteSerializationService.createTicket(conversationId);
}

private async commitConversationWrite(
  conversation: Conversation,
  ticket: ConversationWriteTicket,
  reason: string,
  write: () => void | Promise<void>,
): Promise<boolean> {
  const result = await this.conversationWriteSerializationService.commit({
    conversation,
    ticket,
    reason,
    write: async () => {
      await write();
      await this.plugin.saveConversation(conversation);
    },
  });
  return result.applied;
}
```

- [ ] **Step 2: Update message-send optimistic write host**

In `src/features/chat/services/MessageSendPreparationService.ts`, replace the host `saveConversation()` member with:

```typescript
createConversationWriteTicket(conversationId: string): ConversationWriteTicket;
commitConversationWrite(
  conversation: Conversation,
  ticket: ConversationWriteTicket,
  reason: string,
  write: () => void | Promise<void>,
): Promise<boolean>;
```

Import `ConversationWriteTicket` from `./ConversationWriteSerializationService`.

In `prepareMessageSend()`, before constructing the optimistic message, add:

```typescript
const writeTicket = this.host.createConversationWriteTicket(conversation.id);
```

Replace the direct push/update/save block:

```typescript
conversation.messages.push(userMessage);
conversation.updatedAt = userMessage.timestamp;
this.host.startConversationSyncLoop();
await this.host.saveConversation(conversation);
```

with:

```typescript
const optimisticWriteApplied = await this.host.commitConversationWrite(
  conversation,
  writeTicket,
  'optimistic-user-message',
  () => {
    conversation.messages.push(userMessage);
    conversation.updatedAt = userMessage.timestamp;
  },
);
if (!optimisticWriteApplied) {
  this.host.transitionTabSessionLifecycle(tabId, 'idle', 'optimistic-write-stale');
  return null;
}
this.host.startConversationSyncLoop();
```

In `createMessageSendPreparationHost()` inside `OpenCodianView.ts`, replace `saveConversation` wiring with:

```typescript
createConversationWriteTicket: (conversationId) =>
  this.createConversationWriteTicket(conversationId),
commitConversationWrite: (conversation, ticket, reason, write) =>
  this.commitConversationWrite(conversation, ticket, reason, write),
```

- [ ] **Step 3: Update local stream persistence**

In `src/features/chat/runtime/SendPipelineTypes.ts`, replace the persistence host save method with:

```typescript
createConversationWriteTicket(conversationId: string): ConversationWriteTicket;
commitConversationWrite(
  conversation: Conversation,
  ticket: ConversationWriteTicket,
  reason: string,
  write: () => void | Promise<void>,
): Promise<boolean>;
```

In `src/features/chat/runtime/LocalStreamMessagePersistence.ts`, before building or appending the assistant/notice message, add:

```typescript
const writeTicket = host.createConversationWriteTicket(preparedSend.conversation.id);
```

Replace direct message mutation and save with a commit:

```typescript
const applied = await host.commitConversationWrite(
  preparedSend.conversation,
  writeTicket,
  'local-stream-finalization',
  () => {
    if (outcome.hasStreamContentBlocks && outcome.streamContentBlocks) {
      writeShellDataset(runtime.streamingMessageEl, assistantMessage);
      preparedSend.conversation.messages.push(assistantMessage);
    } else if (outcome.streamErrorNoticeMessage) {
      appendNoticeMessage({
        conversation: preparedSend.conversation,
        host,
        message: outcome.streamErrorNoticeMessage,
        logAssistantFinalizationStage,
        stage: 'local-error-notice-appended',
      });
    } else if (outcome.interruptedNoticeMessage) {
      appendNoticeMessage({
        conversation: preparedSend.conversation,
        host,
        message: outcome.interruptedNoticeMessage,
        logAssistantFinalizationStage,
        stage: 'local-interrupted-notice-appended',
      });
    }

    preparedSend.conversation.updatedAt = outcome.finalizedTimestamp;
    preparedSend.conversation.lastResponseAt = outcome.finalizedTimestamp;
  },
);
if (!applied) {
  logAssistantFinalizationStage('local-stream-finalization-write-skipped', {
    reason: 'stale-conversation-write-ticket',
  });
  return;
}
```

Keep the existing log stages, but move the `conversation-saved-after-local-finalization` log after the commit and only emit it when `applied` is true.

- [ ] **Step 4: Update authoritative reload to use tickets around async fetch**

In `src/features/chat/services/ConversationAuthoritativeSyncCoordinator.ts`, add host methods:

```typescript
createConversationWriteTicket(conversationId: string): ConversationWriteTicket;
commitConversationWrite(
  conversation: Conversation,
  ticket: ConversationWriteTicket,
  reason: string,
  write: () => void | Promise<void>,
): Promise<boolean>;
```

Pass them into `ConversationAuthoritativeReloadCoordinator` through its existing host pick.

In `src/features/chat/services/ConversationAuthoritativeReloadCoordinator.ts`, at the start of `syncConversationMessagesFromServer()` and `syncConversationMessagesFromCanonicalState()`, add:

```typescript
const writeTicket = this.host.createConversationWriteTicket(conversation.id);
```

Change `applyConversationServerSyncMessages()` signature:

```typescript
private async applyConversationServerSyncMessages(
  conversation: Conversation,
  merged: ChatMessage[],
  changed: boolean,
  ticket: ConversationWriteTicket,
  reason: string,
): Promise<boolean>
```

Replace its body with:

```typescript
return this.host.commitConversationWrite(
  conversation,
  ticket,
  reason,
  () => {
    conversation.messages = merged;
    if (changed) {
      conversation.updatedAt = Date.now();
    }
  },
);
```

In both callers, capture the boolean:

```typescript
const writeApplied = await this.applyConversationServerSyncMessages(
  conversation,
  syncMerge.merged,
  syncMerge.cacheWritebackChanged,
  writeTicket,
  `authoritative-sync:${reason}`,
);
```

If `writeApplied` is false, return a no-change result using the current conversation messages:

```typescript
if (!writeApplied) {
  const fingerprint = this.host.getConversationSyncFingerprint(conversation.messages);
  return {
    messages: conversation.messages,
    changed: false,
    fingerprint,
    revertState: snapshot.revertState,
  };
}
```

- [ ] **Step 5: Update latest-user hydration and final error writes**

In `ConversationAuthoritativeSyncCoordinator.syncLatestUserMessageFromServer()`, create a ticket before `await this.getLatestServerUserMessageHydration(sessionId)`:

```typescript
const writeTicket = this.host.createConversationWriteTicket(conversation.id);
```

In `applyHydratedOptimisticUserMessage()`, replace direct splice/save with:

```typescript
const applied = await this.host.commitConversationWrite(
  conversation,
  writeTicket,
  'latest-user-message-hydration',
  () => {
    conversation.messages.splice(optimisticIndex, 1, mergedHydratedMessage);
  },
);
if (!applied) {
  return;
}
```

Update `HydratedOptimisticUserMessageUpdate` to include `writeTicket`.

In `MessageFinalizationService.finalizeAfterStream()`, replace:

```typescript
conversation.updatedAt = Date.now();
await this.host.saveConversation(conversation);
```

with:

```typescript
const finalSaveTicket = this.host.createConversationWriteTicket(conversation.id);
const finalSaveApplied = await this.host.commitConversationWrite(
  conversation,
  finalSaveTicket,
  'message-finalization-save',
  () => {
    conversation.updatedAt = Date.now();
  },
);
```

Log `conversation-final-save-complete` only when `finalSaveApplied` is true.

In `finalizeAssistantMessageWithError()`, create a ticket before pushing the error message and move the push/update into `commitConversationWrite()`.

- [ ] **Step 6: Wire all new host methods from `OpenCodianView`**

For every host factory in `OpenCodianView.ts` that currently passes:

```typescript
saveConversation: (conversation) => this.plugin.saveConversation(conversation),
```

use this replacement if the callee now mutates `conversation.messages` or `conversation.updatedAt`:

```typescript
createConversationWriteTicket: (conversationId) =>
  this.createConversationWriteTicket(conversationId),
commitConversationWrite: (conversation, ticket, reason, write) =>
  this.commitConversationWrite(conversation, ticket, reason, write),
```

Keep plain `saveConversation` only for modules that save metadata/settings fields and do not mutate `conversation.messages`.

- [ ] **Step 7: Run focused write-path tests**

Run:

```bash
npm run test -- tests/unit/features/chat/ConversationWriteSerializationService.test.ts tests/unit/features/chat/ConversationAuthoritativeSyncCoordinator.test.ts tests/unit/features/chat/ConversationAuthoritativeSyncCoordinator.canonicalProjection.test.ts tests/unit/features/chat/ConversationSyncRuntimeCoordinator.test.ts --runInBand
```

Expected: PASS.

- [ ] **Step 8: Commit Task 4**

```bash
git add src/features/chat/OpenCodianView.ts src/features/chat/services/MessageSendPreparationService.ts src/features/chat/runtime/SendPipelineTypes.ts src/features/chat/runtime/LocalStreamMessagePersistence.ts src/features/chat/services/MessageFinalizationService.ts src/features/chat/services/ConversationAuthoritativeReloadCoordinator.ts src/features/chat/services/ConversationAuthoritativeSyncCoordinator.ts tests/unit/features/chat/ConversationWriteSerializationService.test.ts tests/unit/features/chat/ConversationAuthoritativeSyncCoordinator.test.ts tests/unit/features/chat/ConversationAuthoritativeSyncCoordinator.canonicalProjection.test.ts tests/unit/features/chat/ConversationSyncRuntimeCoordinator.test.ts
git commit -m "refactor: serialize conversation message writes"
```

## Task 5: Documentation, Graph, And Verification

**Files:**
- Create: `docs/modules/features/chat/services/TabSessionLifecycleState.md`
- Create: `docs/modules/features/chat/services/ConversationWriteSerializationService.md`
- Modify: `docs/modules/features/chat/services/TabSessionPhase.md`
- Modify: `docs/modules/features/chat/services/ConversationSyncRuntimeCoordinator.md`
- Modify: `docs/status/session-lifecycle-council-review-2026-05-10.md`
- Generated: `graphify-out/**`

- [ ] **Step 1: Create module doc for `TabSessionLifecycleState`**

Create `docs/modules/features/chat/services/TabSessionLifecycleState.md`:

```markdown
# TabSessionLifecycleState

> **源码**: `src/features/chat/services/TabSessionLifecycleState.ts`
> **状态**: [REVIEW]
> **最近更新**: writable tab session lifecycle state machine

## 概述

`TabSessionLifecycleState` 是每个 chat tab 的可写生命周期状态机。它负责把 send preparation、streaming、local finalization、authoritative sync 和 terminal idle/error/cancel 状态收束成一个带 `sequence` 的小状态对象。

## 公开接口

```typescript
export type WritableTabSessionPhase =
  | 'idle'
  | 'preparing'
  | 'streaming'
  | 'finalizing'
  | 'syncing'
  | 'cancelled'
  | 'error';

export type TabSessionPhase =
  | WritableTabSessionPhase
  | 'compacting'
  | 'server-busy'
  | 'server-retrying';

export interface TabSessionLifecycleState {
  readonly phase: WritableTabSessionPhase;
  readonly sequence: number;
  readonly reason: string | null;
  readonly changedAt: number;
}
```

## 关键行为

- 每个 transition 都递增 `sequence`，让后续 runtime/debug 逻辑能判断状态是否推进过。
- `preparing`、`streaming`、`finalizing`、`syncing` 都是 foreground busy，避免 finalization sync 窗口内再次发送。
- `compacting`、`server-busy`、`server-retrying` 是派生 overlay，不写回 lifecycle owner。

## 边界

- 本模块不保存 conversation，不读取 DOM，不拉取 OpenCode Server。
- `ConversationTabRuntimeCoordinator` 是写入入口；其他服务通过 coordinator host 方法请求 transition。
```

- [ ] **Step 2: Create module doc for `ConversationWriteSerializationService`**

Create `docs/modules/features/chat/services/ConversationWriteSerializationService.md`:

```markdown
# ConversationWriteSerializationService

> **源码**: `src/features/chat/services/ConversationWriteSerializationService.ts`
> **状态**: [REVIEW]
> **最近更新**: per-conversation write serialization and monotonic tickets

## 概述

`ConversationWriteSerializationService` 为 `Conversation.messages` compatibility cache 提供 per-conversation 写入队列。它用 `ConversationWriteTicket` 捕获异步读取前的版本，并在 commit 时跳过已经过期的写入，防止 finalization sync、latest-user hydration、background polling 等异步路径互相覆盖。

## 公开接口

```typescript
export interface ConversationWriteTicket {
  readonly conversationId: string;
  readonly version: number;
}

export class ConversationWriteSerializationService {
  createTicket(conversationId: string): ConversationWriteTicket;
  getVersion(conversationId: string): number;
  commit(options: ConversationWriteCommitOptions): Promise<ConversationWriteCommitResult>;
}
```

## 关键行为

- 同一个 conversation id 的 commit 串行执行。
- 不同 conversation id 的 commit 互不阻塞。
- 当 ticket version 与当前 version 不一致时，commit 返回 `applied: false`，不会执行 write 回调。

## 边界

- 本模块不决定如何 merge authoritative messages。
- 本模块不调用 `plugin.saveConversation()`；保存动作由 `OpenCodianView.commitConversationWrite()` 注入。
```

- [ ] **Step 3: Update existing module docs**

Update `docs/modules/features/chat/services/TabSessionPhase.md`:

```markdown
# TabSessionPhase

> **源码**: `src/features/chat/services/TabSessionPhase.ts`
> **状态**: [REVIEW]
> **最近更新**: compatibility wrapper over writable tab lifecycle state

## 概述

`TabSessionPhase` 现在是 `TabSessionLifecycleState` 的兼容导出与 UI phase helper。可写 lifecycle phase 由 `ConversationTabRuntimeCoordinator` 维护；本模块只负责把 lifecycle、context compaction、同 session 其他 tab streaming、server busy/retry 信号折叠成 UI 可读 phase。

## 关键行为

- `preparing`、`streaming`、`finalizing`、`syncing` 来自 writable lifecycle state，并且都是 foreground busy。
- `compacting`、`server-busy`、`server-retrying` 仍是 overlay phase，不写回 lifecycle owner。
- 旧调用方仍可通过 `deriveTabSessionPhase()` 传入 `isStreaming` / `isConversationSyncInFlight`，但新代码应优先传入 `lifecycle`。
```

Update `docs/modules/features/chat/services/ConversationSyncRuntimeCoordinator.md`:

```markdown
## 最近更新

`ConversationSyncRuntimeCoordinator` 现在在进入/退出 sync lock 时同步推进 `TabSessionLifecycleState`。`syncing` 是 foreground busy phase，因为 authoritative sync 可能写回 `Conversation.messages` cache，发送入口必须等它完成后再接受下一条用户消息。
```

- [ ] **Step 4: Link the council review to this plan**

Append to `docs/status/session-lifecycle-council-review-2026-05-10.md` before the final status note:

```markdown
## 10. 实施计划

- Tier 1 施工图：`docs/superpowers/plans/2026-05-10-session-lifecycle-tier1-convergence.md`
- 本计划覆盖 per-tab writable lifecycle state machine 与 per-conversation write serialization。
- LRU full-message cache 与 canonical session eviction 需要独立计划承接，避免与 Tier 1 一致性改动混在同一批实现。
```

- [ ] **Step 5: Refresh graphify after source changes**

Run:

```bash
npm run graphify:update:src
```

Expected: command exits 0 and updates committed root `graphify-out/` artifacts.

- [ ] **Step 6: Run module-doc and graph gates**

Run:

```bash
npm run check:module-docs
```

Expected: PASS.

Run:

```bash
npm run check:graphify
```

Expected: PASS.

- [ ] **Step 7: Run full verification**

Run:

```bash
npm run verify
```

Expected: PASS with lint reporting `0 errors / 0 warnings`.

- [ ] **Step 8: Commit Task 5**

```bash
git add docs/modules/features/chat/services/TabSessionLifecycleState.md docs/modules/features/chat/services/ConversationWriteSerializationService.md docs/modules/features/chat/services/TabSessionPhase.md docs/modules/features/chat/services/ConversationSyncRuntimeCoordinator.md docs/status/session-lifecycle-council-review-2026-05-10.md graphify-out
git commit -m "docs: record session lifecycle tier1 convergence"
```

## Self-Review

Spec coverage:

- Council Tier 1 improvement 1 maps to Tasks 1 and 2.
- Council Tier 1 improvement 2 maps to Tasks 3 and 4.
- Council doc/module/graph gates map to Task 5.
- Council Tier 2 and Tier 3 items are deliberately excluded and named in the scope check.

Placeholder scan:

- The plan uses concrete paths, concrete test names, concrete commands, and concrete code blocks.
- No step relies on unspecified error handling or unspecified tests.

Type consistency:

- `WritableTabSessionPhase`, `TabSessionPhase`, `TabSessionLifecycleState`, and `ConversationWriteTicket` are introduced before use.
- Host methods use the same names across service, runtime, and `OpenCodianView` wiring:
  - `transitionTabSessionLifecycle()`
  - `createConversationWriteTicket()`
  - `commitConversationWrite()`

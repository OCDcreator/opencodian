# Session Lifecycle Tier 4 Write Conflict Observability Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Close the remaining Council deductions around write-layer conflict awareness and long-running observability without migrating runtime reads to a canonical-only model.

**Architecture:** Keep the four-layer session lifecycle shape intact: `OpenCodeSessionStateStore -> ConversationWriteSerializationService -> ConversationFullMessageCache -> TabSessionLifecycleState`. Tier 4 adds conservative guardrails inside existing owners: `StorageService` protects stored full messages from stale overwrite, `ConversationWriteSerializationService` exposes queue depth and rejects new writes only when a configured circuit breaker opens, and `ConversationSyncRuntimeCoordinator` reports stuck `syncing` locks without rewriting the state machine.

**Tech Stack:** TypeScript, Jest, Obsidian vault adapter persistence, existing chat/runtime services, existing module docs, `npm run graphify:update:src`, `npm run verify`.

---

## Scope Check

Tier 4 covers only:

- `saveConversation` write-layer conflict awareness.
- `ConversationWriteSerializationService` queue depth diagnostics and circuit breaker behavior.
- `syncing` phase timeout diagnostics and recovery boundaries.

Tier 4 explicitly does not cover:

- canonical-only runtime read migration.
- background-task sub-session redesign.
- new thin helper / adapter / provider / factory files.
- expansion of runtime ownership in `OpenCodianView.ts`, `OpenCodeService.ts`, or `src/main.ts`.
- deploy-relevant UI, style, manifest, settings, or theme changes.

## Current Risk Judgment

### saveConversation conflict awareness

Risk: medium, with one narrow safe first step.

Current hot message writes go through `OpenCodianView.commitConversationWrite()`, which uses `ConversationWriteSerializationService` before calling `plugin.saveConversation()`. That protects send, local stream persistence, authoritative sync/reload, and message finalization paths that already use the host ports.

The remaining risk is below that boundary: `StorageService.saveConversation()` serializes the incoming `Conversation` object as a full `sessions/{id}.json` replacement. `OpenCodianPlugin.saveConversation()` already reloads full messages when the incoming object has `messages.length === 0`, but it cannot detect a stale non-empty message array. A stale object with older messages can still overwrite a newer stored file while carrying legitimate metadata updates such as title or title-generation status.

Tier 4 should not start with broad CAS. `updatedAt` is user-visible conversation recency, not a storage revision. It can be equal, copied from stale objects, or updated for metadata-only changes, so treating it as a hard compare-and-swap token would create false conflicts. Field-level metadata merge is useful, but only for a small first guard: preserve stored full messages when the incoming message list is clearly older than the stored list.

Recommended first step: a stale full-message overwrite guard in `StorageService.saveConversation()`:

- read the existing session file only when it exists;
- if stored messages are non-empty and incoming messages are empty or a prefix of stored messages, write incoming metadata with stored messages;
- log a structured warning/debug diagnostic;
- do not attempt arbitrary message reconciliation when IDs diverge.

### write queue circuit breaker and queue depth

Risk: medium-low in normal use, medium in pathological storage stalls.

Tier 3 already added shared default queue state and diagnostic timeout logging in `ConversationWriteSerializationService`. The current timeout is intentionally observation-only. It does not cancel, skip, or reorder a write, which is correct because `StorageService.saveConversation()` has no cancellable write or CAS semantics.

The remaining gap is continuous visibility and a bounded queue growth policy. A slow first write can leave later writes pending indefinitely; the service can report one timeout, but it does not expose depth changes and it will continue accepting new writes forever.

Recommended first step:

- add queue depth diagnostics on enqueue/dequeue;
- add a high-water `maxQueueDepth` circuit breaker with a bounded default in the 50-100 range;
- when the breaker opens, reject only the new write before enqueueing it and return `applied: false`;
- guarantee a warning at the service boundary for every rejected write so guarded callers do not need to grow runtime ownership;
- never let a timed-out later write bypass the older write.

### syncing timeout diagnostics

Risk: medium-low, because `finally` releases the lock when callbacks settle, but stuck promises have no independent timer.

`ConversationSyncRuntimeCoordinator.withConversationSyncLock()` sets `runtime.isConversationSyncInFlight = true`, transitions the tab lifecycle to `syncing`, awaits the callback, and clears in `finally`. If canonical/server sync never resolves, the tab remains foreground-busy and background task sync skips the tab forever.

Recommended first step:

- add a timer inside the existing coordinator while a sync lock is held;
- report tab id, conversation id, session id, lock age, lifecycle phase/reason, and sync kind;
- include `isStreaming` in the timeout diagnostic so a stuck-sync report can distinguish pure sync stalls from unexpected stream/sync overlap;
- clear the timer in `finally`;
- do not auto-unlock on timeout in the first pass.

Recovery boundary: the first implementation should define recovery as "eventual callback settlement releases the lock." Explicit forced unlock can be a later operator action only if diagnostics show real stuck locks in production.

## File Structure

- Modify `src/core/storage/StorageService.ts`
  - Add stale full-message overwrite guard inside the existing persistence owner.
  - Keep metadata sidecar writing in the same method.
- Modify `tests/unit/core/storage/StorageService.test.ts`
  - Cover preserving stored messages while accepting incoming metadata.
  - Cover not merging divergent message histories.
- Modify `docs/modules/core/storage/StorageService.md`
  - Document the stale overwrite guard and its limits.
- Modify `src/features/chat/services/ConversationWriteSerializationService.ts`
  - Add queue depth diagnostics and optional circuit breaker rejection.
- Modify `tests/unit/features/chat/ConversationWriteSerializationService.test.ts`
  - Cover depth callbacks, breaker rejection, and preserved FIFO order.
- Modify `docs/modules/features/chat/services/ConversationWriteSerializationService.md`
  - Document depth metrics and breaker behavior.
- Modify `src/features/chat/services/ConversationSyncRuntimeCoordinator.ts`
  - Add sync lock timeout diagnostics only.
- Modify `tests/unit/features/chat/ConversationSyncRuntimeCoordinator.test.ts`
  - Cover timeout reporting, timer cleanup, and no automatic unlock.
- Modify `docs/modules/features/chat/services/ConversationSyncRuntimeCoordinator.md`
  - Document timeout diagnostics and recovery boundary.
- Generated if any `src/` file changes:
  - `graphify-out/**` via `npm run graphify:update:src`.

## Task 1: Add StorageService Stale Full-Message Overwrite Guard

**Files:**
- Modify: `src/core/storage/StorageService.ts`
- Test: `tests/unit/core/storage/StorageService.test.ts`
- Docs: `docs/modules/core/storage/StorageService.md`

- [ ] **Step 1: Add failing tests for stale full-message preservation**

Add these tests inside `describe('StorageService conversation persistence - saveConversation', () => { ... })`:

```typescript
  it('preserves stored full messages when an incoming conversation has stale prefix messages', async () => {
    mockAdapter.exists.mockImplementation(async (path: string) =>
      path === '.opencodian/sessions/conv-stale.json');
    mockAdapter.read.mockResolvedValue(JSON.stringify({
      id: 'conv-stale',
      title: 'Old title',
      createdAt: 100,
      updatedAt: 200,
      openCodeSessionId: 'session-stale',
      messages: [
        { id: 'user-1', role: 'user', content: 'one', timestamp: 100 },
        { id: 'assistant-1', role: 'assistant', content: 'two', timestamp: 150 },
      ],
    }));

    await storage.saveConversation({
      id: 'conv-stale',
      title: 'New title',
      createdAt: 100,
      updatedAt: 300,
      openCodeSessionId: 'session-stale',
      messages: [
        { id: 'user-1', role: 'user', content: 'one', timestamp: 100 },
      ],
    } as never);

    const savedData = JSON.parse(mockAdapter.write.mock.calls[0][1]);
    expect(savedData.title).toBe('New title');
    expect(savedData.updatedAt).toBe(300);
    expect(savedData.messages.map((message: { id: string }) => message.id)).toEqual([
      'user-1',
      'assistant-1',
    ]);
    expect(savedData.messageCount).toBe(2);
  });

  it('does not merge stored messages when incoming and stored histories diverge', async () => {
    mockAdapter.exists.mockImplementation(async (path: string) =>
      path === '.opencodian/sessions/conv-diverged.json');
    mockAdapter.read.mockResolvedValue(JSON.stringify({
      id: 'conv-diverged',
      title: 'Stored',
      createdAt: 100,
      updatedAt: 200,
      openCodeSessionId: 'session-diverged',
      messages: [
        { id: 'user-stored', role: 'user', content: 'stored', timestamp: 100 },
      ],
    }));

    await storage.saveConversation({
      id: 'conv-diverged',
      title: 'Incoming',
      createdAt: 100,
      updatedAt: 300,
      openCodeSessionId: 'session-diverged',
      messages: [
        { id: 'user-incoming', role: 'user', content: 'incoming', timestamp: 100 },
      ],
    } as never);

    const savedData = JSON.parse(mockAdapter.write.mock.calls[0][1]);
    expect(savedData.messages.map((message: { id: string }) => message.id)).toEqual([
      'user-incoming',
    ]);
  });
```

- [ ] **Step 2: Run the failing focused storage tests**

Run:

```bash
npm run test -- tests/unit/core/storage/StorageService.test.ts --runInBand
```

Expected: FAIL because `StorageService.saveConversation()` does not read the existing session before full replacement.

- [ ] **Step 3: Add narrow stored-message merge logic in StorageService**

Inside `src/core/storage/StorageService.ts`, add an internal stored conversation shape near the existing settings interfaces:

```typescript
type StoredConversationRecord = Conversation & { messageCount?: number };
```

Change `saveConversation()` so it resolves the persisted conversation before building `data`:

```typescript
  async saveConversation(conversation: Conversation): Promise<void> {
    const conversationPath = this.getConversationPath(conversation.id);
    const persistedConversation = await this.resolveConversationForPersistence(
      conversation,
      conversationPath,
    );

    const data = {
      id: persistedConversation.id,
      title: persistedConversation.title,
      createdAt: persistedConversation.createdAt,
      updatedAt: persistedConversation.updatedAt,
      lastResponseAt: persistedConversation.lastResponseAt,
      titleGenerationStatus: persistedConversation.titleGenerationStatus,
      messageCount: persistedConversation.messages.length,
      openCodeSessionId: persistedConversation.openCodeSessionId,
      currentNote: persistedConversation.currentNote,
      externalContextPaths: persistedConversation.externalContextPaths,
      sessionSettings: normalizeConversationSessionSettings(persistedConversation.sessionSettings),
      backgroundTaskMetadata: persistedConversation.backgroundTaskMetadata,
      messages: persistedConversation.messages,
    };
```

Add these private methods inside `StorageService`:

```typescript
  private async resolveConversationForPersistence(
    conversation: Conversation,
    conversationPath: string,
  ): Promise<Conversation> {
    const storedConversation = await this.readStoredConversationForMerge(conversationPath);
    if (!storedConversation) {
      return conversation;
    }

    return this.mergeStoredMessagesIfIncomingLooksStale(conversation, storedConversation);
  }

  private async readStoredConversationForMerge(
    conversationPath: string,
  ): Promise<StoredConversationRecord | null> {
    const normalizedPath = normalizePath(conversationPath);
    try {
      if (!(await this.app.vault.adapter.exists(normalizedPath))) {
        return null;
      }
      const content = await this.app.vault.adapter.read(normalizedPath);
      const parsed = JSON.parse(content) as Partial<StoredConversationRecord>;
      if (!parsed || typeof parsed.id !== 'string' || !Array.isArray(parsed.messages)) {
        return null;
      }
      return parsed as StoredConversationRecord;
    } catch (error) {
      logger.warn('Skipped stored conversation merge guard after read failure', {
        conversationPath,
        error: error instanceof Error ? error.message : String(error),
      });
      return null;
    }
  }

  private mergeStoredMessagesIfIncomingLooksStale(
    incoming: Conversation,
    stored: StoredConversationRecord,
  ): Conversation {
    if (stored.id !== incoming.id || stored.messages.length === 0) {
      return incoming;
    }
    if (incoming.messages.length >= stored.messages.length) {
      return incoming;
    }

    const incomingIsStoredPrefix = incoming.messages.every((message, index) =>
      typeof message.id === 'string'
        && stored.messages[index]?.id === message.id);
    if (!incomingIsStoredPrefix) {
      logger.warn('Detected divergent conversation histories during saveConversation', {
        conversationId: incoming.id,
        incomingMessageCount: incoming.messages.length,
        storedMessageCount: stored.messages.length,
      });
      return incoming;
    }

    logger.warn('Preserved stored full messages from stale conversation overwrite', {
      conversationId: incoming.id,
      incomingMessageCount: incoming.messages.length,
      storedMessageCount: stored.messages.length,
    });
    return {
      ...incoming,
      messages: stored.messages,
    };
  }
```

Do not merge arbitrary divergent histories in this task.

- [ ] **Step 4: Run focused storage tests**

Run:

```bash
npm run test -- tests/unit/core/storage/StorageService.test.ts --runInBand
```

Expected: PASS.

- [ ] **Step 5: Update StorageService module docs**

Add this under "会话持久化" in `docs/modules/core/storage/StorageService.md`:

```markdown
保存完整 conversation 前，`StorageService` 会对已有 `sessions/{id}.json` 做一个窄范围 stale-overwrite guard：如果待保存对象的 message 列表为空或只是磁盘中完整 message 列表的前缀，则保存新的 metadata 字段但保留磁盘中的完整 messages。这个保护只防止旧 full-message 快照覆盖新消息，不做任意历史分叉合并；如果 message id 序列已经分叉，会记录诊断并按调用方传入对象保存。
```

## Task 2: Add Queue Depth Diagnostics And Circuit Breaker

**Files:**
- Modify: `src/features/chat/services/ConversationWriteSerializationService.ts`
- Test: `tests/unit/features/chat/ConversationWriteSerializationService.test.ts`
- Docs: `docs/modules/features/chat/services/ConversationWriteSerializationService.md`

- [ ] **Step 1: Add failing tests for depth and circuit behavior**

Append these tests inside `describe('ConversationWriteSerializationService hardening', () => { ... })`:

```typescript
  it('reports queue depth changes on enqueue and drain', async () => {
    const onQueueDepthChange = jest.fn();
    const service = new ConversationWriteSerializationService({
      scope: 'instance',
      onQueueDepthChange,
    });
    const conversation = createConversation('depth-conversation');
    let releaseFirst: (() => void) | null = null;

    const first = service.commit({
      conversation,
      ticket: service.createTicket(conversation.id),
      reason: 'first',
      write: () => new Promise<void>((resolve) => {
        releaseFirst = resolve;
      }),
    });
    const second = service.commit({
      conversation,
      ticket: service.createTicket(conversation.id),
      reason: 'second',
      write: () => undefined,
    });

    expect(onQueueDepthChange).toHaveBeenCalledWith(expect.objectContaining({
      conversationId: conversation.id,
      pendingWrites: 1,
      newestReason: 'first',
    }));
    expect(onQueueDepthChange).toHaveBeenCalledWith(expect.objectContaining({
      conversationId: conversation.id,
      pendingWrites: 2,
      newestReason: 'second',
    }));

    releaseFirst?.();
    await Promise.all([first, second]);

    expect(onQueueDepthChange).toHaveBeenLastCalledWith(expect.objectContaining({
      conversationId: conversation.id,
      pendingWrites: 0,
    }));
  });

  it('rejects new writes when max queue depth is reached without reordering existing writes', async () => {
    const onQueueRejected = jest.fn();
    const service = new ConversationWriteSerializationService({
      scope: 'instance',
      maxQueueDepth: 1,
      onQueueRejected,
    });
    const conversation = createConversation('breaker-conversation');
    const events: string[] = [];
    let releaseFirst: (() => void) | null = null;

    const first = service.commit({
      conversation,
      ticket: service.createTicket(conversation.id),
      reason: 'first',
      write: () => new Promise<void>((resolve) => {
        events.push('first-start');
        releaseFirst = () => {
          events.push('first-end');
          resolve();
        };
      }),
    });
    const rejected = await service.commit({
      conversation,
      ticket: service.createTicket(conversation.id),
      reason: 'second',
      write: () => {
        events.push('second');
      },
    });

    expect(rejected.applied).toBe(false);
    expect(rejected.rejected).toBe(true);
    expect(onQueueRejected).toHaveBeenCalledWith(expect.objectContaining({
      conversationId: conversation.id,
      pendingWrites: 1,
      rejectedReason: 'second',
    }));
    expect(events).toEqual(['first-start']);

    releaseFirst?.();
    await first;
    expect(events).toEqual(['first-start', 'first-end']);
    expect(service.getVersion(conversation.id)).toBe(1);
  });
```

- [ ] **Step 2: Run the failing focused serializer tests**

Run:

```bash
npm run test -- tests/unit/features/chat/ConversationWriteSerializationService.test.ts --runInBand
```

Expected: FAIL because the service does not yet expose `onQueueDepthChange`, `maxQueueDepth`, or rejected commit metadata.

- [ ] **Step 3: Extend diagnostics types without changing FIFO semantics**

In `ConversationWriteSerializationService.ts`, add:

```typescript
export interface ConversationWriteQueueDepthDiagnostic {
  readonly conversationId: string;
  readonly pendingWrites: number;
  readonly oldestReason: string | null;
  readonly newestReason: string | null;
}

export interface ConversationWriteQueueRejectedDiagnostic
  extends ConversationWriteQueueDepthDiagnostic {
  readonly rejectedReason: string;
  readonly maxQueueDepth: number;
}
```

Extend `ConversationWriteCommitResult`:

```typescript
export interface ConversationWriteCommitResult {
  readonly applied: boolean;
  readonly version: number;
  readonly reason: string;
  readonly rejected?: boolean;
}
```

Extend `ConversationWriteSerializationOptions`:

```typescript
  readonly maxQueueDepth?: number;
  readonly onQueueDepthChange?: (diagnostic: ConversationWriteQueueDepthDiagnostic) => void;
  readonly onQueueRejected?: (diagnostic: ConversationWriteQueueRejectedDiagnostic) => void;
```

Store the callbacks and `maxQueueDepth` as private fields. Implementation update from Council review: default `maxQueueDepth` should be bounded, not unbounded. Use `75` when callers do not provide a positive value.

- [ ] **Step 4: Reject only new writes when the breaker is open**

At the start of `commit()`, before `incrementPendingWriteCount()`, add:

```typescript
    const pendingWrites = this.getPendingWriteCount(conversationId);
    if (this.maxQueueDepth !== null && pendingWrites >= this.maxQueueDepth) {
      this.reportQueueRejected(conversationId, options.reason);
      return Promise.resolve({
        applied: false,
        rejected: true,
        version: this.getVersion(conversationId),
        reason: options.reason,
      });
    }
```

After every enqueue and dequeue, call `reportQueueDepthChange(conversationId)`. Implement the report methods using the existing `queueDiagnostics` entries for oldest/newest reason. This must not resolve, reject, or reorder an already-enqueued write.

- [ ] **Step 5: Run focused serializer tests**

Run:

```bash
npm run test -- tests/unit/features/chat/ConversationWriteSerializationService.test.ts --runInBand
```

Expected: PASS.

- [ ] **Step 6: Update serializer module docs**

Add:

```markdown
- queue depth diagnostics report depth changes on enqueue/dequeue for each conversation queue.
- optional circuit breaker rejects only new writes once a configured max depth is reached. It returns `applied: false` with `rejected: true`; it never lets later writes bypass older writes and never cancels an already-started storage write.
```

## Task 3: Add syncing Phase Timeout Diagnostics

**Files:**
- Modify: `src/features/chat/services/ConversationSyncRuntimeCoordinator.ts`
- Test: `tests/unit/features/chat/ConversationSyncRuntimeCoordinator.test.ts`
- Docs: `docs/modules/features/chat/services/ConversationSyncRuntimeCoordinator.md`

- [ ] **Step 1: Add failing timeout diagnostics tests**

Append these tests to `tests/unit/features/chat/ConversationSyncRuntimeCoordinator.test.ts`:

```typescript
  it('reports a stuck syncing lock without clearing it automatically', async () => {
    jest.useFakeTimers();
    try {
      const onSyncTimeout = jest.fn();
      const { service, runtime } = createService({
        syncTimeoutMs: 25,
        onSyncTimeout,
      });
      const conversation = createConversation();
      let releaseSync: (() => void) | null = null;

      const sync = service.runVisibleConversationSync(
        conversation,
        () => new Promise<void>((resolve) => {
          releaseSync = resolve;
        }),
      );
      await Promise.resolve();

      expect(runtime?.isConversationSyncInFlight).toBe(true);
      await jest.advanceTimersByTimeAsync(25);

      expect(onSyncTimeout).toHaveBeenCalledWith(expect.objectContaining({
        tabId: 'tab-1',
        conversationId: conversation.id,
        openCodeSessionId: conversation.openCodeSessionId,
        phase: 'syncing',
        reason: 'conversation-sync-lock',
      }));
      expect(runtime?.isConversationSyncInFlight).toBe(true);

      releaseSync?.();
      await sync;
      expect(runtime?.isConversationSyncInFlight).toBe(false);
    } finally {
      jest.useRealTimers();
    }
  });

  it('clears the syncing timeout timer after a fast sync completes', async () => {
    jest.useFakeTimers();
    try {
      const onSyncTimeout = jest.fn();
      const { service } = createService({
        syncTimeoutMs: 25,
        onSyncTimeout,
      });

      await service.runVisibleConversationSync(createConversation(), async () => undefined);
      await jest.advanceTimersByTimeAsync(25);

      expect(onSyncTimeout).not.toHaveBeenCalled();
    } finally {
      jest.useRealTimers();
    }
  });
```

If `createService()` currently takes no options, extend the test helper in the same test file:

```typescript
function createService(options: ConversationSyncRuntimeCoordinatorOptions = {}) {
  const service = new ConversationSyncRuntimeCoordinator(host, options);
  return { service, runtime, transitionTabSessionLifecycle };
}
```

- [ ] **Step 2: Run the failing focused sync tests**

Run:

```bash
npm run test -- tests/unit/features/chat/ConversationSyncRuntimeCoordinator.test.ts --runInBand
```

Expected: FAIL because `ConversationSyncRuntimeCoordinator` has no timeout options.

- [ ] **Step 3: Add sync timeout diagnostics to the existing coordinator**

In `ConversationSyncRuntimeCoordinator.ts`, add:

```typescript
export interface ConversationSyncTimeoutDiagnostic {
  readonly tabId: TabId;
  readonly conversationId: string;
  readonly openCodeSessionId: string;
  readonly ageMs: number;
  readonly phase: string;
  readonly reason: string | null;
}

export interface ConversationSyncRuntimeCoordinatorOptions {
  readonly syncTimeoutMs?: number;
  readonly onSyncTimeout?: (diagnostic: ConversationSyncTimeoutDiagnostic) => void;
  readonly now?: () => number;
  readonly setTimeout?: (callback: () => void, delayMs: number) => ReturnType<typeof setTimeout>;
  readonly clearTimeout?: (handle: ReturnType<typeof setTimeout>) => void;
}
```

Update the constructor:

```typescript
  constructor(
    private readonly host: ConversationSyncRuntimeCoordinatorHost,
    options: ConversationSyncRuntimeCoordinatorOptions = {},
  ) {
    this.syncTimeoutMs = typeof options.syncTimeoutMs === 'number' && options.syncTimeoutMs > 0
      ? options.syncTimeoutMs
      : 20_000;
    this.onSyncTimeout = options.onSyncTimeout ?? ((diagnostic) => {
      logger.warn('Conversation sync lock is still pending', diagnostic);
    });
    this.now = options.now ?? (() => Date.now());
    this.setTimer = options.setTimeout ?? ((callback, delayMs) => setTimeout(callback, delayMs));
    this.clearTimer = options.clearTimeout ?? ((handle) => clearTimeout(handle));
  }
```

Import `createLogger`, define `logger`, and add private fields for the options.

Inside `withConversationSyncLock()`, start the timer immediately after transitioning to `syncing`:

```typescript
    const syncStartedAt = this.now();
    const timeoutHandle = this.setTimer(() => {
      this.reportSyncTimeout(tabId, conversation, runtime, syncStartedAt);
    }, this.syncTimeoutMs);
```

Clear the timer in `finally` before clearing the runtime lock:

```typescript
      this.clearTimer(timeoutHandle);
      runtime.isConversationSyncInFlight = false;
      this.host.transitionTabSessionLifecycle(tabId, 'idle', 'conversation-sync-lock-release');
```

Add:

```typescript
  private reportSyncTimeout(
    tabId: TabId,
    conversation: Conversation,
    runtime: ConversationSyncRuntime,
    startedAt: number,
  ): void {
    this.onSyncTimeout({
      tabId,
      conversationId: conversation.id,
      openCodeSessionId: conversation.openCodeSessionId,
      ageMs: this.now() - startedAt,
      phase: runtime.tabSessionLifecycle.phase,
      reason: runtime.tabSessionLifecycle.reason,
    });
  }
```

Do not auto-clear `isConversationSyncInFlight` in the timeout callback.

- [ ] **Step 4: Run focused sync tests**

Run:

```bash
npm run test -- tests/unit/features/chat/ConversationSyncRuntimeCoordinator.test.ts --runInBand
```

Expected: PASS.

- [ ] **Step 5: Update sync runtime module docs**

Add:

```markdown
- `syncing` timeout diagnostics are lock-observation only. A timeout logs tab/conversation/session identity plus lifecycle phase and reason; the coordinator keeps the lock until the original callback settles and the existing `finally` path releases it.
- Include `isStreaming` in the timeout diagnostic payload.
- Tier 4 intentionally does not add forced unlock. Forced unlock would be a later operator recovery feature because it can race with an in-flight canonical/server sync callback.
```

## Task 4: Graph, Module Docs, And Full Verification

**Files:**
- Generated: `graphify-out/**`

- [ ] **Step 1: Refresh graphify after source edits**

Run:

```bash
npm run graphify:update:src
```

Expected: PASS and no transient `src/graphify-out/` remains.

- [ ] **Step 2: Run focused tests together**

Run:

```bash
npm run test -- tests/unit/core/storage/StorageService.test.ts tests/unit/features/chat/ConversationWriteSerializationService.test.ts tests/unit/features/chat/ConversationSyncRuntimeCoordinator.test.ts --runInBand
```

Expected: PASS.

- [ ] **Step 3: Run module-doc guard**

Run:

```bash
npm run check:module-docs
```

Expected: PASS.

- [ ] **Step 4: Run full verification**

Run:

```bash
npm run verify
```

Expected: PASS with lint, typecheck, tests, graphify, module-doc, devlog-order, and production build gates green.

- [ ] **Step 5: Deployment decision**

No Test Vault deployment is required if implementation only touches the files listed in this plan. If a later implementation touches `src/main.ts`, `manifest.json`, `styles.css`, `assets/`, `src/style/`, `src/core/theme/`, or `src/features/settings/`, run the standard separate build/copy/BUILD_ID verification flow.

## Implementation Recommendation

Implement Tier 4 in the order above.

Task 1 is the most valuable first step because it addresses the only remaining data-loss-shaped risk without relying on `updatedAt` as a storage revision. Task 2 is safe if the circuit breaker only rejects new writes before enqueueing and leaves all existing queue entries ordered. Task 3 should stay diagnostic-only in the first pass; forced sync unlock belongs to a later recovery feature after production diagnostics show real stuck locks.

Do not implement broad CAS or arbitrary field-level merge in this tier. The small stale-message guard, bounded queue depth, and stuck-sync diagnostics close the Council deductions while preserving the current owner boundaries.

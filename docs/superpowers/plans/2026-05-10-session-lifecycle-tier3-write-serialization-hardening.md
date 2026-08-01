# Session Lifecycle Tier 3 Write Serialization Hardening Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Harden the existing per-conversation write serialization boundary against head-of-line blocking diagnostics and multi-pane write competition without broadening the session lifecycle architecture.

**Architecture:** Keep `ConversationWriteSerializationService` as the queue/ticket owner for compatibility/cache writes, but make the first Tier 3 pass diagnostic-first: timed-out writes must be observable before any attempt to bypass the queue. Keep guarded thick owners (`src/main.ts`, `OpenCodianView.ts`) out of the implementation by making default serializer instances share one workspace-level queue state inside the existing service; do not introduce a new helper layer and do not migrate runtime reads away from `Conversation.messages`.

**Tech Stack:** TypeScript, Jest, Obsidian plugin view lifecycle, existing `OpenCodianPlugin.saveConversation()` storage boundary, `npm run graphify:update:src`, `npm run verify`.

---

## Scope Check

This Tier 3 plan covers only the two remaining medium-priority Council residuals from `docs/archive/maintainability/phases/session-lifecycle-council-review-2026-05-10.md`:

- write serialization head-of-line blocking: slow or stuck `saveConversation()` can keep later same-conversation compatibility/cache writes waiting.
- cross-view write competition: each Obsidian pane currently creates its own `ConversationWriteSerializationService`, so two `OpenCodianView` instances can independently save the same conversation.

This plan explicitly does not cover:

- canonical-only runtime read migration.
- background task sub-session redesign.
- new cache owners or thin adapters.
- growth of `OpenCodianView.ts` or `OpenCodeService.ts` runtime ownership.

## Current Risk Judgment

### Head-Of-Line Blocking

Risk: medium, diagnostic gap first.

`ConversationWriteSerializationService.commit()` chains each conversation through a promise queue. A slow write blocks later writes for that same conversation, and there is currently no queue age, pending count, timeout callback, or stale-queue diagnostic surface. However, a naive timeout that lets later writes pass is unsafe: `StorageService.saveConversation()` cannot cancel an already-started write, so the older write could eventually finish and overwrite newer messages.

Tier 3 should therefore start with a watchdog/diagnostic strategy, not forced queue bypass.

### Cross-View Write Competition

Risk: medium and more directly actionable.

`src/main.ts` registers a fresh `OpenCodianView` per pane, while `src/features/chat/OpenCodianView.ts` owns `private readonly conversationWriteSerializationService = new ConversationWriteSerializationService();`. If each service instance keeps its own queue state, serialization is view-local. Hot send/sync/finalization paths use `OpenCodianView.commitConversationWrite()`, but two panes on the same conversation can otherwise receive separate ticket/version sequences.

The owner-guard-safe smallest fix is to keep the existing view seam and make default service instances share the same queue state. Unit tests can request `scope: 'instance'` to keep isolated state.

## File Structure

- Modify `src/features/chat/services/ConversationWriteSerializationService.ts`
  - Add queue diagnostics and a timeout warning callback.
  - Preserve serial execution semantics; do not allow timed-out writes to bypass unfinished previous writes.
- Modify `tests/unit/features/chat/ConversationWriteSerializationService.test.ts`
  - Cover diagnostic timeout emission.
  - Cover that timed-out first writes still keep same-conversation writes ordered until the first write resolves.
- Modify `tests/unit/features/chat/ConversationWriteSerializationService.test.ts`
  - Add a cross-view-style regression test that two default service instances serialize the same conversation through one queue.
- Update docs:
  - `docs/modules/features/chat/services/ConversationWriteSerializationService.md`
  - `docs/modules/features/chat/OpenCodianView.md`
  - `docs/modules/core/storage/StorageService.md` only if storage-boundary wording changes.
- Generated if `src/` changes:
  - `graphify-out/**` via `npm run graphify:update:src`.

## Task 1: Add Diagnostic-Only Queue Timeout Coverage

**Files:**
- Modify: `src/features/chat/services/ConversationWriteSerializationService.ts`
- Test: `tests/unit/features/chat/ConversationWriteSerializationService.test.ts`
- Docs: `docs/modules/features/chat/services/ConversationWriteSerializationService.md`

- [ ] **Step 1: Add failing timeout diagnostics tests**

Append these tests inside `describe('ConversationWriteSerializationService', () => { ... })`:

```typescript
  it('reports a stuck same-conversation queue without letting later writes bypass ordering', async () => {
    jest.useFakeTimers();
    const onQueueTimeout = jest.fn();
    const service = new ConversationWriteSerializationService({
      queueTimeoutMs: 25,
      onQueueTimeout,
      now: () => Date.now(),
      setTimeout: (callback, delay) => setTimeout(callback, delay),
      clearTimeout: (handle) => clearTimeout(handle),
    });
    const conversation = createConversation();
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
    const second = service.commit({
      conversation,
      ticket: service.createTicket(conversation.id),
      reason: 'second',
      write: () => {
        events.push('second');
      },
    });

    await jest.advanceTimersByTimeAsync(25);

    expect(onQueueTimeout).toHaveBeenCalledWith(expect.objectContaining({
      conversationId: conversation.id,
      pendingWrites: 2,
      oldestReason: 'first',
      newestReason: 'second',
    }));
    expect(events).toEqual(['first-start']);

    releaseFirst?.();
    await Promise.all([first, second]);

    expect(events).toEqual(['first-start', 'first-end', 'second']);
    jest.useRealTimers();
  });

  it('does not report a queue timeout after the queue drains', async () => {
    jest.useFakeTimers();
    const onQueueTimeout = jest.fn();
    const service = new ConversationWriteSerializationService({
      queueTimeoutMs: 25,
      onQueueTimeout,
      now: () => Date.now(),
      setTimeout: (callback, delay) => setTimeout(callback, delay),
      clearTimeout: (handle) => clearTimeout(handle),
    });
    const conversation = createConversation();

    await service.commit({
      conversation,
      ticket: service.createTicket(conversation.id),
      reason: 'fast',
      write: () => {
        conversation.updatedAt = 2;
      },
    });
    await jest.advanceTimersByTimeAsync(25);

    expect(onQueueTimeout).not.toHaveBeenCalled();
    jest.useRealTimers();
  });
```

- [ ] **Step 2: Run the failing focused test**

Run:

```bash
npm run test -- tests/unit/features/chat/ConversationWriteSerializationService.test.ts --runInBand
```

Expected: FAIL because `ConversationWriteSerializationService` does not accept constructor options and does not report queue timeout diagnostics.

- [ ] **Step 3: Add queue diagnostic types and constructor options**

In `src/features/chat/services/ConversationWriteSerializationService.ts`, add these exports near the existing interfaces:

```typescript
export interface ConversationWriteQueueTimeoutDiagnostic {
  readonly conversationId: string;
  readonly pendingWrites: number;
  readonly ageMs: number;
  readonly oldestReason: string | null;
  readonly newestReason: string | null;
}

export interface ConversationWriteSerializationOptions {
  readonly queueTimeoutMs?: number;
  readonly onQueueTimeout?: (diagnostic: ConversationWriteQueueTimeoutDiagnostic) => void;
  readonly now?: () => number;
  readonly setTimeout?: (
    callback: () => void,
    delayMs: number,
  ) => ReturnType<typeof setTimeout>;
  readonly clearTimeout?: (handle: ReturnType<typeof setTimeout>) => void;
}
```

Add these private fields:

```typescript
  private readonly queueTimeoutMs: number | null;
  private readonly onQueueTimeout: ((diagnostic: ConversationWriteQueueTimeoutDiagnostic) => void) | null;
  private readonly now: () => number;
  private readonly setTimer: ConversationWriteSerializationOptions['setTimeout'];
  private readonly clearTimer: NonNullable<ConversationWriteSerializationOptions['clearTimeout']>;
  private readonly queueDiagnostics = new Map<string, {
    startedAt: number;
    reasons: string[];
    timeoutHandle: ReturnType<typeof setTimeout> | null;
  }>();
```

Add this constructor:

```typescript
  constructor(options: ConversationWriteSerializationOptions = {}) {
    this.queueTimeoutMs = typeof options.queueTimeoutMs === 'number' && options.queueTimeoutMs > 0
      ? options.queueTimeoutMs
      : null;
    this.onQueueTimeout = options.onQueueTimeout ?? null;
    this.now = options.now ?? (() => Date.now());
    this.setTimer = options.setTimeout ?? ((callback, delayMs) => setTimeout(callback, delayMs));
    this.clearTimer = options.clearTimeout ?? ((handle) => clearTimeout(handle));
  }
```

- [ ] **Step 4: Record and clear diagnostics around queued writes**

In `commit()`, after `this.incrementPendingWriteCount(conversationId);`, add:

```typescript
    this.recordQueuedWrite(conversationId, options.reason);
```

In `runCommit()` `finally`, after `this.decrementPendingWriteCount(conversationId);`, add:

```typescript
      this.clearQueuedWrite(conversationId, options.reason);
```

Add these private methods:

```typescript
  private recordQueuedWrite(conversationId: string, reason: string): void {
    let diagnostic = this.queueDiagnostics.get(conversationId);
    if (!diagnostic) {
      diagnostic = {
        startedAt: this.now(),
        reasons: [],
        timeoutHandle: null,
      };
      this.queueDiagnostics.set(conversationId, diagnostic);
      if (this.queueTimeoutMs !== null && this.onQueueTimeout) {
        diagnostic.timeoutHandle = this.setTimer?.(() => {
          this.reportQueueTimeout(conversationId);
        }, this.queueTimeoutMs) ?? null;
      }
    }
    diagnostic.reasons.push(reason);
  }

  private clearQueuedWrite(conversationId: string, reason: string): void {
    const diagnostic = this.queueDiagnostics.get(conversationId);
    if (!diagnostic) {
      return;
    }

    const index = diagnostic.reasons.indexOf(reason);
    if (index !== -1) {
      diagnostic.reasons.splice(index, 1);
    } else {
      diagnostic.reasons.shift();
    }

    if (diagnostic.reasons.length > 0) {
      return;
    }

    if (diagnostic.timeoutHandle) {
      this.clearTimer(diagnostic.timeoutHandle);
    }
    this.queueDiagnostics.delete(conversationId);
  }

  private reportQueueTimeout(conversationId: string): void {
    const diagnostic = this.queueDiagnostics.get(conversationId);
    if (!diagnostic || !this.onQueueTimeout) {
      return;
    }

    this.onQueueTimeout({
      conversationId,
      pendingWrites: this.getPendingWriteCount(conversationId),
      ageMs: this.now() - diagnostic.startedAt,
      oldestReason: diagnostic.reasons[0] ?? null,
      newestReason: diagnostic.reasons[diagnostic.reasons.length - 1] ?? null,
    });
  }
```

Implementation note: this is intentionally diagnostic-only. It must not resolve, reject, reorder, or bypass the queue.

- [ ] **Step 5: Run the focused serializer tests**

Run:

```bash
npm run test -- tests/unit/features/chat/ConversationWriteSerializationService.test.ts --runInBand
```

Expected: PASS.

- [ ] **Step 6: Update the serializer module doc**

In `docs/modules/features/chat/services/ConversationWriteSerializationService.md`, add:

```markdown
- 可选 queue timeout diagnostics：当同一 conversation 的队列超过配置时间仍未清空时，只报告 conversation id、pending 数量与首尾 reason；不会取消、跳过或重排写入。
```

Add this guardrail under the boundary section:

```markdown
- timeout diagnostics 是观测机制，不是降级写入机制。`StorageService.saveConversation()` 没有取消/compare-and-swap 语义，因此不能在旧写入未完成时放行新写入，否则旧写入稍后落盘可能覆盖新消息。
```

## Task 2: Share Default Serialization Scope Across Views

**Files:**
- Modify: `src/features/chat/services/ConversationWriteSerializationService.ts`
- Test: `tests/unit/features/chat/ConversationWriteSerializationService.test.ts`
- Docs: `docs/modules/features/chat/OpenCodianView.md`
- Docs: `docs/modules/features/chat/services/ConversationWriteSerializationService.md`

- [ ] **Step 1: Add a failing cross-instance serialization test**

Append this test to `tests/unit/features/chat/ConversationWriteSerializationService.test.ts`:

```typescript
  it('shares default per-conversation ordering across service instances', async () => {
    const viewAService = new ConversationWriteSerializationService();
    const viewBService = new ConversationWriteSerializationService();
    const conversation = createConversation('shared-default-service');
    const events: string[] = [];
    let releaseFirst: (() => void) | null = null;

    const first = viewAService.commit({
      conversation,
      ticket: viewAService.createTicket(conversation.id),
      reason: 'view-a',
      write: () => new Promise<void>((resolve) => {
        events.push('view-a-start');
        releaseFirst = () => {
          events.push('view-a-end');
          resolve();
        };
      }),
    });
    const second = viewBService.commit({
      conversation,
      ticket: viewBService.createTicket(conversation.id),
      reason: 'view-b',
      write: () => {
        events.push('view-b');
      },
    });

    await Promise.resolve();
    await Promise.resolve();

    expect(events).toEqual(['view-a-start']);

    releaseFirst?.();
    await Promise.all([first, second]);

    expect(events).toEqual(['view-a-start', 'view-a-end', 'view-b']);
    expect(viewAService.getVersion(conversation.id)).toBe(2);
    expect(viewBService.getVersion(conversation.id)).toBe(2);
  });
```

- [ ] **Step 2: Run the failing focused test**

Run:

```bash
npm run test -- tests/unit/features/chat/ConversationWriteSerializationService.test.ts --runInBand
```

Expected: FAIL because separate service instances still hold separate queue/version maps.

- [ ] **Step 3: Add shared and isolated state scopes**

In `ConversationWriteSerializationService.ts`, move the mutable maps into a `ConversationWriteSerializationState` object, add one module-level shared state, and add `scope?: 'shared' | 'instance'` to `ConversationWriteSerializationOptions`. The constructor must default to `shared`, while tests that need isolation pass `scope: 'instance'`.

Implementation sketch:

```typescript
interface ConversationWriteSerializationState {
  readonly versions: Map<string, number>;
  readonly queues: Map<string, Promise<void>>;
  readonly pendingWrites: Map<string, number>;
  readonly queueDiagnostics: Map<string, QueuedWriteDiagnosticState>;
  nextDiagnosticEntryId: number;
}

const SHARED_CONVERSATION_WRITE_SERIALIZATION_STATE =
  createConversationWriteSerializationState();
```

Then have `getVersion()`, `commit()`, pending counters, queue cleanup, and diagnostics read/write through `this.state`.

- [ ] **Step 4: Keep existing service tests isolated**

Update existing unit tests in `ConversationWriteSerializationService.test.ts` to construct isolated services for cases that expect fresh version state:

```typescript
function createIsolatedService(): ConversationWriteSerializationService {
  return new ConversationWriteSerializationService({ scope: 'instance' });
}
```

- [ ] **Step 5: Run focused tests**

Run:

```bash
npm run test -- tests/unit/features/chat/ConversationWriteSerializationService.test.ts --runInBand
```

Expected: PASS.

- [ ] **Step 6: Update module docs**

In `docs/modules/features/chat/OpenCodianView.md`, describe that each view still owns a service instance, but default shared scope makes panes share the same conversation queue.

In `docs/modules/features/chat/services/ConversationWriteSerializationService.md`, document:

```markdown
- 默认构造使用 `shared` scope，让多个 view-local service 实例共享 per-conversation queue；单元测试可传 `scope: 'instance'` 获得隔离状态。
- timeout diagnostics 是观测机制，不是降级写入机制。
```

## Task 3: Verification And Deployment Decision

**Files:**
- Generated: `graphify-out/**` if Task 1 or Task 2 modifies `src/`

- [ ] **Step 1: Refresh graphify after source edits**

Run:

```bash
npm run graphify:update:src
```

Expected: PASS and no transient `src/graphify-out/` remains.

- [ ] **Step 2: Run module-doc guard**

Run:

```bash
npm run check:module-docs
```

Expected: PASS.

- [ ] **Step 3: Run full verification**

Run:

```bash
npm run verify
```

Expected: PASS with lint, typecheck, tests, graphify, module-doc, devlog-order, and production build gates green.

- [ ] **Step 4: Deploy Test Vault only if runtime deploy-relevant files changed**

This plan should not touch deploy-relevant runtime files such as `src/main.ts`, `manifest.json`, `styles.css`, `assets/`, `src/style/`, `src/core/theme/`, or `src/features/settings/`. If a later implementation variant does touch them, run the standard separate build/copy/BUILD_ID verification flow:

```bash
npm run build
```

Then copy `dist/main.js`, `dist/manifest.json`, and `dist/styles.css` to:

```text
/Volumes/SDD2T/obsidian-vault-write/testvault/.obsidian/plugins/opencodian/
```

Then verify the Test Vault `main.js` contains the newest `BUILD_ID` emitted by the build.

Expected: Test Vault plugin files match the latest build.

## Recommendation

Implement Task 1 and Task 2 now if the goal is to close Council's Tier 3 medium residuals in one small, reversible pass.

Do not implement a hard timeout bypass in this tier. The safe degradation path is:

1. report queue age and pending reasons,
2. keep writes ordered,
3. use the service-level default shared queue so multi-pane writes cannot bypass each other,
4. revisit cancellable or compare-and-swap storage only if diagnostics prove real stuck writes in production.

This keeps Tier 3 bounded and avoids turning it into the later canonical-only runtime read migration.

/**
 * Unit tests for the R-C3 warm completion session pool
 * (docs/requirements/flowtext-c3-design.md §3.2.4/§3.2.6, §5 case 4):
 *
 * - disabled → no session is ever started (off = zero cost);
 * - prewarm + reuse: one warm session per backend × workingDirectory;
 * - idle TTL disposes the session;
 * - model switch and note switch rebuild (reset semantics);
 * - toggle off disposes everything immediately (acceptance 7);
 * - start failure → unsupported + honest notice;
 * - consecutive turn failures: dispose at 2, cold retry, unsupported at 3;
 * - a write-tool violation disposes + marks unsupported + notifies.
 */

import { describe, expect, it } from '@jest/globals';

import { AUX_DENIED_CAPABILITIES } from '../../../../src/core/agents/backend/AgentAuxQueryCapability';
import type {
  InlineCompletionSession,
  InlineCompletionTurnRequest,
  InlineCompletionTurnResult,
} from '../../../../src/core/agents/backend/AgentInlineCompletionCapability';
import type { AgentBackendKind } from '../../../../src/core/types/chat';
import {
  type InlineCompletionPoolHost,
  InlineCompletionService,
  type InlineCompletionTarget,
} from '../../../../src/features/inline-edit/InlineCompletionService';

type PoolOk = Extract<InlineCompletionPoolResult, { ok: true }>;

/** Assert ok and hand back the narrowed result (keeps expects unconditional). */
function expectPoolOk(result: InlineCompletionPoolResult): PoolOk {
  expect(result.ok).toBe(true);
  return result as PoolOk;
}

interface StubSession extends InlineCompletionSession {
  readonly completed: InlineCompletionTurnRequest[];
  disposed: boolean;
}

function stubSession(backend: AgentBackendKind = 'opencode'): StubSession {
  const session: StubSession = {
    queryId: `stub-${Math.random().toString(36).slice(2)}`,
    safety: {
      backend,
      enforcedPolicy: 'read-only-allowlist',
      effectiveTools: ['read'],
      deniedCapabilities: AUX_DENIED_CAPABILITIES,
      mechanism: 'stub',
    },
    completed: [],
    disposed: false,
    complete(request) {
      session.completed.push(request);
      return Promise.resolve<InlineCompletionTurnResult>({
        ok: true,
        text: ' suggestion',
        toolCalls: [],
      });
    },
    reset() {
      return Promise.resolve();
    },
    dispose() {
      session.disposed = true;
      return Promise.resolve();
    },
  };
  return session;
}

interface HostOverrides {
  readonly enabled?: boolean;
  readonly backend?: AgentBackendKind;
  readonly modelRef?: string;
  readonly notePath?: string;
  readonly startError?: Error;
}

function makeHarness(overrides: HostOverrides = {}) {
  const started: InlineCompletionSession[] = [];
  let sessionFactory: () => InlineCompletionSession = () => stubSession(overrides.backend ?? 'opencode');
  let modelRef = overrides.modelRef ?? '';
  let notePath = overrides.notePath ?? 'notes/a.md';
  let enabled = overrides.enabled ?? true;
  let targetOverride: InlineCompletionTarget | null = null;

  const host: InlineCompletionPoolHost = {
    isEnabled: () => enabled,
    getLocale: () => 'en',
    getMaxChars: () => 300,
    getNotePath: () => notePath,
    resolveCompletionTarget: () => {
      if (targetOverride) return targetOverride;
      if (overrides.startError) {
        return {
          ok: true,
          backend: overrides.backend ?? 'opencode',
          displayName: 'OpenCode',
          workingDirectory: '/vault',
          model: null,
          effort: null,
          startSession: () => Promise.reject(overrides.startError),
        } satisfies InlineCompletionTarget;
      }
      return {
        ok: true,
        backend: overrides.backend ?? 'opencode',
        displayName: 'OpenCode',
        workingDirectory: '/vault',
        model: null,
        effort: null,
        startSession: () => {
          const session = sessionFactory();
          started.push(session);
          return Promise.resolve(session);
        },
      } satisfies InlineCompletionTarget;
    },
    buildSystemPrompt: () => 'system prompt',
  };
  const notices: string[] = [];
  const pool = new InlineCompletionService({
    host,
    notify: (message) => { notices.push(message); },
    ttlMs: 5_000,
  });
  return {
    pool,
    started,
    notices,
    setSessionFactory(factory: () => InlineCompletionSession): void {
      sessionFactory = factory;
    },
    setModelRef(ref: string): void { modelRef = ref; },
    setNotePath(path: string): void { notePath = path; },
    setEnabled(value: boolean): void { enabled = value; },
    setTargetOverride(target: InlineCompletionTarget | null): void { targetOverride = target; },
    isModelRefCurrent(ref: string): boolean { return modelRef === ref; },
  };
}

describe('InlineCompletionService pool lifecycle', () => {
  it('refuses to start anything while disabled', async () => {
    const harness = makeHarness({ enabled: false });
    const result = await harness.pool.obtain();
    expect(result).toEqual({ ok: false, error: { reason: 'disabled' } });
    expect(harness.started).toHaveLength(0);
  });

  it('starts one warm session and reuses it for consecutive obtains', async () => {
    const harness = makeHarness();
    const first = expectPoolOk(await harness.pool.obtain());
    const second = expectPoolOk(await harness.pool.obtain());
    expect(second.session).toBe(first.session);
    expect(harness.started).toHaveLength(1);
  });

  it('prewarm starts the session without a trigger', async () => {
    const harness = makeHarness();
    harness.pool.prewarm();
    await Promise.resolve();
    await Promise.resolve();
    expect(harness.started).toHaveLength(1);
  });

  it('rebuilds the session when the model reference changes (reset semantics)', async () => {
    const harness = makeHarness();
    const first = expectPoolOk(await harness.pool.obtain());
    harness.setTargetOverride({
      ok: true,
      backend: 'opencode',
      displayName: 'OpenCode',
      workingDirectory: '/vault',
      model: { kind: 'opencode', provider: 'p', model: 'm2' },
      effort: null,
      startSession: () => {
        const session = stubSession();
        harness.started.push(session);
        return Promise.resolve(session);
      },
    });
    const second = expectPoolOk(await harness.pool.obtain());
    expect(second.session).not.toBe(first.session);
    expect(first.session.disposed).toBe(true);
    expect(harness.started).toHaveLength(2);
  });

  it('rebuilds the session when the note switches', async () => {
    const harness = makeHarness({ notePath: 'notes/a.md' });
    const first = expectPoolOk(await harness.pool.obtain());
    harness.setNotePath('notes/b.md');
    const second = expectPoolOk(await harness.pool.obtain());
    expect(first.session.disposed).toBe(true);
    expect(second.session).not.toBe(first.session);
  });

  it('keeps the session when only an unrelated host field changed', async () => {
    const harness = makeHarness();
    const first = expectPoolOk(await harness.pool.obtain());
    harness.setNotePath('notes/a.md'); // same note as constructed with
    const second = expectPoolOk(await harness.pool.obtain());
    expect(second.session).toBe(first.session);
  });

  it('disposes every session when the feature is toggled off', async () => {
    const harness = makeHarness();
    const first = expectPoolOk(await harness.pool.obtain());
    harness.setEnabled(false);
    await harness.pool.disposeAll();
    expect(first.session.disposed).toBe(true);
    const after = await harness.pool.obtain();
    expect(after).toEqual({ ok: false, error: { reason: 'disabled' } });
  });

  it('expires an idle session after the TTL', async () => {
    jest.useFakeTimers();
    try {
      const harness = makeHarness();
      const first = expectPoolOk(await harness.pool.obtain());
      await jest.advanceTimersByTimeAsync(6_000);
      expect(first.session.disposed).toBe(true);
      // The next obtain cold-starts a fresh session.
      expectPoolOk(await harness.pool.obtain());
      expect(harness.started).toHaveLength(2);
    } finally {
      jest.useRealTimers();
    }
  });

  it('keeps a session alive across activity within the TTL', async () => {
    jest.useFakeTimers();
    try {
      const harness = makeHarness();
      const first = expectPoolOk(await harness.pool.obtain());
      await jest.advanceTimersByTimeAsync(4_000);
      const again = expectPoolOk(await harness.pool.obtain());
      await jest.advanceTimersByTimeAsync(4_000);
      expect(again.session).toBe(first.session);
      expect(first.session.disposed).toBe(false);
    } finally {
      jest.useRealTimers();
    }
  });
});

describe('InlineCompletionService failure semantics (fail closed)', () => {
  it('marks the backend unsupported and notifies on start failure', async () => {
    const harness = makeHarness({ startError: new Error('no read-only proof') });
    const result = await harness.pool.obtain();
    expect(result).toEqual({
      ok: false,
      error: { reason: 'session-unavailable', detail: 'no read-only proof' },
    });
    expect(harness.notices).toHaveLength(1);
    expect(harness.notices[0]).toContain('Could not start');
    expect(harness.pool.isUnsupported('opencode')).toBe(true);
    // Further obtains are refused without another start attempt.
    harness.setTargetOverride(null);
    harness.setSessionFactory(() => { throw new Error('must not be constructed'); });
    const refused = await harness.pool.obtain();
    expect(refused).toEqual({ ok: false, error: { reason: 'unsupported', backend: 'opencode' } });
  });

  it('keeps working after one failed turn', async () => {
    const harness = makeHarness();
    const first = expectPoolOk(await harness.pool.obtain());
    harness.pool.reportTurnFailure('opencode');
    expect(harness.pool.isUnsupported('opencode')).toBe(false);
    expect(first.session.disposed).toBe(false);
  });

  it('disposes the session after two consecutive failures (cold retry next time)', async () => {
    const harness = makeHarness();
    const first = expectPoolOk(await harness.pool.obtain());
    harness.pool.reportTurnFailure('opencode');
    harness.pool.reportTurnFailure('opencode');
    expect(first.session.disposed).toBe(true);
    expect(harness.pool.isUnsupported('opencode')).toBe(false);
    // The next obtain cold-restarts once.
    const retry = await harness.pool.obtain();
    expect(retry.ok).toBe(true);
    expect(harness.started).toHaveLength(2);
  });

  it('marks the backend unsupported after the third consecutive failure', async () => {
    const harness = makeHarness();
    await harness.pool.obtain();
    harness.pool.reportTurnFailure('opencode');
    harness.pool.reportTurnFailure('opencode');
    await harness.pool.obtain(); // cold retry
    harness.pool.reportTurnFailure('opencode');
    expect(harness.pool.isUnsupported('opencode')).toBe(true);
    expect(harness.notices.some((notice) => notice.includes('disabled until'))).toBe(true);
    const refused = await harness.pool.obtain();
    expect(refused).toEqual({ ok: false, error: { reason: 'unsupported', backend: 'opencode' } });
  });

  it('resets the failure counter on a successful turn', async () => {
    const harness = makeHarness();
    await harness.pool.obtain();
    harness.pool.reportTurnFailure('opencode');
    harness.pool.reportTurnSuccess('opencode');
    harness.pool.reportTurnFailure('opencode');
    expect(harness.pool.isUnsupported('opencode')).toBe(false);
  });

  it('handles a write-tool violation: dispose + unsupported + honest notice', async () => {
    const harness = makeHarness();
    const first = expectPoolOk(await harness.pool.obtain());
    harness.pool.reportWriteToolViolation('opencode', 'OpenCode', ['Write']);
    expect(first.session.disposed).toBe(true);
    expect(harness.pool.isUnsupported('opencode')).toBe(true);
    expect(harness.notices).toHaveLength(1);
    expect(harness.notices[0]).toContain('Write');
    const refused = await harness.pool.obtain();
    expect(refused).toEqual({ ok: false, error: { reason: 'unsupported', backend: 'opencode' } });
  });

  it('resetUnsupported re-arms a backend for a new enable cycle', async () => {
    const harness = makeHarness({ startError: new Error('boom') });
    await harness.pool.obtain();
    expect(harness.pool.isUnsupported('opencode')).toBe(true);
    harness.pool.resetUnsupported();
    expect(harness.pool.isUnsupported('opencode')).toBe(false);
  });

  it('reports capability-unavailable when no backend hosts the capability', async () => {
    const harness = makeHarness();
    harness.setTargetOverride({ ok: false, reason: 'capability-unavailable', backend: '' });
    const result = await harness.pool.obtain();
    expect(result).toEqual({ ok: false, error: { reason: 'capability-unavailable', backend: '' } });
    expect(harness.started).toHaveLength(0);
  });

  it('reports model-unavailable without starting a session', async () => {
    const harness = makeHarness();
    harness.setTargetOverride({ ok: false, reason: 'model-unavailable', detail: 'bad override' });
    const result = await harness.pool.obtain();
    expect(result).toEqual({
      ok: false,
      error: { reason: 'model-unavailable', detail: 'bad override' },
    });
    expect(harness.started).toHaveLength(0);
  });
});

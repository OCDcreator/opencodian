import { describe, expect, it } from '@jest/globals';

import { AUX_DENIED_CAPABILITIES } from '../../../../src/core/agents/backend/AgentAuxQueryCapability';
import type { InlineCompletionSession } from '../../../../src/core/agents/backend/AgentInlineCompletionCapability';
import { InlineCompletionService } from '../../../../src/features/inline-edit/InlineCompletionService';

interface StubSession extends InlineCompletionSession { disposed: boolean; }

function stubSession(): StubSession {
  const session: StubSession = {
    queryId: 'owned-disposal-control',
    safety: {
      backend: 'opencode',
      enforcedPolicy: 'read-only-allowlist',
      effectiveTools: ['read'],
      deniedCapabilities: AUX_DENIED_CAPABILITIES,
      mechanism: 'test control',
    },
    disposed: false,
    complete: async () => ({ ok: true, text: '', toolCalls: [] }),
    reset: async () => {},
    dispose: async () => { session.disposed = true; },
  };
  return session;
}

function makeHarness() {
  let enabled = true, notePath = 'notes/a.md';
  let factory = () => stubSession();
  const started: StubSession[] = [];
  const pool = new InlineCompletionService({
    host: {
      isEnabled: () => enabled,
      getLocale: () => 'en',
      getMaxChars: () => 300,
      getNotePath: () => notePath,
      buildSystemPrompt: () => '',
      resolveCompletionTarget: () => ({
        ok: true, backend: 'opencode', displayName: 'OpenCode', workingDirectory: '/owned',
        model: null, effort: null,
        startSession: () => {
          const session = factory();
          started.push(session);
          return Promise.resolve(session);
        },
      }),
    },
    notify: () => {},
    ttlMs: 5_000,
  });
  return {
    pool, started,
    setEnabled(value: boolean) { enabled = value; },
    setNotePath(value: string) { notePath = value; },
    setSessionFactory(value: () => StubSession) { factory = value; },
  };
}

describe('InlineCompletionService disposal across awaits', () => {
  it('does not restart a note switch after toggle-off disposes the pool', async () => {
    const harness = makeHarness();
    const first = stubSession();
    const second = stubSession();
    let releaseDisposal: (() => void) | undefined;
    first.dispose = () => {
      first.disposed = true;
      return new Promise<void>((resolve) => { releaseDisposal = resolve; });
    };
    harness.setSessionFactory(() => harness.started.length === 0 ? first : second);
    await harness.pool.obtain();
    harness.setNotePath('notes/b.md');
    const switching = harness.pool.obtain();
    await Promise.resolve();
    expect(releaseDisposal).toBeDefined();
    harness.setEnabled(false);
    await harness.pool.disposeAll();
    releaseDisposal?.();
    const late = await switching;
    expect(late.ok).toBe(false);
    expect(harness.started).toHaveLength(1);
    expect(first.disposed).toBe(true);
    expect(harness.pool.sessionCount()).toBe(0);
  });

  it('keeps a newer enable-cycle session while an old disposal is pending', async () => {
    const harness = makeHarness();
    const first = stubSession();
    const second = stubSession();
    let releaseDisposal: (() => void) | undefined;
    first.dispose = () => {
      first.disposed = true;
      return new Promise<void>((resolve) => { releaseDisposal = resolve; });
    };
    harness.setSessionFactory(() => harness.started.length === 0 ? first : second);
    await harness.pool.obtain();
    const disposing = harness.pool.disposeAll();
    const next = await harness.pool.obtain();
    expect(next).toMatchObject({ ok: true, session: second });
    releaseDisposal?.();
    await disposing;
    expect(harness.pool.hasSession('opencode')).toBe(true);
    expect(second.disposed).toBe(false);
    await harness.pool.disposeAll();
    expect(second.disposed).toBe(true);
  });

});

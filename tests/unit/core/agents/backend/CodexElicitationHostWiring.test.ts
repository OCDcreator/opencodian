/**
 * Real unit tests for the Codex elicitation host-wiring race.
 *
 * Regression for the 2026-10-21 I02 acceptance incident: the app-server
 * forwarded `mcpServer/elicitation/request` while the adapter's elicitation
 * host was not wired yet (`setElicitationHost` runs from main.ts composition),
 * the frame fell through to the transport's -32601 reply, and the form card
 * never rendered. The route now registers as soon as the app-server client
 * exists — host or not — and hostless frames are pended inside the adapter:
 * bound to the frame's request/turn abort lifetime plus a bounded host-wait
 * timeout, settled as `{ action: 'cancel' }` on abort/timeout/stop (never
 * hanging, never fabricating a user answer), and dispatched with the original
 * wire params the moment `setElicitationHost` runs.
 */

const mockRegisterServerRequestHandler = jest.fn();
const mockUnregisterServerRequestHandler = jest.fn();
const mockAppServerClientStart = jest.fn().mockResolvedValue(undefined);
const mockAppServerClientStop = jest.fn();
let elicitationHandler: ((params: unknown, signal?: AbortSignal) => unknown) | null = null;
const mockRegisterMcpElicitationHandler = jest.fn((handler: (params: unknown, signal?: AbortSignal) => unknown) => {
  elicitationHandler = handler;
});

jest.mock('../../../../../src/core/agents/backend/codex/CodexAppServerClient', () => {
  const actual = jest.requireActual('../../../../../src/core/agents/backend/codex/CodexAppServerClient');
  return {
    ...actual,
    CodexAppServerClient: jest.fn().mockImplementation(() => ({
      start: mockAppServerClientStart,
      stop: mockAppServerClientStop,
      registerServerRequestHandler: mockRegisterServerRequestHandler,
      unregisterServerRequestHandler: mockUnregisterServerRequestHandler,
      registerMcpElicitationHandler: mockRegisterMcpElicitationHandler,
      listThreads: jest.fn().mockResolvedValue([]),
      readThread: jest.fn().mockResolvedValue(null),
    })),
  };
});

import { CodexAdapter } from '../../../../../src/core/agents/backend/codex/CodexAdapter';
import type { CodexElicitationFormParams } from '../../../../../src/core/agents/backend/codex/CodexElicitationBridge';

function createMockCodex(): unknown {
  return {
    startThread: jest.fn(),
    resumeThread: jest.fn(),
  };
}

const FORM_PARAMS: CodexElicitationFormParams = {
  serverName: 'github',
  threadId: 'thread-1',
  mode: 'form',
  message: 'Configure the deployment',
  requestedSchema: {
    type: 'object',
    properties: {
      environment: {
        type: 'string',
        title: 'Environment',
        enum: ['staging', 'production'],
        enumNames: ['Staging', 'Production'],
      },
    },
    required: ['environment'],
  },
};

/** Adapter started with NO elicitation host wired (the racing composition). */
function createHostlessStartedAdapter(): CodexAdapter {
  const adapter = new CodexAdapter({
    codexPathOverride: '/path/to/codex',
    createCodex: jest.fn().mockResolvedValue(createMockCodex()),
  });
  return adapter;
}

async function flushMicrotasks(): Promise<void> {
  await Promise.resolve();
  await Promise.resolve();
}

describe('Codex elicitation host-wiring race', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    elicitationHandler = null;
    mockAppServerClientStart.mockResolvedValue(undefined);
  });

  it('registers the route even without a host so early frames pend instead of -32601', async () => {
    const adapter = createHostlessStartedAdapter();
    await adapter.start();

    expect(mockRegisterMcpElicitationHandler).toHaveBeenCalledWith(expect.any(Function));
    await adapter.stop();
  });

  it('pends a frame that arrives before the host is wired and dispatches it once the host is set', async () => {
    const collectElicitation = jest.fn().mockResolvedValue({ action: 'accept', answers: [['staging']] });
    const adapter = createHostlessStartedAdapter();
    await adapter.start();

    const pending = elicitationHandler!(FORM_PARAMS);
    const settled = jest.fn();
    void pending.then(settled, settled);
    await flushMicrotasks();
    expect(settled).not.toHaveBeenCalled();

    adapter.setElicitationHost({ collectElicitation });

    await expect(pending).resolves.toEqual({
      action: 'accept',
      content: { environment: 'staging' },
    });
    expect(collectElicitation).toHaveBeenCalledTimes(1);
    // The original wire frame reaches the host unchanged.
    expect(collectElicitation.mock.calls[0][0].params).toBe(FORM_PARAMS);
    await adapter.stop();
  });

  it('cancels a pended frame when the owning turn aborts before the host is wired', async () => {
    const collectElicitation = jest.fn().mockResolvedValue({ action: 'accept', answers: [['staging']] });
    const adapter = createHostlessStartedAdapter();
    await adapter.start();
    const controller = new AbortController();
    (adapter as unknown as { activeControllers: Map<string, AbortController> }).activeControllers.set('thread-1', controller);

    const pending = elicitationHandler!(FORM_PARAMS);
    controller.abort();

    await expect(pending).resolves.toEqual({ action: 'cancel' });
    adapter.setElicitationHost({ collectElicitation });
    await flushMicrotasks();
    expect(collectElicitation).not.toHaveBeenCalled();
    await adapter.stop();
  });

  it('cancels a pended frame on the bounded host-wait timeout', async () => {
    jest.useFakeTimers();
    try {
      const collectElicitation = jest.fn().mockResolvedValue({ action: 'accept', answers: [['staging']] });
      const adapter = createHostlessStartedAdapter();
      await adapter.start();

      const pending = elicitationHandler!(FORM_PARAMS);
      jest.advanceTimersByTime(60_000);

      await expect(pending).resolves.toEqual({ action: 'cancel' });
      adapter.setElicitationHost({ collectElicitation });
      await flushMicrotasks();
      expect(collectElicitation).not.toHaveBeenCalled();
      await adapter.stop();
    } finally {
      jest.useRealTimers();
    }
  });

  it('cancels pended frames when the adapter stops before the host is wired', async () => {
    const collectElicitation = jest.fn().mockResolvedValue({ action: 'accept', answers: [['staging']] });
    const adapter = createHostlessStartedAdapter();
    await adapter.start();

    const pending = elicitationHandler!(FORM_PARAMS);
    await adapter.stop();

    await expect(pending).resolves.toEqual({ action: 'cancel' });
    adapter.setElicitationHost({ collectElicitation });
    await flushMicrotasks();
    expect(collectElicitation).not.toHaveBeenCalled();
  });
});

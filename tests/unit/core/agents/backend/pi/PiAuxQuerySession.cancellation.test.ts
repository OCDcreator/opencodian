import type { AuxQuerySafetyProof } from '../../../../../../src/core/agents/backend/AgentAuxQueryCapability';
import { PiAuxQuerySession, type PiAuxSessionOptions } from '../../../../../../src/core/agents/backend/pi/PiAuxQuerySession';
import type { PiRecord, PiRpcPort } from '../../../../../../src/core/agents/backend/pi/PiRpcClient';

function harness(options: Partial<PiAuxSessionOptions> = {}) {
  let emit: (event: PiRecord) => void = () => undefined;
  let finishPrompt: (value: PiRecord) => void = () => undefined;
  const unsubscribe = jest.fn();
  const request = jest.fn((command: PiRecord): Promise<PiRecord> => {
    if (command.type === 'prompt') return new Promise((resolve) => { finishPrompt = resolve; });
    if (command.type === 'abort') finishPrompt({});
    if (command.type === 'get_last_assistant_text') return Promise.resolve({ text: 'answer' });
    return Promise.resolve({});
  });
  const client: PiRpcPort = {
    request,
    subscribe: (listener) => { emit = listener; return unsubscribe; },
    close: jest.fn(),
  };
  const Constructor = PiAuxQuerySession as unknown as new (
    options: PiAuxSessionOptions, safety: AuxQuerySafetyProof,
  ) => PiAuxQuerySession;
  const session = new Constructor({ systemPrompt: 'readonly', workingDirectory: '/vault', executablePath: '/pi', ...options }, {
    backend: 'pi', enforcedPolicy: 'read-only-allowlist', effectiveTools: ['read'], deniedCapabilities: [], mechanism: 'test',
  });
  (session as unknown as { client: PiRpcPort }).client = client;
  return { session, request, unsubscribe, emit: (text: string) => emit({
    type: 'message_update', assistantMessageEvent: { type: 'text_delta', delta: text },
  }) };
}

async function startTurn() {
  await Promise.resolve();
  await Promise.resolve();
}

describe('Pi auxiliary native cancellation', () => {
  it('sends abort on the original deadline and drops chunks after cancellation', async () => {
    jest.useFakeTimers();
    const h = harness({ turnTimeoutMs: 4000 });
    const onTextChunk = jest.fn();
    const turn = h.session.query({ prompt: 'complete', onTextChunk });
    await startTurn();
    h.emit('early');
    expect(onTextChunk).toHaveBeenCalledWith('early');
    jest.advanceTimersByTime(4000);
    expect(h.request.mock.calls.filter(([c]) => c.type === 'abort')).toHaveLength(1);
    h.emit('late');
    expect(onTextChunk).toHaveBeenCalledTimes(1);
    await expect(turn).resolves.toMatchObject({ success: false, cancelled: true });
    expect(h.unsubscribe).toHaveBeenCalledTimes(1);
    jest.useRealTimers();
  });

  it('rejects an already aborted request before model or prompt dispatch', async () => {
    const h = harness();
    const abort = new AbortController();
    abort.abort();
    await expect(h.session.query({ prompt: 'never send', signal: abort.signal })).resolves.toMatchObject({ cancelled: true });
    expect(h.request).not.toHaveBeenCalled();
  });

  it('removes the external listener and makes repeated cancellation idempotent', async () => {
    const h = harness();
    const abort = new AbortController();
    const remove = jest.spyOn(abort.signal, 'removeEventListener');
    const turn = h.session.query({ prompt: 'cancel', signal: abort.signal });
    await startTurn();
    h.session.cancel();
    h.session.cancel();
    await expect(turn).resolves.toMatchObject({ cancelled: true });
    expect(h.request.mock.calls.filter(([c]) => c.type === 'abort')).toHaveLength(1);
    expect(remove).toHaveBeenCalledWith('abort', expect.any(Function));
    abort.abort();
    expect(h.request.mock.calls.filter(([c]) => c.type === 'abort')).toHaveLength(1);
  });
});

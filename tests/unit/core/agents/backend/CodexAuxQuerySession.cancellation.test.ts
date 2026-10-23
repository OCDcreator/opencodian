import { CodexAuxQuerySession } from '../../../../../src/core/agents/backend/auxiliary/CodexAuxQuerySession';
import type { CodexAppServerClient } from '../../../../../src/core/agents/backend/codex/CodexAppServerClient';
import type { AppServerThreadNotification } from '../../../../../src/core/agents/backend/codex/CodexAppServerClientTypes';

async function fixture() {
  let notify: (event: AppServerThreadNotification) => void = () => undefined;
  const client = {
    startThread: jest.fn().mockResolvedValue({ id: 'owned-aux' }),
    getThreadEffectiveSettings: jest.fn().mockReturnValue({ approvalPolicy: 'never', sandbox: { type: 'readOnly', networkAccess: false } }),
    startTurn: jest.fn().mockResolvedValue({ id: 'owned-turn' }),
    interruptTurn: jest.fn().mockResolvedValue(true),
    subscribeToThreadNotifications: jest.fn((_id, handler) => { notify = handler; return { dispose: jest.fn() }; }),
    clearThreadEffectiveSettings: jest.fn(),
  };
  const session = await CodexAuxQuerySession.create({ systemPrompt: 'Read only.', workingDirectory: '/owned', turnTimeoutMs: 20, client: client as unknown as CodexAppServerClient });
  return { session, client, emit: (method: string, params: unknown) => notify({ method, params }) };
}

beforeEach(() => jest.useFakeTimers());
afterEach(() => jest.useRealTimers());

test('timeout interrupts the admitted native turn once and returns cancellation within the budget', async () => {
  const { session, client } = await fixture();
  const pending = session.query({ prompt: 'Wait.' });
  await jest.advanceTimersByTimeAsync(20);
  expect(await pending).toMatchObject({ success: false, cancelled: true });
  expect(client.interruptTurn).toHaveBeenCalledTimes(1);
  expect(client.interruptTurn).toHaveBeenCalledWith('owned-aux', 'owned-turn');
  session.cancel(); await session.dispose();
  expect(client.interruptTurn).toHaveBeenCalledTimes(1);
});

test('abort before native acknowledgement settles promptly and interrupts a late admitted turn', async () => {
  const { session, client } = await fixture();
  let acknowledge: (value: { id: string }) => void = () => undefined;
  client.startTurn.mockImplementation(() => new Promise(resolve => { acknowledge = resolve; }));
  let result: unknown;
  const pending = session.query({ prompt: 'Wait for ack.' }).then(value => { result = value; return value; });
  await jest.advanceTimersByTimeAsync(20);
  expect(result).toMatchObject({ success: false, cancelled: true });
  expect(client.interruptTurn).not.toHaveBeenCalled();
  acknowledge({ id: 'late-turn' });
  await Promise.resolve(); await Promise.resolve();
  expect(client.interruptTurn).toHaveBeenCalledWith('owned-aux', 'late-turn');
  expect(await pending).toMatchObject({ cancelled: true });
  await session.dispose();
});

test('a pre-aborted request cannot start a native turn', async () => {
  const { session, client } = await fixture();
  const abort = new AbortController(); abort.abort();
  const pending = session.query({ prompt: 'Never send.', signal: abort.signal });
  await jest.advanceTimersByTimeAsync(20);
  expect(await pending).toMatchObject({ success: false, cancelled: true });
  expect(client.startTurn).not.toHaveBeenCalled();
  await session.dispose();
});

test.each(['failed', 'interrupted'])('native %s terminal cannot admit partial replacement text', async status => {
  const { session, client, emit } = await fixture();
  const pending = session.query({ prompt: 'Draft.' });
  await Promise.resolve();
  emit('item/agentMessage/delta', { threadId: 'owned-aux', turnId: 'owned-turn', itemId: 'partial', delta: '<replacement>partial</replacement>' });
  emit('turn/completed', { threadId: 'owned-aux', turn: { id: 'owned-turn', status } });
  expect(await pending).toMatchObject({ success: false });
  expect(client.interruptTurn).not.toHaveBeenCalled();
  await session.dispose();
});

test('explicit cancel and dispose propagate one interrupt while a successful terminal preserves replacement text', async () => {
  const { session, client, emit } = await fixture();
  const cancelled = session.query({ prompt: 'Cancel.' });
  await Promise.resolve(); await Promise.resolve();
  session.cancel(); session.cancel();
  expect(await cancelled).toMatchObject({ success: false, cancelled: true });
  expect(client.interruptTurn).toHaveBeenCalledTimes(1);
  const completed = session.followUp('Complete.');
  await Promise.resolve(); await Promise.resolve();
  emit('item/agentMessage/delta', { threadId: 'owned-aux', turnId: 'owned-turn', itemId: 'answer', delta: '<replacement>ready</replacement>' });
  emit('turn/completed', { threadId: 'owned-aux', turn: { id: 'owned-turn', status: 'completed' } });
  expect(await completed).toMatchObject({ success: true, text: '<replacement>ready</replacement>' });
  await session.dispose();
  expect(client.interruptTurn).toHaveBeenCalledTimes(1);
});

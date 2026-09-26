import { ZCodeInteractionBridge } from '../../../../../src/core/agents/backend/zcode/ZCodeInteractionBridge';

const ask = (requestId: string, sessionId: string, toolName = 'Write') => ({
  requestId,
  sessionId,
  toolCallId: `call_${requestId}`,
  turnId: `turn_${requestId}`,
  toolName,
  input: { file_path: 'acceptance.txt' },
  options: [{ kind: 'allow_once', response: { decision: 'allow' } }],
});

it('keeps a session approval scoped to the original native session and tool', async () => {
  const bridge = new ZCodeInteractionBridge();
  const emitted: string[] = [];
  const emit = (sessionId: string) => { emitted.push(sessionId); };
  const first = bridge.registerAskForAdapter('permission', ask('one', 'session-a'), emit);
  bridge.respondToPermission('one', 'session');
  await expect(first).resolves.toEqual({ decision: 'allow', reason: 'Approved for this session' });

  await expect(bridge.registerAskForAdapter('permission', ask('two', 'session-a'), emit))
    .resolves.toEqual({ decision: 'allow', reason: 'Approved for this session' });
  expect(emitted).toEqual(['session-a']);

  const otherSession = bridge.registerAskForAdapter('permission', ask('three', 'session-b'), emit);
  const otherTool = bridge.registerAskForAdapter('permission', ask('four', 'session-a', 'Bash'), emit);
  expect(emitted).toEqual(['session-a', 'session-b', 'session-a']);
  bridge.settlePendingForTeardown();
  await expect(otherSession).resolves.toMatchObject({ decision: 'deny' });
  await expect(otherTool).resolves.toMatchObject({ decision: 'deny' });
});

it('times out a pure permission request as deny and rejects a late approval', async () => {
  jest.useFakeTimers();
  try {
    const bridge = new ZCodeInteractionBridge();
    const emit = jest.fn();
    const first = bridge.registerAskForAdapter('permission', ask('timeout-a', 'session-a'), emit);
    jest.advanceTimersByTime(30_000);
    const other = bridge.registerAskForAdapter('permission', ask('still-b', 'session-b'), emit);
    expect(bridge.getPending('permission')).toHaveLength(2);

    jest.advanceTimersByTime(30_000);
    await expect(first).resolves.toMatchObject({ decision: 'deny', reason: 'Permission request timed out.' });
    expect(() => bridge.respondToPermission('timeout-a', 'once')).toThrow('not pending');
    await expect(bridge.registerAskForAdapter('permission', ask('timeout-a', 'session-a'), emit))
      .resolves.toMatchObject({ decision: 'deny' });
    expect(bridge.getPending('permission').map((entry) => entry.id)).toEqual(['still-b']);
    bridge.settlePendingForTeardown();
    await expect(other).resolves.toMatchObject({ decision: 'deny' });
  } finally {
    jest.useRealTimers();
  }
});

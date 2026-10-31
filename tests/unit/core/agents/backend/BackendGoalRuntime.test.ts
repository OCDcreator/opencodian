import { BackendGoalRuntime, confirmGoalCommand, validateGoalCommand } from '../../../../../src/core/agents/backend/BackendGoalRuntime';

const capabilities = {
  source: 'native' as const, driver: 'test.native',
  actions: ['set', 'edit', 'pause', 'resume', 'clear', 'budget'] as const,
  pauseMode: 'goal' as const, editMode: 'replace' as const,
  objectiveLimit: 4000, budgets: ['tokens'] as const,
};

describe('BackendGoalRuntime', () => {
  it('keeps a read failure distinct from an authoritative absent Goal', () => {
    const runtime = new BackendGoalRuntime('codex', capabilities);
    expect(runtime.get('s')).toEqual({ status: 'unknown', goal: null });
    runtime.observe('s', { objective: 'Pass tests', status: 'active' });
    expect(runtime.fail('s', new Error('disconnected'))).toMatchObject({
      status: 'failed', goal: { objective: 'Pass tests' }, reason: 'disconnected',
    });
    expect(runtime.observe('s', null)).toMatchObject({ status: 'ready', goal: null });
  });

  it('does not let a slow snapshot overwrite a newer native event', () => {
    const runtime = new BackendGoalRuntime('opencode2', capabilities);
    const version = runtime.version('s');
    runtime.observe('s', { objective: 'New objective', status: 'paused' });
    expect(runtime.observeRead('s', { objective: 'Old objective', status: 'active' }, version))
      .toMatchObject({ goal: { objective: 'New objective', status: 'paused' } });
  });

  it('keeps execution interruption separate from native Goal state and session identity', () => {
    const runtime = new BackendGoalRuntime('claude-code', capabilities);
    runtime.observe('s1', { condition: 'Pass tests', iterations: 3, tokens_at_start: 1000 });
    runtime.activity('s1', 'stopped');
    expect(runtime.get('s1')).toMatchObject({ goal: { status: 'active', execution: 'stopped', rounds: 3 } });
    expect(runtime.get('s1').goal?.tokensUsed).toBeUndefined();
    expect(runtime.get('s2').goal).toBeNull();
  });

  it('contains subscriber failures and disposes detached subscribers', () => {
    const runtime = new BackendGoalRuntime('zcode', capabilities);
    const handler = jest.fn();
    runtime.subscribe(() => { throw new Error('detached view'); });
    const subscription = runtime.subscribe(handler);
    runtime.observe('s', null);
    subscription.dispose();
    runtime.observe('s', null);
    expect(handler).toHaveBeenCalledTimes(1);
  });

  it('serializes one session while letting another session proceed', async () => {
    const runtime = new BackendGoalRuntime('codex', capabilities);
    const order: string[] = [];
    let release!: () => void;
    const pending = new Promise<void>((resolve) => { release = resolve; });
    const first = runtime.control('a', async () => { order.push('a1'); await pending; });
    const second = runtime.control('a', async () => { order.push('a2'); });
    await runtime.control('b', async () => { order.push('b'); });
    expect(order).toEqual(['a1', 'b']);
    release(); await Promise.all([first, second]);
    expect(order).toEqual(['a1', 'b', 'a2']);
  });

  it('requires matching native readback after a control ACK', () => {
    const runtime = new BackendGoalRuntime('codex', capabilities);
    const state = runtime.observe('s', { objective: 'Keep tests green', status: 'active' });
    expect(confirmGoalCommand({ action: 'clear' }, state).status).toBe('partial');
    expect(confirmGoalCommand({ action: 'pause' }, state).status).toBe('partial');
    expect(confirmGoalCommand({ action: 'clear' }, runtime.observe('s', null)).status).toBe('confirmed');
  });

  it('rejects unavailable budgets and oversized objectives without truncation', () => {
    expect(() => validateGoalCommand({ action: 'set', objective: 'x'.repeat(4001) }, capabilities)).toThrow('4000');
    expect(() => validateGoalCommand({ action: 'budget', tokenBudget: -1 }, capabilities)).toThrow();
    expect(() => validateGoalCommand({ action: 'set', objective: 'Pass tests', tokenBudget: null },
      { ...capabilities, budgets: [] })).toThrow('does not expose');
  });

  it('invalidates cached evidence without pretending that a Goal was cleared', () => {
    const runtime = new BackendGoalRuntime('dsh', capabilities);
    runtime.observe('s', { objective: 'Pass tests', status: 'active', armed: true });
    runtime.invalidate('runtime closed');
    expect(runtime.get('s')).toMatchObject({ status: 'stale', goal: { objective: 'Pass tests' } });
  });
});

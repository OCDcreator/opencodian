import { describe, expect, it, jest } from '@jest/globals';
import { Goal } from '@opencode/schema/goal';

import { OpenCode2Adapter } from '../../../../../src/core/agents/backend/opencode/OpenCode2Adapter';

function adapterWithClient(client: object): OpenCode2Adapter {
  const adapter = new OpenCode2Adapter({
    workingDirectory: '/vault',
    getSettings: () => ({ mode: 'remote', executablePath: '', baseUrl: 'http://127.0.0.1:4096', password: '' }),
  });
  Object.assign(adapter, { client: { server: { info: async () => ({ version: '2.0.18' }) }, ...client }, connectionKey: JSON.stringify(['remote', '', 'http://127.0.0.1:4096', '', '']) });
  return adapter;
}

/** Native Goal.State shape published by the upstream /goal plugin (v2.3.0). */
const nativeGoalState = (overrides: Record<string, unknown> = {}) => ({
  id: 'goal_1', objective: 'Ship the backend refresh', status: 'active',
  rounds: 2, maxRounds: 6, boot: 'boot-1', updatedAt: 1_700_000_000_000, ...overrides,
});

describe('OpenCode2Adapter native Goal RPC', () => {
  it('reads through the official Goal.Definition and normalizes native state', async () => {
    const get = jest.fn(async () => nativeGoalState());
    const rpc = jest.fn(() => ({ get }));
    const adapter = adapterWithClient({ rpc });
    const readback = await adapter.readSessionGoal('s1');
    expect(rpc).toHaveBeenCalledWith(Goal.Definition);
    expect(get).toHaveBeenCalledWith({ sessionID: 's1' }, expect.objectContaining({ location: { directory: '/vault' } }));
    expect(readback).toMatchObject({ status: 'ready', goal: {
      objective: 'Ship the backend refresh', rawStatus: 'active', status: 'active',
      id: 'goal_1', rounds: 2, maxRounds: 6, updatedAt: 1_700_000_000_000,
    } });
  });

  it('keeps optional native fields truthful and accepts an absent Goal', async () => {
    const adapter = adapterWithClient({ rpc: () => ({ get: async () => null }) });
    expect(await adapter.readSessionGoal('s1')).toMatchObject({ status: 'ready', goal: null });
    const paused = adapterWithClient({ rpc: () => ({ get: async () => nativeGoalState({ status: 'paused', reason: 'waiting on user', stalls: 1 }) }) });
    // The shared store projects fields common to all six backends; upstream-only
    // extras like `stalls` are intentionally outside AgentGoalSnapshot.
    expect(await paused.readSessionGoal('s2')).toMatchObject({ status: 'ready', goal: {
      status: 'paused', reason: 'waiting on user', rounds: 2,
    } });
  });

  it('reports failed instead of crashing when native output violates the Goal contract', async () => {
    const adapter = adapterWithClient({ rpc: () => ({ get: async () => ({ id: 'goal_1', status: 'active' }) }) });
    expect(await adapter.readSessionGoal('s1')).toMatchObject({ status: 'failed', goal: null, reason: 'Native Goal state has no objective' });
    const malformed = adapterWithClient({ rpc: () => ({ get: async () => 'garbage' }) });
    expect(await malformed.readSessionGoal('s1')).toMatchObject({ status: 'failed', reason: 'Malformed native Goal state' });
  });

  it('keeps the official wire contract aligned with the adapter driver and objective bound', () => {
    const capabilities = adapterWithClient({}).getGoalCapabilities();
    expect(Goal.Definition.id).toBe('opencode.goal');
    expect(Object.hasOwn(Goal.Definition.methods, 'get')).toBe(true);
    expect(Object.hasOwn(Goal.Definition.events, 'changed')).toBe(true);
    // The raw event observer filters by this literal; the official definition
    // must keep deriving the same event type.
    expect(`rpc.${Goal.Definition.id}.changed`).toBe('rpc.opencode.goal.changed');
    expect(capabilities).toMatchObject({ source: 'native', driver: 'opencode.goal', objectiveLimit: 4000 });
  });
});

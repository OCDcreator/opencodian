import { describe, expect, it } from '@jest/globals';

import type { DshAcpClientOptions, DshJsonObject } from '../../../../../src/core/agents/backend/dsh/DshAcpClient';
import { DshAdapter } from '../../../../../src/core/agents/backend/dsh/DshAdapter';
import { type DshBackendSettings, normalizeDshBackendSettings } from '../../../../../src/core/types/settings';
import { collect, deferred, FakeDshClient, MODEL_OPTIONS, settings, tick } from './DshAdapter.fixture';

class PlanClient extends FakeDshClient {
  override handshake: DshJsonObject = { nativeProtocol: 'opencodian.dsh-native/1', agentCapabilities: {}, controlCapabilities: { plan: { get: true, set: true } } };
  readonly requests: Array<{ method: string; params: DshJsonObject }> = [];
  respond: (method: string, params: DshJsonObject) => Promise<DshJsonObject | undefined> = async () => undefined;
  constructor(options: DshAcpClientOptions, readonly plans: Map<string, boolean>) { super(options); }
  async nativeRequest(method: string, params: DshJsonObject): Promise<DshJsonObject> {
    this.requests.push({ method, params });
    const custom = await this.respond(method, params); if (custom !== undefined) return custom;
    if (method === 'session/fork') return { sessionId: 'forked', configOptions: MODEL_OPTIONS };
    if (method !== 'session/plan') throw new Error('unexpected plan fixture request');
    if (params.action === 'set') this.plans.set(String(params.sessionId), params.active as boolean);
    return { active: this.plans.get(String(params.sessionId)) ?? false, ...(params.action === 'set' ? { disposition: 'committed' } : {}) };
  }
}
function fixture(defaultPlanMode?: boolean) {
  const current: DshBackendSettings = { ...settings(), transport: 'native', ...(defaultPlanMode === undefined ? {} : { defaultPlanMode }) };
  const clients: PlanClient[] = []; const plans = new Map<string, boolean>();
  const adapter = new DshAdapter({ workingDirectory: '/vault', getSettings: () => current, createClient: options => {
    const client = new PlanClient(options, plans); clients.push(client); return client;
  } });
  return { adapter, current, clients, plans };
}

describe('DSH new-session Plan default policy', () => {
  it.each([true, false])('persists the boolean Plan default %s while absent or invalid values inherit', value => {
    expect(normalizeDshBackendSettings({ defaultPlanMode: value }).defaultPlanMode).toBe(value);
    for (const invalid of [undefined, null, 'true', 0, {}]) expect(normalizeDshBackendSettings({ defaultPlanMode: invalid }).defaultPlanMode).toBeUndefined();
  });

  it.each([true, false])('applies Plan %s to a newly published Native session and independently reads it back', async enabled => {
    const { adapter, clients, plans } = fixture(enabled); plans.set('created-1', !enabled);
    const id = await adapter.createSession();
    expect(plans.get(id)).toBe(enabled);
    expect(clients[0].requests).toEqual([
      { method: 'session/plan', params: { sessionId: id, action: 'set', active: enabled } },
      { method: 'session/plan', params: { sessionId: id, action: 'get' } },
    ]);
    const sending = collect(adapter.sendMessage({ sessionId: id, content: 'hello' })); await tick(); clients[0].resolvePrompt(id); await sending;
    expect(clients[0].requests).toHaveLength(2); await adapter.stop();
  });

  it('uses the latest publication default when settings change after catalog draft creation', async () => {
    const { adapter, current, clients, plans } = fixture(true);
    const draft = await adapter.readSessionConfiguration();
    expect(clients[0].requests).toHaveLength(0);
    plans.set(draft.sessionId, true); current.defaultPlanMode = false;
    await expect(adapter.createSession()).resolves.toBe(draft.sessionId);
    expect(plans.get(draft.sessionId)).toBe(false);
    expect(clients[0].calls.filter(call => call.method === 'session/new')).toHaveLength(1);
    expect(clients[0].requests[0]).toEqual({ method: 'session/plan', params: { sessionId: draft.sessionId, action: 'set', active: false } });
    await adapter.start(); expect(clients).toHaveLength(1); await adapter.stop();
  });

  it('inherits actual draft Plan state when the policy is cleared before publication', async () => {
    const { adapter, current, clients, plans } = fixture(false);
    const draft = await adapter.readSessionConfiguration(); plans.set(draft.sessionId, true); current.defaultPlanMode = undefined;
    await expect(adapter.createSession()).resolves.toBe(draft.sessionId);
    expect(plans.get(draft.sessionId)).toBe(true); expect(clients[0].requests).toHaveLength(0); await adapter.stop();
  });

  it('never applies the library default on resume, fork, or ACP', async () => {
    const { adapter, clients, current, plans } = fixture(true); plans.set('persisted', false);
    await adapter.createSession(undefined, { resumeSessionId: 'persisted' });
    await adapter.forkSession('persisted');
    expect(clients[0].requests.filter(request => request.method === 'session/plan')).toHaveLength(0);
    expect(plans.get('persisted')).toBe(false); await adapter.stop();
    current.transport = 'acp'; await adapter.createSession();
    expect(clients[1].requests).toHaveLength(0); await adapter.stop();
  });

  it.each([
    { active: true, pending: true, disposition: 'queued' },
    { active: false, disposition: 'committed' },
    { active: 'true' },
    { active: true, pending: false, disposition: 'queued' },
  ])('rejects unconfirmed, queued or malformed Plan initialization %# and closes only the draft', async response => {
    const { adapter, clients } = fixture(true); await adapter.readSessionConfiguration();
    clients[0].respond = async () => response;
    try {
      await expect(adapter.createSession()).rejects.toThrow('could not confirm the Plan default');
      expect(clients[0].calls).toContainEqual({ method: 'session/close', params: { sessionId: 'created-1' } });
      expect(clients[0].calls.some(call => call.method === 'stop' || call.method === 'session/cancel' || call.method === 'session/prompt')).toBe(false);
    } finally { await adapter.stop(); }
  });

  it('requires independent readback even when the set response claims success', async () => {
    const { adapter, clients } = fixture(true); await adapter.start();
    clients[0].respond = async (_method, params) => params.action === 'set' ? { active: true, disposition: 'committed' } : { active: false };
    await expect(adapter.createSession()).rejects.toThrow('could not confirm the Plan default');
    expect(clients[0].calls).toContainEqual({ method: 'session/close', params: { sessionId: 'created-1' } }); await adapter.stop();
  });

  it('leaves existing turns alone when a new Plan-default session fails', async () => {
    const { adapter, current, clients } = fixture(); const published = await adapter.createSession();
    const turn = collect(adapter.sendMessage({ sessionId: published, content: 'keep working' })); await tick();
    current.defaultPlanMode = true;
    clients[0].respond = async () => { throw new Error('native secret error'); };
    await expect(adapter.createSession()).rejects.toThrow('could not confirm the Plan default');
    expect(clients[0].calls).toContainEqual({ method: 'session/close', params: { sessionId: 'created-2' } });
    expect(clients[0].calls.some(call => call.method === 'stop' || call.method === 'session/cancel')).toBe(false);
    clients[0].resolvePrompt(published); await turn; await adapter.stop();
  });

  it('does not mutate or close a reserved draft that has already started a turn', async () => {
    const { adapter, current, clients } = fixture(); const { sessionId } = await adapter.readSessionConfiguration();
    const turn = collect(adapter.sendMessage({ sessionId, content: 'already started' })); await tick(); current.defaultPlanMode = true;
    await expect(adapter.createSession()).rejects.toMatchObject({ code: 'busy' });
    expect(clients[0].requests).toHaveLength(0);
    expect(clients[0].calls.some(call => ['stop', 'session/cancel', 'session/close'].includes(call.method))).toBe(false);
    clients[0].resolvePrompt(sessionId); await turn; await adapter.stop();
  });

  it('captures the publication policy once and discards stale initialization responses', async () => {
    const { adapter, current, clients } = fixture(true); const gate = deferred(); await adapter.readSessionConfiguration();
    clients[0].respond = async () => gate.promise;
    const creating = adapter.createSession(); await tick(); current.defaultPlanMode = false;
    expect(clients[0].requests[0].params.active).toBe(true);
    await adapter.stop(); const replacement = await adapter.createSession();
    gate.resolve({ active: true, disposition: 'committed' });
    await expect(creating).rejects.toThrow('could not confirm the Plan default');
    expect(replacement).toBe('created-1');
    expect(clients[1].calls.some(call => call.method === 'session/close' || call.method === 'stop')).toBe(false); await adapter.stop();
  });
});

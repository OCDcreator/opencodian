import { describe, expect, it } from '@jest/globals';

import type { DshAcpClientOptions, DshJsonObject } from '../../../../../src/core/agents/backend/dsh/DshAcpClient';
import { DshAdapter } from '../../../../../src/core/agents/backend/dsh/DshAdapter';
import { deferred, FakeDshClient, settings, tick } from './DshAdapter.fixture';

const CONTROLS = { readback: true, revision: 0,
  jobs: { present: false }, terminal: { present: false }, goal: { present: false },
  subagents: { present: true, list: true, get: true, cancel: true, prompt: true },
};
class ContinuationClient extends FakeDshClient {
  override handshake: DshJsonObject = { nativeProtocol: 'opencodian.dsh-native/1', agentCapabilities: {}, controlCapabilities: CONTROLS };
  readonly nativeCalls: Array<{ method: string; params: DshJsonObject }> = [];
  response: DshJsonObject = { messageId: 'child-accepted-message' };
  continuationGate: ReturnType<typeof deferred> | null = null;
  promptAvailable = true;
  async nativeRequest(method: string, params: DshJsonObject = {}): Promise<DshJsonObject> {
    this.nativeCalls.push({ method, params });
    if (method === 'control/capabilities') return { controlCapabilities: {
      ...CONTROLS, subagents: { ...CONTROLS.subagents, prompt: this.promptAvailable },
    } };
    if (method === 'session/subagents' && params.action === 'prompt') return this.continuationGate?.promise ?? this.response;
    throw new Error('Unexpected synthetic control method');
  }
}
function fixture() {
  const clients: ContinuationClient[] = [];
  const adapter = new DshAdapter({ workingDirectory: '/synthetic-vault',
    getSettings: () => ({ ...settings(), workingDirectory: '/synthetic-vault', transport: 'native' as const }),
    createClient: (options: DshAcpClientOptions) => { const client = new ContinuationClient(options); clients.push(client); return client; },
  });
  return { adapter, clients };
}

describe('DSH adapter child-session continuation forwarding', () => {
  it('uses the captured parent lease and preserves an explicit child destination without prompting the parent', async () => {
    const f = fixture();
    try {
      const parent = await f.adapter.createSession();
      await expect(f.adapter.canContinueChildSession(parent)).resolves.toBe(true);
      await expect(f.adapter.continueChildSession(parent, 'direct-child', 'Synthetic follow-up', { delivery: 'steer' }))
        .resolves.toEqual({ messageId: 'child-accepted-message' });
      expect(f.clients[0].nativeCalls.find(call => call.method === 'session/subagents')?.params).toMatchObject({
        sessionId: parent, childSessionId: 'direct-child', action: 'prompt', delivery: 'steer',
        content: [{ type: 'text', text: 'Synthetic follow-up' }],
      });
      expect(f.clients[0].calls.some(call => call.method === 'session/prompt')).toBe(false);
    } finally { await f.adapter.stop(); }
  });

  it('confirms absence from the current runtime rather than a stale handshake', async () => {
    const f = fixture();
    try {
      const parent = await f.adapter.createSession(); f.clients[0].promptAvailable = false;
      await expect(f.adapter.canContinueChildSession(parent)).resolves.toBe(false);
    } finally { await f.adapter.stop(); }
  });

  it('preserves public rejection reasons without returning prompt details', async () => {
    const f = fixture();
    try {
      const parent = await f.adapter.createSession();
      f.clients[0].response = { failure: { code: 'subagent/not-resumable' } };
      await expect(f.adapter.continueChildSession(parent, 'one-shot-child', 'PRIVATE_SYNTHETIC_INPUT'))
        .rejects.toMatchObject({ code: 'failed', failureCode: 'subagent/not-resumable' });
    } finally { await f.adapter.stop(); }
  });

  it('rejects a receipt after the original adapter generation is stopped', async () => {
    const f = fixture();
    const parent = await f.adapter.createSession();
    const gate = deferred(); f.clients[0].continuationGate = gate;
    const pending = f.adapter.continueChildSession(parent, 'direct-child', 'Synthetic follow-up');
    const outcome = pending.then(() => null, error => error as { code?: string });
    await tick(); await f.adapter.stop(); gate.resolve({ messageId: 'stale-child-message' });
    expect(await outcome).toMatchObject({ code: 'superseded' });
  });

  it('does not send a parent prompt or Native control when only ACP is available', async () => {
    const clients: FakeDshClient[] = [];
    const adapter = new DshAdapter({ workingDirectory: '/synthetic-vault', getSettings: settings,
      createClient: options => { const client = new FakeDshClient(options); clients.push(client); return client; } });
    try {
      const parent = await adapter.createSession();
      await expect(adapter.canContinueChildSession(parent)).rejects.toMatchObject({ code: 'unavailable' });
      await expect(adapter.continueChildSession(parent, 'child', 'Synthetic follow-up')).rejects.toMatchObject({ code: 'unavailable' });
      expect(clients[0].calls.some(call => call.method === 'session/prompt')).toBe(false);
    } finally { await adapter.stop(); }
  });
});

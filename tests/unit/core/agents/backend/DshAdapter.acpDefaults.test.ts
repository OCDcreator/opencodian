import { describe, expect, it } from '@jest/globals';

import type { DshJsonObject } from '../../../../../src/core/agents/backend/dsh/DshAcpClient';
import { DshAdapter } from '../../../../../src/core/agents/backend/dsh/DshAdapter';
import { collect, deferred, FakeDshClient, MODEL_OPTIONS, settings, tick } from './DshAdapter.fixture';

function fixture(configure?: (client: FakeDshClient) => void) {
  const current = settings();
  current.nativeConfig = { version: 1, overrides: { 'agent-default-model': { provider: 'provider-a', model: 'model-a', reasoningEffort: 'high' } } };
  const clients: FakeDshClient[] = [];
  const adapter = new DshAdapter({ workingDirectory: '/vault', getSettings: () => current, createClient: options => {
    const client = new FakeDshClient(options); configure?.(client); clients.push(client); return client;
  } });
  return { current, clients, adapter };
}
function configuration(effort: string) {
  const options = JSON.parse(JSON.stringify(MODEL_OPTIONS)) as DshJsonObject[];
  options.find(option => option.id === 'reasoning_effort')!.currentValue = effort;
  return options;
}

describe('DshAdapter ACP default reasoning effort materialization', () => {
  it('applies the advertised saved effort once to a new session and records only the confirmed baseline', async () => {
    const { adapter, clients } = fixture();
    const id = await adapter.createSession();
    expect(adapter.getDefaultReasoningEffort(id)).toBe('high');
    expect(clients[0].calls.filter(call => call.method === 'session/set_config_option')).toEqual([
      { method: 'session/set_config_option', params: { sessionId: id, configId: 'reasoning_effort', value: 'high' } },
    ]);
    for (const content of ['first', 'second']) {
      const stream = collect(adapter.sendMessage({ sessionId: id, content })); await tick();
      clients[0].resolvePrompt(id); await stream;
    }
    expect(clients[0].calls.filter(call => call.method === 'session/set_config_option')).toHaveLength(1);
    await adapter.stop();
  });

  it('initializes a catalog draft once and reuses it without overwriting a conversation override', async () => {
    const { adapter, clients } = fixture();
    const catalog = await adapter.readSessionConfiguration();
    expect(catalog.configOptions.find(option => option.id === 'reasoning_effort')?.currentValue).toBe('high');
    await expect(adapter.createSession()).resolves.toBe(catalog.sessionId);
    const stream = collect(adapter.sendMessage({ sessionId: catalog.sessionId, content: 'lower for this conversation', options: { variant: 'low' } }));
    await tick(); clients[0].resolvePrompt(catalog.sessionId); await stream;
    const changes = clients[0].calls.filter(call => call.method === 'session/set_config_option');
    expect(changes.map(call => (call.params as DshJsonObject).value)).toEqual(['high', 'low']);
    expect(clients[0].calls.filter(call => call.method === 'session/new')).toHaveLength(1);
    expect(adapter.getDefaultReasoningEffort(catalog.sessionId)).toBe('high');
    await adapter.stop();
  });

  it('does not apply the saved global effort to explicit or lazy resumed sessions', async () => {
    const { adapter, clients } = fixture(client => {
      client.configurations.set('recorded', configuration('low'));
      client.configurations.set('lazy', configuration('low'));
    });
    await expect(adapter.createSession(undefined, { resumeSessionId: 'recorded' })).resolves.toBe('recorded');
    expect(adapter.getDefaultReasoningEffort('recorded')).toBe('low');
    const lazy = await adapter.readSessionConfiguration('lazy');
    expect(lazy.configOptions.find(option => option.id === 'reasoning_effort')?.currentValue).toBe('low');
    expect(clients[0].calls.some(call => call.method === 'session/set_config_option')).toBe(false);
    await adapter.stop();
  });

  it('skips mutation when the new session already confirms the saved effort', async () => {
    const { adapter, clients } = fixture(client => client.configurations.set('created-1', configuration('high')));
    const id = await adapter.createSession();
    expect(adapter.getDefaultReasoningEffort(id)).toBe('high');
    expect(clients[0].calls.some(call => call.method === 'session/set_config_option')).toBe(false);
    await adapter.stop();
  });

  it.each(['unknown', 'missing-catalog'])('fails closed for %s and releases only the unpublished idle session', async condition => {
    const { adapter, clients, current } = fixture(client => {
      if (condition === 'missing-catalog') client.configurations.set('created-1', [MODEL_OPTIONS[0]]);
    });
    if (condition === 'unknown') current.nativeConfig!.overrides['agent-default-model']!.reasoningEffort = 'unsupported';
    await expect(adapter.createSession()).rejects.toThrow('did not confirm the saved default reasoning effort');
    expect(clients[0].calls).toContainEqual({ method: 'session/close', params: { sessionId: 'created-1' } });
    expect(clients[0].calls.some(call => ['session/set_config_option', 'session/prompt', 'session/cancel', 'stop'].includes(call.method))).toBe(false);
    expect(adapter.getDefaultModelSelection('created-1')).toBeNull();
    expect(adapter.getDefaultReasoningEffort('created-1')).toBeUndefined();
    await adapter.stop();
  });

  it('rejects an unconfirmed set response and does not retain the requested default', async () => {
    const { adapter, clients } = fixture(client => { client.confirmConfig = false; });
    await expect(adapter.readSessionConfiguration()).rejects.toThrow('did not confirm the saved default reasoning effort');
    expect(clients[0].calls).toContainEqual({ method: 'session/close', params: { sessionId: 'created-1' } });
    expect(adapter.getDefaultModelSelection()).toBeNull();
    clients[0].confirmConfig = true;
    const catalog = await adapter.readSessionConfiguration();
    expect(catalog.sessionId).toBe('created-2');
    expect(adapter.getDefaultReasoningEffort()).toBe('high');
    await adapter.stop();
  });

  it('captures the requested effort before awaiting native creation', async () => {
    const gate = deferred();
    const { adapter, clients, current } = fixture(client => { client.newSessionGate = gate; });
    const creating = adapter.createSession(); await tick();
    current.nativeConfig!.overrides['agent-default-model']!.reasoningEffort = 'low';
    gate.resolve({ sessionId: 'created-1', configOptions: MODEL_OPTIONS });
    const id = await creating;
    expect(adapter.getDefaultReasoningEffort(id)).toBe('high');
    expect(clients[0].calls).toContainEqual({ method: 'session/set_config_option', params: { sessionId: id, configId: 'reasoning_effort', value: 'high' } });
    await adapter.stop();
  });

  it('discards a late effort mutation without touching a replacement session with the same identity', async () => {
    const gate = deferred(); let count = 0;
    const { adapter, clients } = fixture(client => {
      if (++count === 1) client.setConfigOption = () => gate.promise;
    });
    const old = adapter.createSession(); await tick();
    await adapter.stop(); const fresh = await adapter.createSession();
    gate.resolve({ configOptions: configuration('high') });
    await expect(old).rejects.toThrow('did not confirm the saved default reasoning effort');
    expect(adapter.getDefaultReasoningEffort(fresh)).toBe('high');
    expect(clients[1].calls.some(call => call.method === 'session/close' || call.method === 'stop')).toBe(false);
    await adapter.stop();
  });

  it('leaves Native transport and omitted ACP defaults to the runtime', async () => {
    const native = fixture(); native.current.transport = 'native';
    const nativeId = await native.adapter.createSession();
    expect(native.adapter.getDefaultReasoningEffort(nativeId)).toBe('medium');
    expect(native.clients[0].calls.some(call => call.method === 'session/set_config_option')).toBe(false);
    await native.adapter.stop();
    const acp = fixture(); acp.current.nativeConfig = undefined;
    const acpId = await acp.adapter.createSession();
    expect(acp.adapter.getDefaultReasoningEffort(acpId)).toBe('medium');
    expect(acp.clients[0].calls.some(call => call.method === 'session/set_config_option')).toBe(false);
    await acp.adapter.stop();
  });
});

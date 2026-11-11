import { describe, expect, it } from '@jest/globals';

import type { DshJsonObject } from '../../../../../src/core/agents/backend/dsh/DshAcpClient';
import {
  dshNativeControlCapabilities,
  DshNativeControlError,
  type DshNativeControlLease,
  DshNativeControls,
  DshSubagentContinuationError,
} from '../../../../../src/core/agents/backend/dsh/DshNativeControls';

function fixture(native = true) {
  const capabilities = dshNativeControlCapabilities({ nativeProtocol: 'opencodian.dsh-native/1',
    controlCapabilities: { readback: true, subagents: { list: true, get: true, cancel: true, present: true } } }, native);
  const calls: Array<{ method: string; params: DshJsonObject }> = [];
  let current = true;
  let reply: (method: string, params: DshJsonObject) => Promise<DshJsonObject> = async () => ({ messageId: 'accepted-message' });
  const lease: DshNativeControlLease = {
    capabilities, capabilitiesCurrent: true,
    assertCurrent() { if (!current) throw new DshNativeControlError('superseded', 'Connection replaced'); },
    refreshCapabilities: async () => capabilities,
    request: async (method, params) => { calls.push({ method, params }); return reply(method, params); },
  };
  const controls = new DshNativeControls({ acquire: async sessionId => {
    expect(sessionId).toBe('parent');
    return lease;
  } });
  return { controls, calls, capabilities,
    respond: (value: typeof reply) => { reply = value; },
    replace: () => { current = false; },
  };
}

describe('DSH child continuation control', () => {
  it('probes the optional operation without changing the shared capability shape', async () => {
    const f = fixture();
    f.respond(async () => ({ controlCapabilities: { subagents: { list: true, prompt: true } } }));
    await expect(f.controls.canContinueSessionSubagent('parent')).resolves.toBe(true);
    expect(f.capabilities.controls.subagents).toEqual({ list: true, get: true, cancel: true, present: true });
    expect(f.calls).toEqual([{ method: 'control/capabilities', params: { sessionId: 'parent' } }]);
    f.respond(async () => ({ controlCapabilities: { subagents: { list: true } } }));
    await expect(f.controls.canContinueSessionSubagent('parent')).resolves.toBe(false);
  });

  it('does not turn a failed or malformed capability read into confirmed absence', async () => {
    const f = fixture();
    f.respond(async () => { throw new Error('synthetic private transport detail'); });
    await expect(f.controls.canContinueSessionSubagent('parent')).rejects.toMatchObject({ code: 'failed' });
    f.respond(async () => ({ unexpected: true }));
    await expect(f.controls.canContinueSessionSubagent('parent')).rejects.toMatchObject({ code: 'invalid-response' });
  });

  it('sends text to the exact parent/child with a fresh durable identity and explicit delivery', async () => {
    const f = fixture();
    await expect(f.controls.continueSessionSubagent('parent', 'child-a', 'Keep the original text\n', 'queue'))
      .resolves.toEqual({ messageId: 'accepted-message' });
    await f.controls.continueSessionSubagent('parent', 'child-b', 'Focus the current step', 'steer');
    const [first, second] = f.calls;
    expect(first.method).toBe('session/subagents');
    expect(first.params).toMatchObject({ sessionId: 'parent', action: 'prompt', childSessionId: 'child-a', delivery: 'queue',
      content: [{ type: 'text', text: 'Keep the original text\n' }] });
    expect(first.params.requestId).toEqual(expect.stringMatching(/^[a-f0-9-]{36}$/));
    expect(second.params).toMatchObject({ childSessionId: 'child-b', delivery: 'steer' });
    expect(second.params.requestId).not.toBe(first.params.requestId);
  });

  it.each(['subagent/parent-unavailable', 'subagent/not-resumable', 'subagent/unauthorized',
    'subagent/delivery-unavailable', 'subagent/attachment-invalid', 'subagent/invalid-time-zone'])(
    'retains only the public domain failure %s', async failureCode => {
      const f = fixture();
      f.respond(async () => ({ failure: { code: failureCode } }));
      const failure = await f.controls.continueSessionSubagent('parent', 'child', 'Synthetic follow-up').catch(error => error);
      expect(failure).toBeInstanceOf(DshSubagentContinuationError);
      expect(failure).toBeInstanceOf(DshNativeControlError);
      expect(failure).toMatchObject({ code: 'failed', failureCode });
      expect(failure.message).not.toContain('Synthetic follow-up');
    },
  );

  it.each([{ failure: { code: 'arbitrary/private-detail' } }, { messageId: '' }, { accepted: true }])(
    'rejects a non-receipt instead of claiming child execution succeeded', async response => {
      const f = fixture(); f.respond(async () => response);
      await expect(f.controls.continueSessionSubagent('parent', 'child', 'Synthetic follow-up'))
        .rejects.toMatchObject({ code: 'invalid-response' });
    },
  );

  it('discards a late acceptance after its captured client lease is replaced', async () => {
    const f = fixture();
    let resolve: (value: DshJsonObject) => void = () => {};
    f.respond(() => new Promise(done => { resolve = done; }));
    const pending = f.controls.continueSessionSubagent('parent', 'child', 'Synthetic follow-up');
    await Promise.resolve();
    f.replace(); resolve({ messageId: 'late-acceptance' });
    await expect(pending).rejects.toMatchObject({ code: 'superseded' });
  });

  it('does not issue Native calls on ACP', async () => {
    const f = fixture(false);
    await expect(f.controls.canContinueSessionSubagent('parent')).rejects.toMatchObject({ code: 'unavailable' });
    await expect(f.controls.continueSessionSubagent('parent', 'child', 'Synthetic follow-up'))
      .rejects.toMatchObject({ code: 'unavailable' });
    expect(f.calls).toEqual([]);
  });

  it('refuses blank, over-limit and invalid-delivery inputs before dispatch', () => {
    const f = fixture();
    for (const text of ['', ' \n ', 'x'.repeat(65537)])
      expect(() => f.controls.continueSessionSubagent('parent', 'child', text)).toThrow(DshNativeControlError);
    expect(() => f.controls.continueSessionSubagent('parent', 'child', 'Follow-up', 'other' as 'queue')).toThrow(DshNativeControlError);
    expect(f.calls).toEqual([]);
  });
});

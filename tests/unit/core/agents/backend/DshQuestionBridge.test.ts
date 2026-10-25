import { DshQuestionBridge } from '../../../../../src/core/agents/backend/dsh/DshQuestionBridge';

const wire = { sessionId: 'session', requestId: 'call', questions: [{ id: 'q', question: 'Choose', options: [{ label: 'A' }, { label: 'B' }] }] };

describe('DshQuestionBridge', () => {
  it('maps option labels and free text back to native question identities', async () => {
    const emit = jest.fn(() => true);
    const bridge = new DshQuestionBridge(emit);
    const answered = bridge.request(wire);
    const id = bridge.list()[0].id;
    expect(emit).toHaveBeenCalledWith('session', expect.objectContaining({ type: 'question_request' }));
    bridge.reply(id, [['A']]);
    await expect(answered).resolves.toEqual({ answers: [{ id: 'q', selected: ['A'] }] });
    const custom = bridge.request(wire); bridge.reply(id, [['custom answer']]);
    await expect(custom).resolves.toEqual({ answers: [{ id: 'q', selected: [], custom: 'custom answer' }] });
    expect(bridge.list()).toEqual([]);
  });

  it('rejects malformed and duplicate questions before registering UI state', () => {
    const bridge = new DshQuestionBridge(() => true);
    expect(() => bridge.request({ ...wire, questions: [...wire.questions, ...wire.questions] })).toThrow('Invalid');
    expect(bridge.list()).toEqual([]);
  });

  it('settles a cancelled session without consuming another sessions question', async () => {
    const bridge = new DshQuestionBridge(() => true);
    const first = bridge.request(wire);
    const second = bridge.request({ ...wire, sessionId: 'other' });
    bridge.cancel('session');
    await expect(first).resolves.toEqual({ cancelled: true });
    expect(bridge.list()).toHaveLength(1);
    bridge.cancel(); await expect(second).resolves.toEqual({ cancelled: true });
  });
});

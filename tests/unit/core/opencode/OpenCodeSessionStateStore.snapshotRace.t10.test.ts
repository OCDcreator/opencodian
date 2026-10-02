import { OpenCodeSessionStateStore } from '../../../../src/core/opencode/OpenCodeSessionStateStore';

it('retains independent removed-part barriers after message-only snapshot restoration', () => {
  const store = new OpenCodeSessionStateStore();
  const info = { id: 'answer', sessionID: 's', role: 'assistant' as const, time: { created: 1 } };
  const part = { id: 'text', sessionID: 's', messageID: 'answer', type: 'text', text: 'removed' };
  store.upsertMessage(info);
  store.upsertPart(part);
  store.removeMessage('s', 'answer');
  store.replaceSessionSnapshot('s', [{ info, parts: [] }]);
  store.applyStreamMutations([{ type: 'part.delta', sessionID: 's', messageID: 'answer',
    partID: 'text', field: 'text', delta: 'stale replay' }]);
  expect(store.getSessionState('s')?.messages.map((entry) => entry.id)).toEqual(['answer']);
  expect(store.getSessionState('s')?.partsByMessageID).toEqual({});
  store.upsertPart({ ...part, text: 'authoritative restore' });
  store.applyStreamMutations([{ type: 'part.delta', sessionID: 's', messageID: 'answer',
    partID: 'text', field: 'text', delta: '+next' }]);
  expect(store.getSessionState('s')?.partsByMessageID.answer[0].text).toBe('authoritative restore+next');
});

function snapshot(text: string) {
  return [{ info: { id: 'answer', sessionID: 's', role: 'assistant' as const, time: { created: 1 } },
    parts: [{ id: 'text', sessionID: 's', messageID: 'answer', type: 'text', text }] }];
}

it('ignores an older response arriving after a newer completed snapshot', () => {
  const store = new OpenCodeSessionStateStore();
  store.replaceSessionSnapshot('s', snapshot('initial'));
  const older = store.beginSessionSnapshot('s');
  const newer = store.beginSessionSnapshot('s');
  store.replaceSessionSnapshot('s', snapshot('newer native'), newer);
  const result = store.replaceSessionSnapshot('s', snapshot('older native'), older);
  expect(result.partsByMessageID.answer[0].text).toBe('newer native');
  expect(store.getSessionState('s')?.partsByMessageID.answer[0].text).toBe('newer native');
});

it('lets a later read supersede an earlier completed read without reviving its omissions', () => {
  const store = new OpenCodeSessionStateStore();
  store.replaceSessionSnapshot('s', snapshot('initial'));
  const older = store.beginSessionSnapshot('s');
  const newer = store.beginSessionSnapshot('s');
  store.replaceSessionSnapshot('s', snapshot('older native'), older);
  store.replaceSessionSnapshot('s', [], newer);
  store.applyStreamMutations([{ type: 'part.delta', sessionID: 's', messageID: 'answer',
    partID: 'text', field: 'text', delta: 'old replay' }]);
  expect(store.getSessionState('s')?.messages).toEqual([]);
  expect(store.getSessionState('s')?.partsByMessageID).toEqual({});
});

it('does not let a pending read recreate an evicted session or contaminate a recreated one', () => {
  const store = new OpenCodeSessionStateStore();
  store.replaceSessionSnapshot('s', snapshot('initial'));
  const oldRead = store.beginSessionSnapshot('s');
  store.deleteSession('s');
  expect(store.replaceSessionSnapshot('s', snapshot('stale'), oldRead).messages).toEqual([]);
  expect(store.getSessionState('s')).toBeNull();
  store.replaceSessionSnapshot('s', snapshot('new session'));
  store.replaceSessionSnapshot('s', snapshot('stale again'), oldRead);
  expect(store.getSessionState('s')?.partsByMessageID.answer[0].text).toBe('new session');
});

it('retains a foreground-created part and parent omitted by a pending read', () => {
  const store = new OpenCodeSessionStateStore();
  const read = store.beginSessionSnapshot('s');
  store.applyStreamMutations([{ type: 'part.delta', sessionID: 's', messageID: 'answer',
    partID: 'text', field: 'text', delta: 'live' }]);
  store.replaceSessionSnapshot('s', [], read);
  store.applyStreamMutations([{ type: 'part.delta', sessionID: 's', messageID: 'answer',
    partID: 'text', field: 'text', delta: '+next' }]);
  expect(store.getSessionState('s')?.messages.map((entry) => entry.id)).toEqual(['answer']);
  expect(store.getSessionState('s')?.partsByMessageID.answer[0].text).toBe('live+next');
});

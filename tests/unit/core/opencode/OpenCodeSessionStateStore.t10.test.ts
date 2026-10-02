import { OpenCodeSessionStateStore } from '../../../../src/core/opencode/OpenCodeSessionStateStore';

function seededStore() {
  const store = new OpenCodeSessionStateStore();
  store.upsertMessage({ id: 'answer', sessionID: 's', role: 'assistant', time: { created: 1 } });
  store.upsertPart({ id: 'text', sessionID: 's', messageID: 'answer', type: 'text', text: 'removed' });
  return store;
}

function lateDelta(store: OpenCodeSessionStateStore, sessionID = 's') {
  store.applyStreamMutations([{ type: 'part.delta', sessionID, messageID: 'answer', partID: 'text', field: 'text', delta: 'late' }]);
}

describe('T10 authoritative retraction versus independent foreground ingress', () => {
  it('keeps a removed part absent when a late foreground delta arrives', () => {
    const store = seededStore();
    store.removePart('answer', 'text');
    lateDelta(store);
    expect(store.getSessionState('s')?.partsByMessageID.answer).toBeUndefined();
    expect(store.getSessionState('s')?.messages.map((message) => message.id)).toEqual(['answer']);
  });

  it('keeps a removed message absent when foreground upserts or deltas arrive', () => {
    const store = seededStore();
    store.removeMessage('s', 'answer');
    store.applyStreamMutations([{ type: 'message.upserted', sessionID: 's', messageID: 'answer', role: 'assistant' }]);
    lateDelta(store);
    expect(store.getSessionState('s')?.messages).toEqual([]);
    expect(store.getSessionState('s')?.partsByMessageID).toEqual({});
  });

  it('treats snapshot omission as authoritative removal without suppressing new messages', () => {
    const store = seededStore();
    store.replaceSessionSnapshot('s', []);
    lateDelta(store);
    store.applyStreamMutations([{ type: 'part.delta', sessionID: 's', messageID: 'new-answer', partID: 'new-text', field: 'text', delta: 'new' }]);
    expect(store.getSessionState('s')?.messages.map((message) => message.id)).toEqual(['new-answer']);
    expect(store.getSessionState('s')?.partsByMessageID.answer).toBeUndefined();
  });

  it('permits authoritative restoration and isolates native identity by session', () => {
    const store = seededStore();
    store.removePart('answer', 'text');
    store.upsertPart({ id: 'text', sessionID: 's', messageID: 'answer', type: 'text', text: 'restored' });
    lateDelta(store);
    expect(store.getSessionState('s')?.partsByMessageID.answer?.[0].text).toBe('restoredlate');
    store.removeMessage('s', 'answer');
    lateDelta(store, 'other');
    expect(store.getSessionState('other')?.partsByMessageID.answer?.[0].text).toBe('late');
  });

  it('retains removal across an empty reload snapshot and permits explicit snapshot restoration', () => {
    const store = seededStore();
    store.removeMessage('s', 'answer');
    store.replaceSessionSnapshot('s', []);
    lateDelta(store);
    expect(store.getSessionState('s')?.messages).toEqual([]);
    store.replaceSessionSnapshot('s', [{ info: { id: 'answer', sessionID: 's', role: 'assistant', time: { created: 1 } },
      parts: [{ id: 'text', sessionID: 's', messageID: 'answer', type: 'text', text: 'native restored' }] }]);
    lateDelta(store);
    expect(store.getSessionState('s')?.partsByMessageID.answer?.[0].text).toBe('native restoredlate');
  });
  it('holds a part-removal barrier before its initial foreground part arrives', () => {
    const store = new OpenCodeSessionStateStore();
    store.upsertMessage({ id: 'answer', sessionID: 's', role: 'assistant', time: { created: 1 } });
    store.removePart('answer', 'text');
    lateDelta(store);
    expect(store.getSessionState('s')?.partsByMessageID.answer).toBeUndefined();
  });

  it('releases stream barriers with canonical session eviction', () => {
    const store = seededStore();
    store.removeMessage('s', 'answer');
    store.deleteSession('s');
    lateDelta(store);
    expect(store.getSessionState('s')?.partsByMessageID.answer?.[0].text).toBe('late');
  });

});

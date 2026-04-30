import { OpenCodeSessionStateStore } from '../../../../src/core/opencode/OpenCodeSessionStateStore';
import type {
  OpenCodeCanonicalMessageInfo,
  OpenCodeCanonicalPart,
  OpenCodeSessionMessageWithParts,
} from '../../../../src/core/opencode/types';

function createMessage(
  id: string,
  overrides: Partial<OpenCodeCanonicalMessageInfo> = {},
): OpenCodeCanonicalMessageInfo {
  return {
    id,
    sessionID: 'session-1',
    role: 'assistant',
    time: { created: 1 },
    ...overrides,
  };
}

function createPart(
  id: string,
  messageID: string,
  overrides: Partial<OpenCodeCanonicalPart> = {},
): OpenCodeCanonicalPart {
  return {
    id,
    sessionID: 'session-1',
    messageID,
    type: 'text',
    ...overrides,
  };
}

function applyRepresentativeStreamMutations(store: OpenCodeSessionStateStore): void {
  store.applyStreamMutations([
    {
      type: 'message.upserted',
      sessionID: 'session-1',
      messageID: 'msg-stream',
      role: 'assistant',
      createdAt: 10,
    },
    {
      type: 'part.upserted',
      sessionID: 'session-1',
      messageID: 'msg-stream',
      partID: 'part-1',
      part: createPart('part-1', 'msg-stream', {
        text: 'Hello',
        time: { start: 11 },
      }),
    },
    {
      type: 'part.upserted',
      sessionID: 'session-1',
      messageID: 'msg-stream',
      partID: 'part-1',
      part: createPart('part-1', 'msg-stream', {
        text: undefined,
        time: { end: 12 },
      }),
    },
    {
      type: 'part.delta',
      sessionID: 'session-1',
      messageID: 'msg-stream',
      partID: 'part-1',
      partType: 'text',
      field: 'text',
      delta: ' world',
    },
    {
      type: 'part.delta',
      sessionID: 'session-1',
      messageID: 'msg-stream',
      partID: 'part-2',
      partType: 'text',
      field: 'text',
      delta: 'fallback',
    },
  ]);
}

describe('OpenCodeSessionStateStore', () => {
  it('preserves message insertion order while keeping parts sorted and merging part deltas', () => {
    const store = new OpenCodeSessionStateStore();

    store.upsertMessage(createMessage('msg-2'));
    store.upsertMessage(createMessage('msg-1', { role: 'user' }));
    store.upsertPart(createPart('part-2', 'msg-1', { text: ' later' }));
    store.upsertPart(createPart('part-1', 'msg-1', { text: 'Hel' }));
    store.appendPartDelta({
      messageID: 'msg-1',
      partID: 'part-1',
      field: 'text',
      delta: 'lo',
    });

    const state = store.getSessionState('session-1');

    expect(state?.messages.map((message) => message.id)).toEqual(['msg-2', 'msg-1']);
    expect(state?.partsByMessageID['msg-1']?.map((part) => part.id)).toEqual(['part-1', 'part-2']);
    expect(state?.partsByMessageID['msg-1']?.[0]?.text).toBe('Hello');
  });

  it('replaces full snapshots and removes stale messages and parts', () => {
    const store = new OpenCodeSessionStateStore();
    store.replaceSessionSnapshot('session-1', [
      {
        info: createMessage('msg-old'),
        parts: [createPart('part-old', 'msg-old')],
      },
    ]);

    const nextSnapshot: OpenCodeSessionMessageWithParts[] = [
      {
        info: createMessage('msg-2'),
        parts: [
          createPart('part-b', 'msg-2', { text: 'B' }),
          createPart('part-a', 'msg-2', { text: 'A' }),
        ],
      },
      {
        info: createMessage('msg-1', { role: 'user' }),
        parts: [],
      },
    ];

    const state = store.replaceSessionSnapshot('session-1', nextSnapshot);

    expect(state.messages.map((message) => message.id)).toEqual(['msg-2', 'msg-1']);
    expect(state.partsByMessageID['msg-old']).toBeUndefined();
    expect(state.partsByMessageID['msg-2']?.map((part) => part.id)).toEqual(['part-a', 'part-b']);
  });

  it('does not move an existing assistant message behind later user turns when it is updated', () => {
    const store = new OpenCodeSessionStateStore();

    store.upsertMessage(createMessage('msg-user-1', {
      role: 'user',
      time: { created: 1 },
    }));
    store.upsertMessage(createMessage('msg_assistant_monotonic', {
      role: 'assistant',
      time: { created: 2 },
      parentID: 'msg-user-1',
    } as Partial<OpenCodeCanonicalMessageInfo>));
    store.upsertMessage(createMessage('msg-user-2', {
      role: 'user',
      time: { created: 3 },
    }));
    store.upsertMessage(createMessage('msg-user-3', {
      role: 'user',
      time: { created: 4 },
    }));

    const state = store.upsertMessage(createMessage('msg_assistant_monotonic', {
      role: 'assistant',
      time: { created: 2, updated: 5 },
      parentID: 'msg-user-1',
    } as Partial<OpenCodeCanonicalMessageInfo>));

    expect(state.messages.map((message) => message.id)).toEqual([
      'msg-user-1',
      'msg_assistant_monotonic',
      'msg-user-2',
      'msg-user-3',
    ]);
  });

  it('applies stream mutations while preserving existing part fields and creating delta fallback parts', () => {
    const store = new OpenCodeSessionStateStore();

    applyRepresentativeStreamMutations(store);

    const state = store.getSessionState('session-1');

    expect(state?.messages).toEqual([
      expect.objectContaining({
        id: 'msg-stream',
        role: 'assistant',
        time: { created: 10 },
      }),
    ]);
    expect(state?.partsByMessageID['msg-stream']).toEqual([
      expect.objectContaining({
        id: 'part-1',
        text: 'Hello world',
        time: { start: 11, end: 12 },
      }),
      expect.objectContaining({
        id: 'part-2',
        text: 'fallback',
      }),
    ]);
  });

  it('removes messages and parts from the canonical graph', () => {
    const store = new OpenCodeSessionStateStore();
    store.upsertMessage(createMessage('msg-1'));
    store.upsertPart(createPart('part-1', 'msg-1'));
    store.upsertPart(createPart('part-2', 'msg-1'));

    const afterPartRemove = store.removePart('msg-1', 'part-1');
    expect(afterPartRemove?.partsByMessageID['msg-1']?.map((part) => part.id)).toEqual(['part-2']);

    const afterMessageRemove = store.removeMessage('session-1', 'msg-1');
    expect(afterMessageRemove.messages).toEqual([]);
    expect(afterMessageRemove.partsByMessageID['msg-1']).toBeUndefined();
  });

  it('returns immutable snapshots to callers', () => {
    const store = new OpenCodeSessionStateStore();
    const state = store.replaceSessionSnapshot('session-1', [
      {
        info: createMessage('msg-1', { role: 'user' }),
        parts: [createPart('part-1', 'msg-1', { text: 'Original' })],
      },
    ]);

    state.messages[0].role = 'assistant';
    state.partsByMessageID['msg-1']![0].text = 'Changed';

    const fresh = store.getSessionState('session-1');

    expect(fresh?.messages[0]?.role).toBe('user');
    expect(fresh?.partsByMessageID['msg-1']?.[0]?.text).toBe('Original');
  });

  describe('session diff entries', () => {
    it('stores and retrieves diff entries per session', () => {
      const store = new OpenCodeSessionStateStore();
      const entries = [
        { file: 'a.ts', additions: 3, deletions: 1, status: 'modified' as const },
        { file: 'b.ts', additions: 0, deletions: 5, status: 'deleted' as const },
      ];

      store.setSessionDiffEntries('session-1', entries);

      expect(store.getSessionDiffEntries('session-1')).toEqual(entries);
      expect(store.getSessionDiffEntries('session-2')).toEqual([]);
    });

    it('returns cloned entries to prevent mutation', () => {
      const store = new OpenCodeSessionStateStore();
      store.setSessionDiffEntries('session-1', [
        { file: 'a.ts', additions: 1, deletions: 0 },
      ]);

      const retrieved = store.getSessionDiffEntries('session-1');
      retrieved[0].file = 'changed.ts';

      expect(store.getSessionDiffEntries('session-1')[0].file).toBe('a.ts');
    });

    it('removes entries when set to empty array', () => {
      const store = new OpenCodeSessionStateStore();
      store.setSessionDiffEntries('session-1', [
        { file: 'a.ts', additions: 1, deletions: 0 },
      ]);

      store.setSessionDiffEntries('session-1', []);

      expect(store.getSessionDiffEntries('session-1')).toEqual([]);
    });

    it('removes entries explicitly', () => {
      const store = new OpenCodeSessionStateStore();
      store.setSessionDiffEntries('session-1', [
        { file: 'a.ts', additions: 1, deletions: 0 },
      ]);

      store.removeSessionDiffEntries('session-1');

      expect(store.getSessionDiffEntries('session-1')).toEqual([]);
    });
  });
});

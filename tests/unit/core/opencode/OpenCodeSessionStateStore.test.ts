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
});

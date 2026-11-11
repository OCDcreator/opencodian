import { describe, expect, it, jest } from '@jest/globals';

import type { ChatMessage, Conversation, ImageAttachment } from '../../../../src/core/types/chat';
import { OpenCodianView } from '../../../../src/features/chat/OpenCodianView';
import { ConversationIdentityRuntime } from '../../../../src/features/chat/services/conversation/ConversationIdentityRuntime';

// This suite exercises history merging, not the separately tested host terminal.
jest.mock('../../../../src/features/chat/ui/SessionWorkbenchTools', () => ({ SessionWorkbenchTools: jest.fn() }));

const IMAGE: ImageAttachment = { data: 'c3ludGhldGljLWltYWdl', mediaType: 'image/png', filename: 'synthetic.png' };

type SyncResult = { messages: ChatMessage[]; changed: boolean; fingerprint: string };
type SyncHarness = {
  syncConversationMessagesFromServer(conversation: Conversation, tabId: string): Promise<SyncResult>;
  commitConversationWrite: ReturnType<typeof jest.fn>;
};

function message(images?: ImageAttachment[]): ChatMessage {
  return { id: 'local-user', role: 'user', sourceMessageId: 'native-user', content: 'Preserve my local text', timestamp: 1,
    ...(images === undefined ? {} : { images }) };
}

function fixture(existing: ChatMessage, incoming: ChatMessage | ChatMessage[], backend: 'dsh' | 'claude-code' = 'dsh') {
  const conversation: Conversation = { id: 'owned-conversation', backend, backendSessionId: 'owned-session',
    title: 'Synthetic image hydration', createdAt: 1, updatedAt: 1, messages: [existing] };
  const identity = new ConversationIdentityRuntime({ getCanonicalConversationFingerprint: () => undefined,
    getActiveTabId: () => 'owned-tab', getTabContextUsage: () => null, showTurnChangeRecords: () => true });
  const getChatMessages = jest.fn(async (sessionId: string) => {
    expect(sessionId).toBe('owned-session'); return Array.isArray(incoming) ? incoming : [incoming];
  });
  const view = Object.assign(Object.create(OpenCodianView.prototype), {
    plugin: { agentServiceRegistry: { get: jest.fn(() => ({ getChatMessages })) } },
    conversationIdentityRuntime: identity,
    getActiveTabId: () => 'owned-tab',
    createConversationWriteTicket: jest.fn(() => ({ conversationId: conversation.id })),
    commitConversationWrite: jest.fn(async (_conversation: Conversation, _ticket: unknown, _reason: string, write: () => void) => {
      write(); return true;
    }),
  }) as SyncHarness;
  return { conversation, view, getChatMessages };
}

describe('DSH history image backfill in the existing native message merge', () => {
  it.each([{ name: 'missing', images: undefined }, { name: 'empty', images: [] as ImageAttachment[] }])(
    'backfills a $name local image field from the exact source message and commits the image-only change', async ({ images }) => {
      const previous = message(images);
      const incoming = { ...message([IMAGE]), id: 'backend-user' };
      const f = fixture(previous, incoming);
      const result = await f.view.syncConversationMessagesFromServer(f.conversation, 'owned-tab');
      expect(result.changed).toBe(true);
      expect(result.messages[0].images).toEqual([IMAGE]);
      expect(result.messages[0].id).toBe('local-user');
      expect(result.messages[0].content).toBe(previous.content);
      expect(f.conversation.messages[0].images).toEqual([IMAGE]);
      expect(f.view.commitConversationWrite).toHaveBeenCalledTimes(1);
      const repeated = await f.view.syncConversationMessagesFromServer(f.conversation, 'owned-tab');
      expect(repeated.changed).toBe(false);
      expect(f.view.commitConversationWrite).toHaveBeenCalledTimes(1);
    },
  );

  it('does not attach an earlier turn image through a substring match, including on a second sync', async () => {
    const previous: ChatMessage = { id: 'local-last', role: 'user', content: 'ok', timestamp: 2 };
    const earlier: ChatMessage = { id: 'earlier', sourceMessageId: 'earlier', role: 'user',
      content: 'okay, another turn', images: [IMAGE], timestamp: 1 };
    const last: ChatMessage = { id: 'last', sourceMessageId: 'last', role: 'user', content: 'ok', timestamp: 2 };
    const f = fixture(previous, [earlier, last]);
    for (let run = 0; run < 2; run++) {
      const result = await f.view.syncConversationMessagesFromServer(f.conversation, 'owned-tab');
      expect(result.messages.find(item => item.id === 'local-last')).toMatchObject({ sourceMessageId: 'last', content: 'ok' });
      expect(result.messages.find(item => item.id === 'local-last')?.images).toBeUndefined();
      expect(result.messages.find(item => item.sourceMessageId === 'earlier')?.images).toEqual([IMAGE]);
    }
  });

  it('accepts an exact text-only match only when it is unique on both sides', async () => {
    const previous = { ...message(), sourceMessageId: undefined };
    const f = fixture(previous, { ...message([IMAGE]), id: 'server-user' });
    const result = await f.view.syncConversationMessagesFromServer(f.conversation, 'owned-tab');
    expect(result.messages[0]).toMatchObject({ id: previous.id, sourceMessageId: 'native-user', images: [IMAGE] });
  });

  it('does not guess which repeated source-less message owns an image', async () => {
    const previous: ChatMessage = { id: 'ambiguous-local', role: 'user', content: 'ok', timestamp: 2 };
    const incoming: ChatMessage[] = [
      { id: 'earlier', sourceMessageId: 'earlier', role: 'user', content: 'ok', timestamp: 1, images: [IMAGE] },
      { id: 'last', sourceMessageId: 'last', role: 'user', content: 'ok', timestamp: 2 },
    ];
    const f = fixture(previous, incoming);
    const result = await f.view.syncConversationMessagesFromServer(f.conversation, 'owned-tab');
    expect(result.changed).toBe(false);
    expect(result.messages).toEqual([previous]);
    expect(f.view.commitConversationWrite).not.toHaveBeenCalled();
    expect(previous.sourceMessageId).toBeUndefined();
    expect(previous.images).toBeUndefined();
  });

  it.each(['[context]\nhello', 'hello\n[context]', '\n![DeepSeek Harness image](data:image/png;base64,c3ludGhldGlj)\n'])(
    'keeps source-less local text, images and identity when a history projection cannot be proven equal: %s', async content => {
      const previous: ChatMessage = { id: 'local-original', role: 'user', content: 'hello', timestamp: 1,
        images: [{ ...IMAGE, filename: 'local-original.png' }] };
      const f = fixture(previous, { id: 'server-user', sourceMessageId: 'server-user', role: 'user', content, timestamp: 1,
        images: [{ ...IMAGE, filename: 'backend.png' }] });
      for (let run = 0; run < 2; run++) {
        const result = await f.view.syncConversationMessagesFromServer(f.conversation, 'owned-tab');
        expect(result.changed).toBe(false);
        expect(result.messages).toEqual([previous]);
        expect(f.conversation.messages[0]).toBe(previous);
      }
      expect(f.view.commitConversationWrite).not.toHaveBeenCalled();
      expect(previous.sourceMessageId).toBeUndefined();
      expect(previous.content).toBe('hello');
      expect(previous.images?.[0].filename).toBe('local-original.png');
    },
  );

  it('keeps local duplicate messages rather than assign either one an ambiguous backend image', async () => {
    const first: ChatMessage = { id: 'local-first', role: 'user', content: 'same text', timestamp: 1, images: [IMAGE] };
    const second: ChatMessage = { id: 'local-second', role: 'user', content: 'same text', timestamp: 2 };
    const f = fixture(first, { id: 'server', sourceMessageId: 'server', role: 'user', content: 'same text', timestamp: 1 });
    f.conversation.messages.push(second);
    const result = await f.view.syncConversationMessagesFromServer(f.conversation, 'owned-tab');
    expect(result.changed).toBe(false);
    expect(result.messages).toEqual([first, second]);
    expect(f.view.commitConversationWrite).not.toHaveBeenCalled();
  });

  it('keeps existing local attachments, text, context and IDs when the backend returns different image metadata', async () => {
    const localImage = { ...IMAGE, filename: 'local-original.png' };
    const previous = message([localImage]);
    const f = fixture(previous, { ...message([{ ...IMAGE, filename: 'backend-name.png' }]), content: 'Backend text', id: 'backend-user' });
    const result = await f.view.syncConversationMessagesFromServer(f.conversation, 'owned-tab');
    expect(result.messages[0].images).toEqual([localImage]);
    expect(result.messages[0].content).toBe('Preserve my local text');
    expect(result.messages[0].id).toBe(previous.id);
  });

  it('does not erase local image state when an unavailable backend image has no recoverable data', async () => {
    const previous = message([]);
    const f = fixture(previous, { ...message(), content: '[Image unavailable]' });
    const result = await f.view.syncConversationMessagesFromServer(f.conversation, 'owned-tab');
    expect(result.messages[0].images).toEqual([]);
    expect(result.messages[0].content).toBe(previous.content);
    expect(result.changed).toBe(false);
  });

  it('leaves other backend merge behavior unchanged', async () => {
    const f = fixture(message(), { ...message([IMAGE]), id: 'backend-user' }, 'claude-code');
    const result = await f.view.syncConversationMessagesFromServer(f.conversation, 'owned-tab');
    expect(result.messages[0].images).toBeUndefined();
    expect(result.changed).toBe(false);
  });

  it('does not borrow another message images and preserves the recorded assistant model identity', async () => {
    const assistant: ChatMessage = { id: 'assistant-local', sourceMessageId: 'assistant-native', role: 'assistant',
      content: 'Assistant reply', timestamp: 2, modelId: 'recorded-provider/recorded-model' };
    const f = fixture(assistant, { id: 'assistant-server', sourceMessageId: 'assistant-native', role: 'assistant',
      content: 'Assistant reply', timestamp: 2 });
    const result = await f.view.syncConversationMessagesFromServer(f.conversation, 'owned-tab');
    expect(result.messages[0].images).toBeUndefined();
    expect(result.messages[0].modelId).toBe(assistant.modelId);
    expect(result.messages[0].id).toBe(assistant.id);
  });
});

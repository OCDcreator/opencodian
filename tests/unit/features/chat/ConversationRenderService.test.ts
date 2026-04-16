import {
  createMessage,
  getIncrementalRenderedMessageUpdate,
} from './ConversationRenderService.testSupport';

describe('getIncrementalRenderedMessageUpdate', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('returns null when rendered messages shrink', () => {
    const previousMessages = [
      createMessage({ id: 'user-1', role: 'user', content: 'Hi' }),
      createMessage({ id: 'assistant-1', content: 'Hello' }),
    ];
    const nextMessages = [
      createMessage({ id: 'user-1', role: 'user', content: 'Hi' }),
    ];

    const result = getIncrementalRenderedMessageUpdate({
      previousMessages,
      nextMessages,
      getMessagesForRender: (messages) => messages,
      getMessageVisualSignature: (message) => JSON.stringify(message),
    });

    expect(result).toBeNull();
  });

  it('returns null when a non-tail rendered signature changes', () => {
    const previousMessages = [
      createMessage({ id: 'user-1', role: 'user', content: 'Hi' }),
      createMessage({ id: 'assistant-1', content: 'Hello' }),
    ];
    const nextMessages = [
      createMessage({ id: 'user-1', role: 'user', content: 'Changed' }),
      createMessage({ id: 'assistant-1', content: 'Hello' }),
    ];

    const result = getIncrementalRenderedMessageUpdate({
      previousMessages,
      nextMessages,
      getMessagesForRender: (messages) => messages,
      getMessageVisualSignature: (message) => JSON.stringify(message),
    });

    expect(result).toBeNull();
  });
});

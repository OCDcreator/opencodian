import './ConversationRenderService.testSupport';

import type { ChatMessage, Conversation } from '../../../../src/core/types';
import {
  captureElementScrollRestoreSnapshot,
  ConversationRenderService,
  restoreElementScrollAfterRender,
} from './ConversationRenderService.testSupport';
import {
  createConversation,
  createHost,
  createMessage,
} from './ConversationRenderService.testSupport';

describe('ConversationRenderService full-rerender unchanged no-op', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  // 1. An identical follow-up full rerender must not touch the DOM: no clear,
  //    no staging commit, no hydration lifecycle, no scroll restore. The
  //    rendered message elements keep their node identity.
  it('short-circuits an unchanged refresh, preserving DOM node identity', async () => {
    const messages: ChatMessage[] = [
      createMessage({ id: 'user-1', role: 'user', content: 'Hi' }),
      createMessage({ id: 'assistant-1', content: 'Hello' }),
    ];
    const conversation = createConversation(messages);
    const host = createHost({
      getCurrentConversation: jest.fn().mockReturnValue(conversation),
    });
    const service = new ConversationRenderService(host);

    await service.rerenderConversationMessages(conversation);

    // First pass performs a full rebuild.
    expect(host.clearMessagesContainer).toHaveBeenCalledTimes(1);
    expect(host.beginConversationHydration).toHaveBeenCalledTimes(1);
    expect(host.endConversationHydration).toHaveBeenCalledTimes(1);
    expect(host.logAssistantFinalizationDebug).toHaveBeenCalledWith(
      'rerender-conversation-messages-start',
      expect.objectContaining({ conversationId: conversation.id }),
    );

    // Capture the DOM nodes the first pass produced.
    const firstPassNodes = Array.from(host.messagesEl.children);
    expect(firstPassNodes.length).toBeGreaterThan(0);

    // Second pass with identical input must short-circuit.
    (host.clearMessagesContainer as jest.Mock).mockClear();
    (host.beginConversationHydration as jest.Mock).mockClear();
    (host.endConversationHydration as jest.Mock).mockClear();
    (captureElementScrollRestoreSnapshot as jest.Mock).mockClear();
    (restoreElementScrollAfterRender as jest.Mock).mockClear();
    (host.logAssistantFinalizationDebug as jest.Mock).mockClear();

    await service.rerenderConversationMessages(conversation);

    expect(host.clearMessagesContainer).not.toHaveBeenCalled();
    expect(host.beginConversationHydration).not.toHaveBeenCalled();
    expect(host.endConversationHydration).not.toHaveBeenCalled();
    expect(captureElementScrollRestoreSnapshot).not.toHaveBeenCalled();
    expect(restoreElementScrollAfterRender).not.toHaveBeenCalled();
    // The skipped pass emits a distinct debug log for observability.
    expect(host.logAssistantFinalizationDebug).toHaveBeenCalledWith(
      'rerender-conversation-messages-skipped-unchanged',
      expect.objectContaining({ conversationId: conversation.id }),
    );
    // Node identity is preserved — same elements, same order.
    expect(Array.from(host.messagesEl.children)).toEqual(firstPassNodes);
  });

  // 2. When a message's content changed, the fingerprint differs and a full
  //    rebuild runs.
  it('rebuilds when a message content changes between refreshes', async () => {
    const messages: ChatMessage[] = [
      createMessage({ id: 'user-1', role: 'user', content: 'Hi' }),
      createMessage({ id: 'assistant-1', content: 'Hello' }),
    ];
    const conversation = createConversation(messages);
    const host = createHost({
      getCurrentConversation: jest.fn().mockReturnValue(conversation),
    });
    const service = new ConversationRenderService(host);

    await service.rerenderConversationMessages(conversation);
    expect(host.clearMessagesContainer).toHaveBeenCalledTimes(1);

    // Mutate a message's content in place (simulates an edited message).
    messages[1] = { ...messages[1], content: 'Hello, world!' };
    const updatedConversation = createConversation(messages);
    host.getCurrentConversation = jest.fn().mockReturnValue(updatedConversation);

    await service.rerenderConversationMessages(updatedConversation);
    // Fingerprint differs → full rebuild runs again.
    expect(host.clearMessagesContainer).toHaveBeenCalledTimes(2);
  });

  // 3. A message id change (e.g. assistant merge/split composite id, or a
  //    replaced message with identical content but a new id) must invalidate
  //    the fingerprint — the fingerprint serializes the whole message (which
  //    includes id), so an id change differs even with identical content.
  it('rebuilds when a rendered message id changes but content is identical', async () => {
    const messages: ChatMessage[] = [
      createMessage({ id: 'assistant-1', content: 'Hello' }),
    ];
    const conversation = createConversation(messages);
    const host = createHost({
      getCurrentConversation: jest.fn().mockReturnValue(conversation),
    });
    const service = new ConversationRenderService(host);

    await service.rerenderConversationMessages(conversation);
    expect(host.clearMessagesContainer).toHaveBeenCalledTimes(1);

    // Same content, different id (e.g. server re-keyed the message). The
    // fingerprint serializes the whole message (including id), so it differs.
    const replacedMessages: ChatMessage[] = [
      createMessage({ id: 'assistant-rekeyed', content: 'Hello' }),
    ];
    const replacedConversation = createConversation(replacedMessages);
    host.getCurrentConversation = jest.fn().mockReturnValue(replacedConversation);

    await service.rerenderConversationMessages(replacedConversation);
    expect(host.clearMessagesContainer).toHaveBeenCalledTimes(2);
  });

  // 4. A transition into the empty-rewind-notice state has a different
  //    emptyNotice flag and must not be masked by a prior non-empty fingerprint.
  it('does not short-circuit when the empty-conversation notice state changes', async () => {
    const messages: ChatMessage[] = [
      createMessage({ id: 'user-1', role: 'user', content: 'Hi' }),
      createMessage({ id: 'assistant-1', content: 'Hello' }),
    ];
    const conversation = createConversation(messages);
    const host = createHost({
      getCurrentConversation: jest.fn().mockReturnValue(conversation),
      shouldRenderEmptyConversationNotice: jest.fn().mockReturnValue(false),
    });
    const service = new ConversationRenderService(host);

    await service.rerenderConversationMessages(conversation);
    expect(host.clearMessagesContainer).toHaveBeenCalledTimes(1);

    // Now the conversation empties and a rewind notice should render.
    const emptyConversation = createConversation([]);
    host.getCurrentConversation = jest.fn().mockReturnValue(emptyConversation);
    host.shouldRenderEmptyConversationNotice = jest.fn().mockReturnValue(true);

    await service.rerenderConversationMessages(emptyConversation);
    // Different emptyNotice flag → rebuild runs (renders the notice).
    expect(host.clearMessagesContainer).toHaveBeenCalledTimes(2);
  });

  // 5. A fingerprint cached for conversation A must never be matched by an
  //    identical-looking sequence belonging to conversation B. The
  //    conversationId field in the fingerprint plus the owner guard guarantee
  //    this.
  it('does not match a fingerprint cached for a different conversation', async () => {
    const messagesA: ChatMessage[] = [
      createMessage({ id: 'user-1', role: 'user', content: 'Hi' }),
      createMessage({ id: 'assistant-1', content: 'Hello' }),
    ];
    const conversationA: Conversation = {
      ...createConversation(messagesA),
      id: 'conversation-A',
    };
    const host = createHost({
      getCurrentConversation: jest.fn().mockReturnValue(conversationA),
    });
    const service = new ConversationRenderService(host);

    await service.rerenderConversationMessages(conversationA);
    expect(host.clearMessagesContainer).toHaveBeenCalledTimes(1);

    // Identical message bodies, but a different conversation id.
    const conversationB: Conversation = {
      ...createConversation(messagesA),
      id: 'conversation-B',
    };
    host.getCurrentConversation = jest.fn().mockReturnValue(conversationB);

    await service.rerenderConversationMessages(conversationB);
    // conversationId in the fingerprint differs → rebuild, not a no-op.
    expect(host.clearMessagesContainer).toHaveBeenCalledTimes(2);
  });
});

describe('ConversationRenderService full-rerender state preservation and cache invalidation', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  // 6. DOM-only expand/collapse state survives an unchanged refresh because
  //    the no-op path never clears or replaces the live pane.
  it('preserves manual expand state across an unchanged refresh', async () => {
    const messages: ChatMessage[] = [
      createMessage({
        id: 'assistant-1',
        content: 'Hello',
        contentBlocks: [
          {
            type: 'tool_use',
            text: null,
            toolId: 'tool-1',
            toolName: 'read',
            toolKind: 'builtin',
            toolInput: { path: 'a.md' },
            toolStatus: 'completed',
            toolResult: 'ok',
          },
        ],
      }),
    ];
    const conversation = createConversation(messages);
    const host = createHost({
      getCurrentConversation: jest.fn().mockReturnValue(conversation),
    });
    const service = new ConversationRenderService(host);

    await service.rerenderConversationMessages(conversation);

    // Simulate the user manually expanding a tool/thinking block in the DOM.
    const toolContent = host.messagesEl.querySelector('.opencodian-message-content');
    expect(toolContent).not.toBeNull();
    const expandMarker = document.createElement('span');
    expandMarker.className = 'manual-expand-marker';
    toolContent!.appendChild(expandMarker);

    await service.rerenderConversationMessages(conversation);

    // The marker survives the no-op — the DOM was not rebuilt.
    expect(host.clearMessagesContainer).toHaveBeenCalledTimes(1);
    expect(host.messagesEl.querySelector('.manual-expand-marker')).not.toBeNull();
  });

  // 7. A host display setting that alters rendered DOM but is not part of the
  //    message visual signature (renderUserMarkupAsCodeBlocks) must invalidate
  //    the fingerprint via settingsSignature, so toggling it forces a rebuild
  //    even when messages are byte-identical.
  it('rebuilds when a render-affecting display setting changes', async () => {
    const messages: ChatMessage[] = [
      createMessage({ id: 'user-1', role: 'user', content: 'Hi' }),
    ];
    const conversation = createConversation(messages);
    const host = createHost({
      getCurrentConversation: jest.fn().mockReturnValue(conversation),
      renderInputSettingsSignature: jest.fn().mockReturnValue('{"renderUserMarkupAsCodeBlocks":false}'),
    });
    const service = new ConversationRenderService(host);

    await service.rerenderConversationMessages(conversation);
    expect(host.clearMessagesContainer).toHaveBeenCalledTimes(1);

    // Toggle the setting. Messages are unchanged, but the setting signature differs.
    host.renderInputSettingsSignature = jest.fn().mockReturnValue('{"renderUserMarkupAsCodeBlocks":true}');

    await service.rerenderConversationMessages(conversation);
    // settingsSignature differs → rebuild, not a no-op.
    expect(host.clearMessagesContainer).toHaveBeenCalledTimes(2);
  });

  // 8. An incremental sync update (which mutates the live DOM directly) must
  //    invalidate the cached fingerprint, so a later full refresh does not
  //    short-circuit against a fingerprint that no longer reflects the DOM.
  it('invalidates the fingerprint cache after an incremental sync update', async () => {
    const messages: ChatMessage[] = [
      createMessage({ id: 'user-1', role: 'user', content: 'Hi' }),
    ];
    const conversation = createConversation(messages);
    const host = createHost({
      getCurrentConversation: jest.fn().mockReturnValue(conversation),
    });
    const service = new ConversationRenderService(host);

    await service.rerenderConversationMessages(conversation);
    expect(host.clearMessagesContainer).toHaveBeenCalledTimes(1);

    // Simulate an incremental sync that appends a message to the live DOM.
    const nextMessages: ChatMessage[] = [
      ...messages,
      createMessage({ id: 'assistant-1', content: 'Synced reply' }),
    ];
    await service.applySyncedConversationUpdate(messages, nextMessages);

    // A subsequent full refresh with the SAME pre-sync input would re-resolve
    // to the original single message. Without cache invalidation it would
    // short-circuit, leaving the synced DOM in place and skipping indicator
    // refresh. With invalidation it must rebuild.
    await service.rerenderConversationMessages(conversation);
    expect(host.clearMessagesContainer).toHaveBeenCalledTimes(2);
  });

  // 9. A single-user-message in-place rerender mutates the live DOM, so the
  //    cached fingerprint must be invalidated; a later full refresh rebuilds.
  it('invalidates the fingerprint cache after a single-user-message rerender', async () => {
    const messages: ChatMessage[] = [
      createMessage({ id: 'user-1', role: 'user', content: 'Hi' }),
      createMessage({ id: 'assistant-1', content: 'Hello' }),
    ];
    const conversation = createConversation(messages);
    const host = createHost({
      getCurrentConversation: jest.fn().mockReturnValue(conversation),
    });
    const service = new ConversationRenderService(host);

    await service.rerenderConversationMessages(conversation);
    expect(host.clearMessagesContainer).toHaveBeenCalledTimes(1);

    // In-place user message rerender (edits the body directly on the live DOM).
    await service.rerenderSingleUserMessage('user-1', {
      ...messages[0],
      content: 'Edited question',
    });

    // A subsequent full refresh with the original input must rebuild, not no-op.
    await service.rerenderConversationMessages(conversation);
    expect(host.clearMessagesContainer).toHaveBeenCalledTimes(2);
  });

  // 10. The fingerprint cache is scoped to the messages container identity.
  //     If the pane is rebound to a new container (e.g. tab pane swap), a
  //     matching fingerprint must NOT short-circuit — the new container is empty.
  it('does not short-circuit when the messages container identity changes', async () => {
    const messages: ChatMessage[] = [
      createMessage({ id: 'user-1', role: 'user', content: 'Hi' }),
    ];
    const conversation = createConversation(messages);
    const host = createHost({
      getCurrentConversation: jest.fn().mockReturnValue(conversation),
    });
    const service = new ConversationRenderService(host);

    await service.rerenderConversationMessages(conversation);
    expect(host.clearMessagesContainer).toHaveBeenCalledTimes(1);

    // Simulate a pane rebind: swap to a fresh container with identical input.
    const newMessagesEl = document.createElement('div');
    host.getMessagesContainer = jest.fn().mockReturnValue(newMessagesEl);

    await service.rerenderConversationMessages(conversation);
    // Container identity differs → rebuild, not a no-op (the new pane is empty).
    expect(host.clearMessagesContainer).toHaveBeenCalledTimes(2);
  });

  // 11. A locale change alters rendered labels (renderers consume t()) but not
  //     the message payload, so it must be part of the settings signature;
  //     otherwise a locale switch followed by a full refresh would no-op and
  //     leave stale-language labels on screen.
  it('rebuilds when the locale changes between refreshes', async () => {
    const messages: ChatMessage[] = [
      createMessage({ id: 'user-1', role: 'user', content: 'Hi' }),
    ];
    const conversation = createConversation(messages);
    const host = createHost({
      getCurrentConversation: jest.fn().mockReturnValue(conversation),
      renderInputSettingsSignature: jest
        .fn()
        .mockReturnValue('{"locale":"en"}'),
    });
    const service = new ConversationRenderService(host);

    await service.rerenderConversationMessages(conversation);
    expect(host.clearMessagesContainer).toHaveBeenCalledTimes(1);

    // Switch locale. Messages are unchanged, but the settings signature differs.
    host.renderInputSettingsSignature = jest
      .fn()
      .mockReturnValue('{"locale":"zh"}');

    await service.rerenderConversationMessages(conversation);
    // settingsSignature differs → rebuild, not a no-op.
    expect(host.clearMessagesContainer).toHaveBeenCalledTimes(2);
  });

  // 12. An external caller that mutates the live DOM directly (e.g. a notice
  //     service appending a message via the shell adapter) must invalidate the
  //     fingerprint cache via invalidateRerenderFingerprint(), so a subsequent
  //     full refresh does not short-circuit and leave the appended DOM in place.
  it('rebuilds after an external invalidateRerenderFingerprint call', async () => {
    const messages: ChatMessage[] = [
      createMessage({ id: 'user-1', role: 'user', content: 'Hi' }),
      createMessage({ id: 'assistant-1', content: 'Hello' }),
    ];
    const conversation = createConversation(messages);
    const host = createHost({
      getCurrentConversation: jest.fn().mockReturnValue(conversation),
    });
    const service = new ConversationRenderService(host);

    await service.rerenderConversationMessages(conversation);
    expect(host.clearMessagesContainer).toHaveBeenCalledTimes(1);

    // Simulate an external live-DOM mutation (e.g. notice appended directly).
    service.invalidateRerenderFingerprint();

    // A subsequent full refresh with identical input must rebuild, not no-op,
    // because the cache was invalidated by the external mutation.
    await service.rerenderConversationMessages(conversation);
    expect(host.clearMessagesContainer).toHaveBeenCalledTimes(2);
  });
});

import type { PreparedPromptReferences } from '../../../../src/core/types/chat';
import { encodePromptReference } from '../../../../src/features/chat/services/context/PromptReferenceService';
import { MessageSendPreparationService } from '../../../../src/features/chat/services/send/MessageSendPreparationService';
import { createComposerSendContext, createConversation, createHost, createPromptContextItem } from './MessageSendPreparationService.testSupport';

describe('MessageSendPreparationService prompt references', () => {
  const preparedReferences = (): PreparedPromptReferences => ({
    content: 'Compare @prior\n<referenced_sessions>historical evidence</referenced_sessions>',
    displayContent: 'Compare @prior',
    contextItems: [createPromptContextItem({ kind: 'file', path: 'notes/reference.md' })],
    nativeMentions: [{ backend: 'dsh', kind: 'app', id: 'calendar', label: 'Calendar', nativePath: 'app://calendar' }],
    sessionReferences: [{ reference: { version: 1, kind: 'session', id: 'source', label: 'prior',
      vaultPath: '/vault', backend: 'pi', conversationId: 'source', sessionId: 'source-session' },
    strategy: 'snapshot', source: 'plugin-cache', capturedAt: 10, messageCount: 1, omittedMessages: 0, truncated: false, text: 'user: history' }],
  });

  it('persists readable echo and captured provenance while sending prepared context and native mentions', async () => {
    const conversation = { ...createConversation(), backend: 'dsh' as const };
    const references = preparedReferences();
    const host = createHost(conversation, [], { preparePromptReferences: jest.fn().mockResolvedValue(references) });
    const service = new MessageSendPreparationService(host, createComposerSendContext());

    const identity = references.sessionReferences[0].reference;
    const result = await service.prepareMessageSend({ content: `Compare ${encodePromptReference(identity)}` });

    expect(result?.requestContent).toBe(references.content);
    expect(result?.userMessage.content).toBe('Compare @prior');
    expect(result?.userMessage.sessionReferences).toEqual(references.sessionReferences);
    expect(result?.userMessage.promptReferences).toEqual([identity]);
    expect(result?.contextItems).toEqual(references.contextItems);
    expect(result?.modelOptions.nativeMentions).toEqual(references.nativeMentions);
    expect(host.buildStructuredPromptSendPayload).toHaveBeenCalledWith(references.content, expect.anything());
    expect(host.renderMessage).toHaveBeenCalledWith(expect.objectContaining({ content: 'Compare @prior' }));
  });

  it('rejects unavailable references before optimistic persistence or draft clearing', async () => {
    const conversation = createConversation();
    const host = createHost(conversation, [], { preparePromptReferences: jest.fn().mockRejectedValue(new Error('Source unavailable')) });
    const context = createComposerSendContext();
    const outcome = jest.fn();
    const result = await new MessageSendPreparationService(host, context).prepareMessageSend({ content: 'reference', onPreparationOutcome: outcome });
    expect(result).toBeNull();
    expect(conversation.messages).toEqual([]);
    expect(host.saveConversation).not.toHaveBeenCalled();
    expect(context.clearDraftContextItems).not.toHaveBeenCalled();
    expect(outcome).toHaveBeenCalledWith('rejected');
  });

  it('retains raw queued identities and resolves their current availability when consumed', async () => {
    const host = createHost(createConversation(), [], {
      isTabForegroundBusy: jest.fn().mockReturnValue(true), queueFollowUpSend: jest.fn().mockReturnValue(true),
      preparePromptReferences: jest.fn().mockResolvedValue(preparedReferences()),
    });
    await new MessageSendPreparationService(host, createComposerSendContext()).prepareMessageSend({ content: 'stable encoded reference' });
    expect(host.preparePromptReferences).not.toHaveBeenCalled();
    expect(host.queueFollowUpSend).toHaveBeenCalledWith('tab-1', expect.objectContaining({ content: 'stable encoded reference' }));
  });
});

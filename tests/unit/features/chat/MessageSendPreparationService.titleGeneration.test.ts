import { MessageSendPreparationService } from '../../../../src/features/chat/services/send/MessageSendPreparationService';
import {
  createComposerSendContext,
  createConversation,
  createHost,
} from './MessageSendPreparationService.testSupport';

describe('MessageSendPreparationService title generation routing', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it.each(['opencode2', 'claude-code', 'codex', 'pi', 'zcode', 'dsh'] as const)('bootstraps rule and smart titles for %s', async (backend) => {
    const conversation = { ...createConversation(), backend, backendSessionId: `${backend}-session` };
    const host = createHost(conversation, [], {
      shouldGenerateAiTitle: jest.fn().mockReturnValue(true), getCodexSendPreflightError: async () => null,
    });
    const service = new MessageSendPreparationService(host, createComposerSendContext());
    await expect(service.prepareMessageSend({ content: 'First message' })).resolves.not.toBeNull();
    expect(host.applyFallbackConversationTitle).toHaveBeenCalledWith(conversation.id, 'First message');
    expect(host.startAiConversationTitleGeneration).toHaveBeenCalledWith(conversation.id, 'First message', expect.any(Object));
    expect(conversation.titleGenerationStatus).toBe('pending');
  });

  it.each(['opencode2', 'claude-code', 'codex', 'pi', 'zcode', 'dsh'] as const)('keeps %s rule mode free of extra model requests', async (backend) => {
    const conversation = { ...createConversation(), backend, backendSessionId: `${backend}-session` };
    const host = createHost(conversation, [], { getCodexSendPreflightError: async () => null });
    const service = new MessageSendPreparationService(host, createComposerSendContext());
    await expect(service.prepareMessageSend({ content: 'First message' })).resolves.not.toBeNull();
    expect(host.applyFallbackConversationTitle).toHaveBeenCalledWith(conversation.id, 'First message');
    expect(host.startAiConversationTitleGeneration).not.toHaveBeenCalled();
    expect(conversation.titleGenerationStatus).not.toBe('pending');
  });

  it('kicks off title generation for Claude Code conversations when Claude auto-title is enabled', async () => {
    const conversation = createConversation();
    conversation.backend = 'claude-code';
    conversation.backendSessionId = 'claude-code-session';
    delete conversation.openCodeSessionId;
    const host = createHost(conversation, [], {
      shouldGenerateAiTitle: jest.fn().mockReturnValue(true),
    });
    const service = new MessageSendPreparationService(host, createComposerSendContext());

    const result = await service.prepareMessageSend({ content: 'Hello Claude' });

    expect(result).not.toBeNull();
    expect(host.applyFallbackConversationTitle).toHaveBeenCalledWith(
      conversation.id,
      'Hello Claude',
    );
    expect(host.startAiConversationTitleGeneration).toHaveBeenCalledWith(
      conversation.id,
      'Hello Claude',
      expect.objectContaining({
        provider: 'openai',
        model: 'gpt-5.4',
      }),
    );
    expect(conversation.titleGenerationStatus).toBe('pending');
  });
});

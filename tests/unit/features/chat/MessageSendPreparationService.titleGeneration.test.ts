import { MessageSendPreparationService } from '../../../../src/features/chat/services/MessageSendPreparationService';
import {
  createComposerSendContext,
  createConversation,
  createHost,
} from './MessageSendPreparationService.testSupport';

describe('MessageSendPreparationService title generation routing', () => {
  beforeEach(() => {
    jest.clearAllMocks();
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

import { MessageSendPreparationService } from '../../../../src/features/chat/services/send/MessageSendPreparationService';
import { createComposerSendContext, createConversation, createHost } from './MessageSendPreparationService.testSupport';

describe('MessageSendPreparationService backend isolation', () => {
  it.each(['dsh', 'pi', 'zcode', 'opencode2', 'claude-code', 'codex'] as const)(
    'keeps %s prompts independent from the legacy OpenCode skill catalog',
    async (backend) => {
      const conversation = {
        ...createConversation(),
        backend,
        backendSessionId: `${backend}-session-1`,
      };
      const host = createHost(conversation, [], {
        loadSkills: jest.fn().mockRejectedValue(new Error('Legacy service must not be queried')),
        getCodexSendPreflightError: () => null,
      });
      const service = new MessageSendPreparationService(host, createComposerSendContext());

      const result = await service.prepareMessageSend({ content: '/analyze this file' });

      expect(result?.conversation.backendSessionId).toBe(`${backend}-session-1`);
      expect(result?.userMessage.content).toBe('/analyze this file');
      expect(host.loadSkills).not.toHaveBeenCalled();
      expect(host.buildStructuredPromptSendPayload).toHaveBeenCalledWith(
        '/analyze this file',
        expect.not.objectContaining({ syntheticTextParts: expect.anything() }),
      );
    },
  );
});

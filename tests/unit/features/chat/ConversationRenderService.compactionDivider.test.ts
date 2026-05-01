import type { ChatMessage } from '../../../../src/core/types';
import {
  ConversationRenderService,
  createHost,
  createMessage,
} from './ConversationRenderService.testSupport';

function createCompactionDividerMessage(
  overrides: Partial<ChatMessage> & { id: string } & {
    compactionDivider: { auto: boolean; overflow: boolean; tailStartId: string };
  },
): ChatMessage {
  return {
    id: overrides.id,
    role: 'user',
    content: '',
    timestamp: 1,
    ...overrides,
  };
}

describe('compaction divider render path', () => {
  it('routes compaction divider messages through renderCompactionDivider instead of content+footer', async () => {
    const host = createHost();
    const service = new ConversationRenderService(host as never);
    const dividerMessage = createCompactionDividerMessage({
      id: 'divider-1',
      compactionDivider: { auto: true, overflow: false, tailStartId: 'msg-5' },
    });

    await service.renderMessages([dividerMessage]);

    expect(host.userMessageContentRenderer.renderCompactionDivider).toHaveBeenCalledTimes(1);
    expect(host.userMessageContentRenderer.renderCompactionDivider).toHaveBeenCalledWith(
      expect.any(HTMLElement),
      { auto: true, overflow: false, tailStartId: 'msg-5' },
    );
  });

  it('does not call renderUserMessageContent or addUserMessageFooter for divider messages', async () => {
    const host = createHost();
    const service = new ConversationRenderService(host as never);
    const dividerMessage = createCompactionDividerMessage({
      id: 'divider-2',
      compactionDivider: { auto: false, overflow: true, tailStartId: 'msg-10' },
    });

    await service.renderMessages([dividerMessage]);

    expect(host.userMessageContentRenderer.renderUserMessageContent).not.toHaveBeenCalled();
    expect(host.addUserMessageFooter).not.toHaveBeenCalled();
  });

  it('adds the compaction-divider modifier class to the message element', async () => {
    const host = createHost();
    const service = new ConversationRenderService(host as never);
    const dividerMessage = createCompactionDividerMessage({
      id: 'divider-3',
      compactionDivider: { auto: true, overflow: false, tailStartId: 'msg-1' },
    });

    await service.renderMessages([dividerMessage]);

    const messageEl = host.messagesEl.querySelector('[data-message-id="divider-3"]');
    expect(messageEl?.classList.contains('opencodian-message--compaction-divider')).toBe(true);
  });

  it('renders normal user messages with content+footer when no compaction divider is present', async () => {
    const host = createHost();
    const service = new ConversationRenderService(host as never);
    const normalMessage = createMessage({
      id: 'user-normal',
      role: 'user',
      content: 'Hello world',
    });

    await service.renderMessages([normalMessage]);

    expect(host.userMessageContentRenderer.renderUserMessageContent).toHaveBeenCalledTimes(1);
    expect(host.addUserMessageFooter).toHaveBeenCalledTimes(1);
    expect(host.userMessageContentRenderer.renderCompactionDivider).not.toHaveBeenCalled();
  });
});

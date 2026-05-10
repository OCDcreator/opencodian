import { MessageSendPreparationService } from '../../../../src/features/chat/services/MessageSendPreparationService';
import {
  createComposerSendContext,
  createConversation,
  createHost,
} from './MessageSendPreparationService.testSupport';

describe('MessageSendPreparationService follow-up queue', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('queues one follow-up when the active tab is busy before blocking the current send', async () => {
    const host = createHost(createConversation(), [], {
      isTabForegroundBusy: jest.fn().mockReturnValue(true),
      queueFollowUpSend: jest.fn().mockReturnValue(true),
    });
    const service = new MessageSendPreparationService(host, createComposerSendContext());

    const result = await service.prepareMessageSend({
      content: 'Hello after this',
      syntheticTextParts: [{ text: 'synthetic context' }],
    });

    expect(result).toBeNull();
    expect(host.queueFollowUpSend).toHaveBeenCalledWith('tab-1', {
      content: 'Hello after this',
      syntheticTextParts: [{ text: 'synthetic context' }],
      targetTabId: 'tab-1',
    });
    expect(host.notifyForegroundBusy).not.toHaveBeenCalled();
    expect(host.getServerAvailability).not.toHaveBeenCalled();
  });

  it('keeps existing busy blocking semantics when a busy tab already has a queued follow-up', async () => {
    const callOrder: string[] = [];
    const host = createHost(createConversation(), callOrder, {
      isTabForegroundBusy: jest.fn().mockReturnValue(true),
      queueFollowUpSend: jest.fn().mockReturnValue(false),
    });
    const service = new MessageSendPreparationService(host, createComposerSendContext(callOrder));

    const result = await service.prepareMessageSend({ content: 'Second follow-up' });

    expect(result).toBeNull();
    expect(host.queueFollowUpSend).toHaveBeenCalledWith('tab-1', {
      content: 'Second follow-up',
      targetTabId: 'tab-1',
    });
    expect(host.notifyForegroundBusy).toHaveBeenCalledTimes(1);
    expect(host.getServerAvailability).not.toHaveBeenCalled();
    expect(callOrder).toEqual(['notifyForegroundBusy']);
  });

  it('does not queue when no canonical conversation is available', async () => {
    const host = createHost(createConversation(), [], {
      ensureConversationReady: jest.fn().mockResolvedValue(null),
      queueFollowUpSend: jest.fn().mockReturnValue(true),
    });
    const service = new MessageSendPreparationService(host, createComposerSendContext());

    const result = await service.prepareMessageSend({ content: 'No session yet' });

    expect(result).toBeNull();
    expect(host.queueFollowUpSend).not.toHaveBeenCalled();
  });

  it('abandons pinned follow-up preparation if the original tab is no longer active', async () => {
    const host = createHost(createConversation(), [], {
      getActiveTabId: jest.fn().mockReturnValue('tab-2'),
      queueFollowUpSend: jest.fn().mockReturnValue(true),
    });
    const service = new MessageSendPreparationService(host, createComposerSendContext());

    const result = await service.prepareMessageSend({
      content: 'Pinned follow-up',
      targetTabId: 'tab-1',
    });

    expect(result).toBeNull();
    expect(host.ensureConversationReady).not.toHaveBeenCalled();
    expect(host.queueFollowUpSend).not.toHaveBeenCalled();
    expect(host.getServerAvailability).not.toHaveBeenCalled();
  });
});

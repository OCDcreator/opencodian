import { MessageSendPreparationService } from '../../../../src/features/chat/services/MessageSendPreparationService';
import { createComposerSendContext, createConversation, createHost } from './MessageSendPreparationService.testSupport';

describe('MessageSendPreparationService tab changes during preflight', () => {
  it.each(['availability', 'model', 'context', 'commit'])('rejects a switched tab during %s without recording or rendering a turn', async (stage) => {
    const c = createConversation();
    const host = createHost(c);
    const context = createComposerSendContext();
    const outcome = jest.fn();
    const switchTab = () => host.getActiveTabId.mockReturnValue('tab-2');
    if (stage === 'availability') host.getServerAvailability.mockImplementationOnce(async () => { switchTab(); return 'running'; });
    if (stage === 'model') host.ensureSelectedModelAvailable.mockImplementationOnce(async () => { switchTab(); return true; });
    if (stage === 'context') context.resolvePersistentContextItems.mockImplementationOnce(async () => { switchTab(); return []; });
    if (stage === 'commit') host.commitConversationWrite.mockImplementationOnce(async (_c, _ticket, _reason, write) => { switchTab(); await write(); return true; });
    const result = await new MessageSendPreparationService(host, context).prepareMessageSend({ content: 'belongs to tab-1', onPreparationOutcome: outcome });
    expect(result).toBeNull();
    expect(c.messages).toHaveLength(0);
    expect(host.renderMessage).not.toHaveBeenCalled();
    expect(outcome).toHaveBeenCalledWith('rejected');
    expect(host.ensureConversationReady.mock.calls).toHaveLength(stage === 'availability' ? 0 : 1);
  });

  it('keeps an accepted turn in its original conversation when persistence switches tabs', async () => {
    const c = createConversation();
    const host = createHost(c);
    const outcome = jest.fn();
    host.commitConversationWrite.mockImplementationOnce(async (_c, _ticket, _reason, write) => { await write(); host.getActiveTabId.mockReturnValue('tab-2'); return true; });
    const result = await new MessageSendPreparationService(host, createComposerSendContext()).prepareMessageSend({ content: 'accepted tab-1', onPreparationOutcome: outcome });
    expect(result?.tabId).toBe('tab-1');
    expect(result?.conversation).toBe(c);
    expect(c.messages).toHaveLength(1);
    expect(host.renderMessage).not.toHaveBeenCalled();
    expect(outcome).toHaveBeenCalledWith('accepted');
  });
});

import {
  getFriendlyServerStartErrorMessage,
  getUnavailableServerMessage,
  MessageFinalizationService,
} from '../../../../src/features/chat/services/MessageFinalizationService';
import { createConversation, createHost } from './MessageFinalizationService.testSupport';

describe('getFriendlyServerStartErrorMessage', () => {
  it('classifies opencode-not-found errors', () => {
    const result = getFriendlyServerStartErrorMessage(new Error('opencode not found in PATH'));
    expect(result).toContain('opencode');
    expect(result).not.toContain('opencode not found in PATH');
  });

  it('classifies port-in-use errors', () => {
    const result = getFriendlyServerStartErrorMessage(new Error('Port 4096 already in use'));
    expect(result).not.toContain('Port 4096 already in use');
  });

  it('returns generic message with raw error for unknown errors', () => {
    const result = getFriendlyServerStartErrorMessage(new Error('something else went wrong'));
    expect(result).toContain('something else went wrong');
  });

  it('handles non-Error values', () => {
    const result = getFriendlyServerStartErrorMessage('plain string error');
    expect(result).toContain('plain string error');
  });

  it('matches opencode not found case-insensitively', () => {
    const result = getFriendlyServerStartErrorMessage(new Error('OpenCode Not Found'));
    expect(result).not.toContain('OpenCode Not Found');
    expect(result).toContain('opencode');
  });
});

describe('MessageFinalizationService.finalizeAssistantMessageWithError', () => {
  beforeEach(() => { jest.clearAllMocks(); });

  it('renders stream error and persists error message to conversation', async () => {
    const conversation = createConversation([]);
    const host = createHost(conversation);
    const service = new MessageFinalizationService(host);
    const messageEl = document.createElement('div');
    const contentEl = document.createElement('div');

    await service.finalizeAssistantMessageWithError(messageEl, contentEl, 'Server offline');

    expect(host.renderStreamError).toHaveBeenCalledWith(
      expect.objectContaining({ messageEl, contentEl, content: 'Server offline', modelId: 'test-model' }),
    );
    expect(host.saveConversation).toHaveBeenCalledWith(conversation);
    expect(conversation.messages).toHaveLength(1);
    expect(conversation.messages[0].role).toBe('assistant');
    expect(conversation.messages[0].content).toBe('Server offline');
  });

  it('updates conversation sync runtime fingerprint after persisting', async () => {
    const conversation = createConversation([]);
    const host = createHost(conversation);
    const service = new MessageFinalizationService(host);

    await service.finalizeAssistantMessageWithError(
      document.createElement('div'), document.createElement('div'), 'Error',
    );

    expect(host.updateConversationSyncRuntime).toHaveBeenCalledWith('tab-1', { fingerprint: expect.any(String) });
  });

  it('preserves missing current model as undefined during error finalization', async () => {
    const conversation = createConversation([]);
    const host = createHost(conversation, { formatCurrentSessionModelId: jest.fn().mockReturnValue(undefined) });
    const service = new MessageFinalizationService(host);

    await service.finalizeAssistantMessageWithError(
      document.createElement('div'), document.createElement('div'), 'Error',
    );

    expect(host.renderStreamError).toHaveBeenCalledWith(expect.objectContaining({ modelId: undefined }));
    expect(conversation.messages[0].modelId).toBeUndefined();
  });

  it('scrolls to bottom after error finalization', async () => {
    const host = createHost(createConversation([]));
    const service = new MessageFinalizationService(host);

    await service.finalizeAssistantMessageWithError(
      document.createElement('div'), document.createElement('div'), 'Error',
    );

    expect(host.scrollToBottom).toHaveBeenCalledWith({ enableAutoScroll: true });
  });

  it('skips persistence when conversation is null', async () => {
    const host = createHost(createConversation([]), { getCurrentConversation: jest.fn().mockReturnValue(null) });
    const service = new MessageFinalizationService(host);

    await service.finalizeAssistantMessageWithError(
      document.createElement('div'), document.createElement('div'), 'Error',
    );

    expect(host.renderStreamError).toHaveBeenCalled();
    expect(host.saveConversation).not.toHaveBeenCalled();
    expect(host.updateConversationSyncRuntime).not.toHaveBeenCalled();
    expect(host.scrollToBottom).toHaveBeenCalled();
  });
});

describe('MessageFinalizationService.finalizeAssistantMessageWithServerError', () => {
  beforeEach(() => { jest.clearAllMocks(); });

  it('classifies server error and delegates to finalizeAssistantMessageWithError', async () => {
    const conversation = createConversation([]);
    const host = createHost(conversation);
    const service = new MessageFinalizationService(host);
    const messageEl = document.createElement('div');
    const contentEl = document.createElement('div');

    await service.finalizeAssistantMessageWithServerError(messageEl, contentEl, new Error('opencode not found in PATH'));

    expect(host.renderStreamError).toHaveBeenCalledWith(
      expect.objectContaining({ messageEl, contentEl, modelId: 'test-model' }),
    );
    expect(host.renderStreamError.mock.calls[0][0].content).not.toBe('opencode not found in PATH');
    expect(host.saveConversation).toHaveBeenCalledWith(conversation);
    expect(host.scrollToBottom).toHaveBeenCalledWith({ enableAutoScroll: true });
  });

  it('classifies port-in-use errors through delegation', async () => {
    const host = createHost(createConversation([]));
    const service = new MessageFinalizationService(host);

    await service.finalizeAssistantMessageWithServerError(
      document.createElement('div'), document.createElement('div'), new Error('Port 4096 already in use'),
    );

    const renderedContent = host.renderStreamError.mock.calls[0][0].content;
    expect(renderedContent).not.toContain('Port 4096 already in use');
    expect(renderedContent.length).toBeGreaterThan(0);
  });
});

describe('getUnavailableServerMessage', () => {
  it('returns starting message for starting availability', () => {
    const result = getUnavailableServerMessage('starting');
    expect(result).not.toBe('starting');
    expect(result.length).toBeGreaterThan(0);
  });

  it('returns offline message for offline availability', () => {
    const result = getUnavailableServerMessage('offline');
    expect(result).not.toBe('offline');
    expect(result.length).toBeGreaterThan(0);
  });

  it('returns offline message for checking availability', () => {
    const result = getUnavailableServerMessage('checking');
    expect(result).not.toBe('checking');
    expect(result.length).toBeGreaterThan(0);
  });
});

describe('MessageFinalizationService.getUnavailableServerPromptMessage', () => {
  it('delegates unavailable-server prompt text through the service owner', () => {
    const service = new MessageFinalizationService(createHost(createConversation([])));
    expect(service.getUnavailableServerPromptMessage('offline')).toBe(getUnavailableServerMessage('offline'));
  });
});

describe('MessageFinalizationService.finalizeAssistantMessageWithServerUnavailableError', () => {
  beforeEach(() => { jest.clearAllMocks(); });

  it('classifies offline availability and delegates to error finalization', async () => {
    const conversation = createConversation([]);
    const host = createHost(conversation);
    const service = new MessageFinalizationService(host);
    const messageEl = document.createElement('div');
    const contentEl = document.createElement('div');

    await service.finalizeAssistantMessageWithServerUnavailableError(messageEl, contentEl, 'offline');

    expect(host.renderStreamError).toHaveBeenCalledWith(
      expect.objectContaining({ messageEl, contentEl, modelId: 'test-model' }),
    );
    const renderedContent = host.renderStreamError.mock.calls[0][0].content;
    expect(renderedContent).not.toBe('offline');
    expect(host.saveConversation).toHaveBeenCalledWith(conversation);
    expect(host.scrollToBottom).toHaveBeenCalledWith({ enableAutoScroll: true });
  });

  it('classifies starting availability through delegation', async () => {
    const host = createHost(createConversation([]));
    const service = new MessageFinalizationService(host);

    await service.finalizeAssistantMessageWithServerUnavailableError(
      document.createElement('div'), document.createElement('div'), 'starting',
    );

    const renderedContent = host.renderStreamError.mock.calls[0][0].content;
    expect(renderedContent).not.toBe('starting');
    expect(renderedContent.length).toBeGreaterThan(0);
  });
});

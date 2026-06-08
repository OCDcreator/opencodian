import type {
  LocalStreamOutcome,
  StreamShellFinalizerHost,
} from '../../../../../src/features/chat/runtime/SendPipelineTypes';
import { finalizeStreamingShell } from '../../../../../src/features/chat/runtime/StreamShellFinalizer';

function createHost(partial: Partial<StreamShellFinalizerHost> = {}): StreamShellFinalizerHost {
  return {
    addTimestampWithCopyButton: jest.fn(),
    renderAssistantPlaceholderAsNotice: jest.fn(),
    renderStructuredOutputIfPresent: jest.fn(),
    ...partial,
  };
}

function createOutcome(partial: Partial<LocalStreamOutcome> = {}): LocalStreamOutcome {
  return {
    finalizedTimestamp: Date.now(),
    finalizedModelId: 'claude-sonnet',
    finalizedAssistantMessageId: 'assistant-1',
    finalizedBackendSessionId: 'session-1',
    finalizedStreamingMessageEl: document.createElement('div'),
    streamContentBlocks: [],
    streamedTextContent: '',
    hasStreamContentBlocks: false,
    shouldPersistInterruptedState: false,
    streamErrorNoticeMessage: null,
    interruptedNoticeMessage: null,
    shouldSyncFromServer: false,
    ...partial,
  };
}

describe('finalizeStreamingShell', () => {
  it('returns removed when message element is null', async () => {
    const host = createHost();
    const outcome = createOutcome({ finalizedStreamingMessageEl: null });
    const result = await finalizeStreamingShell({ host, preparedSend: {} as unknown as import("../../../../../src/features/chat/services/MessageSendPreparationService").PreparedMessageSend, outcome });
    expect(result).toBe('removed');
  });

  it('adds timestamp and renders structured output when content blocks exist', async () => {
    const host = createHost();
    const messageEl = document.createElement('div');
    const contentEl = document.createElement('div');
    contentEl.className = 'opencodian-message-content';
    messageEl.appendChild(contentEl);

    const outcome = createOutcome({
      hasStreamContentBlocks: true,
      finalizedStreamingMessageEl: messageEl,
      streamedTextContent: 'Hello',
      structuredOutput: { response: '{"greeting": "hello"}' },
    });

    const result = await finalizeStreamingShell({ host, preparedSend: {} as unknown as import("../../../../../src/features/chat/services/MessageSendPreparationService").PreparedMessageSend, outcome });
    expect(result).toBe('timestamp-added');
    expect(host.addTimestampWithCopyButton).toHaveBeenCalledWith(expect.objectContaining({
      messageEl,
      content: 'Hello',
    }));
    expect(host.renderStructuredOutputIfPresent).toHaveBeenCalledWith(
      messageEl,
      { response: '{"greeting": "hello"}' },
    );
  });

  it('removes the last duplicate text block from the DOM when structured output is present', async () => {
    const host = createHost();
    const messageEl = document.createElement('div');
    const contentEl = document.createElement('div');
    contentEl.className = 'opencodian-message-content';

    const textBlock = document.createElement('div');
    textBlock.className = 'streaming-text-block';
    textBlock.textContent = '{"greeting": "hello"}';
    contentEl.appendChild(textBlock);

    messageEl.appendChild(contentEl);

    const outcome = createOutcome({
      hasStreamContentBlocks: true,
      finalizedStreamingMessageEl: messageEl,
      streamedTextContent: '',
      structuredOutput: { response: '{"greeting": "hello"}' },
    });

    await finalizeStreamingShell({ host, preparedSend: {} as unknown as import("../../../../../src/features/chat/services/MessageSendPreparationService").PreparedMessageSend, outcome });
    expect(contentEl.querySelectorAll('.streaming-text-block').length).toBe(0);
  });

  it('does not remove text blocks that do not match structured output', async () => {
    const host = createHost();
    const messageEl = document.createElement('div');
    const contentEl = document.createElement('div');
    contentEl.className = 'opencodian-message-content';

    const textBlock = document.createElement('div');
    textBlock.className = 'streaming-text-block';
    textBlock.textContent = 'Hello world';
    contentEl.appendChild(textBlock);

    messageEl.appendChild(contentEl);

    const outcome = createOutcome({
      hasStreamContentBlocks: true,
      finalizedStreamingMessageEl: messageEl,
      streamedTextContent: 'Hello world',
      structuredOutput: { response: '{"greeting": "hello"}' },
    });

    await finalizeStreamingShell({ host, preparedSend: {} as unknown as import("../../../../../src/features/chat/services/MessageSendPreparationService").PreparedMessageSend, outcome });
    expect(contentEl.querySelectorAll('.streaming-text-block').length).toBe(1);
    expect(textBlock.textContent).toBe('Hello world');
  });

  it('does not remove text blocks when structured output is undefined', async () => {
    const host = createHost();
    const messageEl = document.createElement('div');
    const contentEl = document.createElement('div');
    contentEl.className = 'opencodian-message-content';

    const textBlock = document.createElement('div');
    textBlock.className = 'streaming-text-block';
    textBlock.textContent = 'Hello world';
    contentEl.appendChild(textBlock);

    messageEl.appendChild(contentEl);

    const outcome = createOutcome({
      hasStreamContentBlocks: true,
      finalizedStreamingMessageEl: messageEl,
      streamedTextContent: 'Hello world',
      structuredOutput: undefined,
    });

    await finalizeStreamingShell({ host, preparedSend: {} as unknown as import("../../../../../src/features/chat/services/MessageSendPreparationService").PreparedMessageSend, outcome });
    expect(contentEl.querySelectorAll('.streaming-text-block').length).toBe(1);
  });

  it('renders error notice when stream ends with an error and no visible blocks', async () => {
    const host = createHost();
    const messageEl = document.createElement('div');
    const errorNotice = {
      id: 'error-1',
      role: 'assistant' as const,
      content: 'Something went wrong',
      timestamp: Date.now(),
      modelId: 'claude-sonnet',
      displayStyle: 'notice' as const,
      noticeTone: 'error' as const,
    };

    const outcome = createOutcome({
      hasStreamContentBlocks: false,
      finalizedStreamingMessageEl: messageEl,
      streamErrorNoticeMessage: errorNotice,
    });

    const result = await finalizeStreamingShell({ host, preparedSend: {} as unknown as import("../../../../../src/features/chat/services/MessageSendPreparationService").PreparedMessageSend, outcome });
    expect(result).toBe('error-notice-rendered');
    expect(host.renderAssistantPlaceholderAsNotice).toHaveBeenCalledWith(
      messageEl,
      errorNotice,
      'render-stream-error-notice',
    );
  });

  it('renders interrupted notice for interrupted streams without content', async () => {
    const host = createHost();
    const messageEl = document.createElement('div');

    const outcome = createOutcome({
      hasStreamContentBlocks: false,
      finalizedStreamingMessageEl: messageEl,
      shouldPersistInterruptedState: true,
      finalizedTimestamp: 1000,
      finalizedModelId: 'claude-sonnet',
    });

    const result = await finalizeStreamingShell({ host, preparedSend: {} as unknown as import("../../../../../src/features/chat/services/MessageSendPreparationService").PreparedMessageSend, outcome });
    expect(result).toBe('interrupted-notice-rendered');
    expect(host.renderAssistantPlaceholderAsNotice).toHaveBeenCalledWith(
      messageEl,
      expect.objectContaining({
        displayStyle: 'notice',
        noticeTone: 'warning',
      }),
      'render-interrupted-notice',
    );
  });

  it('removes the message element when there is no content and no error', async () => {
    const host = createHost();
    const messageEl = document.createElement('div');
    const parent = document.createElement('div');
    parent.appendChild(messageEl);

    const outcome = createOutcome({
      hasStreamContentBlocks: false,
      finalizedStreamingMessageEl: messageEl,
      streamErrorNoticeMessage: null,
      shouldPersistInterruptedState: false,
    });

    const result = await finalizeStreamingShell({ host, preparedSend: {} as unknown as import("../../../../../src/features/chat/services/MessageSendPreparationService").PreparedMessageSend, outcome });
    expect(result).toBe('removed');
    expect(parent.contains(messageEl)).toBe(false);
  });
});

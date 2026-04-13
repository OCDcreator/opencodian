import type { ChatMessage } from '../../../../src/core/types';
import { AssistantShellViewHostAdapter } from '../../../../src/features/chat/runtime/AssistantShellViewHostAdapter';

describe('AssistantShellViewHostAdapter', () => {
  function createAdapter() {
    const turnBody = document.createElement('div');
    const runtime = {
      streamingMessageEl: null as HTMLElement | null,
      streamingContentEl: null as HTMLElement | null,
    };
    const scrollSpy = jest.fn();
    const renderNoticeCard = jest.fn(async (container: HTMLElement, message: ChatMessage) => {
      container.createDiv({
        cls: `opencodian-chat-notice-card is-${message.noticeTone ?? 'info'}`,
        text: `${message.noticeTitle ?? 'Notice'}:${message.content}`,
      });
    });
    const renderPersistedAssistantMessageBody = jest.fn(async (container: HTMLElement, message: ChatMessage) => {
      container.createDiv({
        cls: 'persisted-assistant-body',
        text: message.content,
      });
    });
    const initializeAssistantCopyButton = jest.fn((copyBtn: HTMLElement, content: string) => {
      copyBtn.setText(`copy:${content}`);
    });
    const adapter = new AssistantShellViewHostAdapter({
      getActiveTabId: () => 'tab-1',
      getTabRuntimeState: () => runtime,
      ensureTurnBody: () => turnBody,
      shouldAutoScroll: () => true,
      scheduleSettledScrollToBottomIfNeeded: scrollSpy,
      setStreamingAssistantMessageVisibility: (messageEl, visible) => {
        messageEl.hidden = !visible;
      },
      initializeAssistantCopyButton,
      renderNoticeCard,
      renderPersistedAssistantMessageBody,
    });

    return {
      adapter,
      initializeAssistantCopyButton,
      renderNoticeCard,
      renderPersistedAssistantMessageBody,
      runtime,
      scrollSpy,
      turnBody,
    };
  }

  it('renders notice placeholders through the shared notice host', async () => {
    const { adapter, renderNoticeCard, runtime } = createAdapter();
    const { messageEl } = adapter.createAssistantMessageElement('tab-1', true);
    const noticeMessage: ChatMessage = {
      id: 'assistant-notice-1',
      role: 'assistant',
      content: 'Network error',
      timestamp: 12345,
      modelId: 'anthropic/claude-sonnet-4',
      displayStyle: 'notice',
      noticeTitle: 'Stream error',
      noticeTone: 'error',
    };

    await adapter.renderAssistantPlaceholderAsNotice({
      messageEl,
      noticeMessage,
      reason: 'unit-test-notice',
    });

    expect(renderNoticeCard).toHaveBeenCalledWith(expect.any(HTMLElement), noticeMessage);
    expect(messageEl.hidden).toBe(false);
    expect(messageEl.dataset.messageId).toBe('assistant-notice-1');
    expect(messageEl.classList.contains('opencodian-message--notice')).toBe(true);
    expect(messageEl.querySelector('.opencodian-message-time-row')?.textContent).toContain('claude-sonnet-4');
    expect(runtime.streamingMessageEl).toBe(messageEl);
  });

  it('creates and renders persisted notices through the shared notice host', async () => {
    const { adapter, renderNoticeCard, turnBody } = createAdapter();
    const noticeMessage: ChatMessage = {
      id: 'assistant-notice-persisted-1',
      role: 'assistant',
      content: 'Model unavailable',
      timestamp: 22345,
      modelId: 'openai/gpt-5.4',
      sourceMessageId: 'source-1',
      displayStyle: 'notice',
      noticeTitle: 'Need setup',
      noticeTone: 'warning',
    };

    const messageEl = await adapter.renderPersistedAssistantNoticeMessage({
      noticeMessage,
    });

    expect(renderNoticeCard).toHaveBeenCalledWith(expect.any(HTMLElement), noticeMessage);
    expect(turnBody.contains(messageEl)).toBe(true);
    expect(messageEl.dataset.messageId).toBe('assistant-notice-persisted-1');
    expect(messageEl.dataset.sourceMessageId).toBe('source-1');
    expect(messageEl.classList.contains('opencodian-message--assistant')).toBe(true);
    expect(messageEl.classList.contains('opencodian-message--notice')).toBe(true);
    expect(messageEl.querySelector('.opencodian-chat-notice-card')).not.toBeNull();
    expect(messageEl.querySelector('.opencodian-message-time-row')?.textContent).toContain('gpt-5.4');
  });

  it('renders persisted assistant messages through the shared body and footer helpers', async () => {
    const { adapter, renderPersistedAssistantMessageBody, initializeAssistantCopyButton, turnBody } = createAdapter();
    const message: ChatMessage = {
      id: 'assistant-persisted-1',
      role: 'assistant',
      content: 'Persisted assistant answer',
      timestamp: 32345,
      modelId: 'openai/gpt-5.4',
    };

    const messageEl = await adapter.renderPersistedAssistantMessage({ message });

    expect(turnBody.contains(messageEl)).toBe(true);
    expect(messageEl.dataset.messageId).toBe('assistant-persisted-1');
    expect(renderPersistedAssistantMessageBody).toHaveBeenCalledWith(
      expect.any(HTMLElement),
      message,
    );
    expect(messageEl.querySelector('.persisted-assistant-body')?.textContent).toBe('Persisted assistant answer');
    expect(initializeAssistantCopyButton).toHaveBeenCalledWith(
      expect.any(HTMLElement),
      'Persisted assistant answer',
    );
    expect(messageEl.querySelector('.opencodian-message-time-row')?.textContent).toContain('gpt-5.4');
  });

  it('finalizes persisted assistant footers through the shared shell renderer', () => {
    const { adapter, initializeAssistantCopyButton, scrollSpy, turnBody } = createAdapter();
    const { messageEl } = adapter.createAssistantMessageElement('tab-1', true);
    const message: ChatMessage = {
      id: 'assistant-1',
      role: 'assistant',
      content: 'Fallback content',
      timestamp: 23456,
      modelId: 'anthropic/claude-sonnet-4',
      streamState: 'interrupted',
      contentBlocks: [
        { type: 'thinking', thinking: 'Hidden reasoning' },
        { type: 'text', text: ' Visible answer ' },
      ],
    };

    adapter.finalizePersistedFooter(messageEl, message);

    expect(messageEl.hidden).toBe(false);
    expect(turnBody.contains(messageEl)).toBe(true);
    expect(scrollSpy).not.toHaveBeenCalled();
    expect(initializeAssistantCopyButton).toHaveBeenCalledWith(
      expect.any(HTMLElement),
      'Visible answer',
    );
    expect(messageEl.querySelector('.opencodian-message-time-status')?.textContent).toBe('Interrupted');
  });

  it('finalizes pseudo-stream assistant footers through the shared shell renderer', () => {
    const { adapter, initializeAssistantCopyButton, turnBody } = createAdapter();
    const { messageEl } = adapter.createAssistantMessageElement('tab-1', true);

    adapter.finalizePseudoStreamFooter(messageEl, {
      content: 'Reveal me',
      timestamp: 34567,
      modelId: 'openai/gpt-5.4',
    });

    expect(messageEl.hidden).toBe(false);
    expect(turnBody.contains(messageEl)).toBe(true);
    expect(initializeAssistantCopyButton).toHaveBeenCalledWith(
      expect.any(HTMLElement),
      'Reveal me',
    );
    expect(messageEl.querySelector('.opencodian-message-time-row')?.textContent).toContain('gpt-5.4');
  });

  it('renders local stream errors through the shared assistant error helper', () => {
    const { adapter, initializeAssistantCopyButton, turnBody } = createAdapter();
    const { messageEl, contentEl } = adapter.createAssistantMessageElement('tab-1', true);

    adapter.renderStreamError({
      messageEl,
      contentEl,
      content: 'Server unavailable',
      timestamp: 45678,
      modelId: 'anthropic/claude-sonnet-4',
    });

    expect(turnBody.contains(messageEl)).toBe(true);
    expect(messageEl.hidden).toBe(false);
    expect(contentEl.querySelector('.streaming-error-block')).not.toBeNull();
    expect(contentEl.querySelector('.streaming-error-icon')?.textContent).toBe('❌');
    expect(contentEl.querySelector('.streaming-error-text')?.textContent).toBe('Server unavailable');
    expect(initializeAssistantCopyButton).toHaveBeenCalledWith(
      expect.any(HTMLElement),
      'Server unavailable',
    );
    expect(messageEl.querySelector('.opencodian-message-time-row')?.textContent).toContain('claude-sonnet-4');
  });
});

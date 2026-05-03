import type { ChatMessage } from '../../../../src/core/types';
import { AssistantShellViewHostAdapter } from '../../../../src/features/chat/runtime/AssistantShellViewHostAdapter';
import type { MarkdownRenderService } from '../../../../src/utils/markdown';

function createMockMarkdownService() {
  return {
    render: jest.fn(async (el: HTMLElement, markdown: string) => {
      el.createDiv({ cls: 'opencodian-message-text', text: markdown });
    }),
  } as unknown as MarkdownRenderService;
}

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
    const markdownService = createMockMarkdownService();
    const getMarkdownService = jest.fn(() => markdownService);
    const shouldRenderQuestionResolutionCards = jest.fn(() => false);
    const suppressActiveLayoutAutoScrollOnce = jest.fn();
    const openTaskToolSession = jest.fn();
    const adapter = new AssistantShellViewHostAdapter(
      {
        getActiveTabId: () => 'tab-1',
        getTabRuntimeState: () => runtime,
        ensureTurnBody: () => turnBody,
        shouldAutoScroll: () => true,
        scheduleSettledScrollToBottomIfNeeded: scrollSpy,
        setStreamingAssistantMessageVisibility: (messageEl, visible) => {
          messageEl.hidden = !visible;
        },
        renderNoticeCard,
        getMarkdownService,
        shouldRenderQuestionResolutionCards,
        suppressActiveLayoutAutoScrollOnce,
      },
      openTaskToolSession,
    );

    return {
      adapter,
      markdownService,
      renderNoticeCard,
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
    const { adapter, markdownService, turnBody } = createAdapter();
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
    expect(markdownService.render).toHaveBeenCalledWith(
      expect.any(HTMLElement),
      'Persisted assistant answer',
    );
    expect(messageEl.querySelector('.opencodian-message-time-row')?.textContent).toContain('gpt-5.4');
  });

  it('finalizes persisted assistant footers through the shared shell renderer', () => {
    const { adapter, scrollSpy, turnBody } = createAdapter();
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
    expect(messageEl.querySelector('.opencodian-message-time-status')?.textContent).toBe('Interrupted');
  });

  it('finalizes pseudo-stream assistant footers through the shared shell renderer', () => {
    const { adapter, turnBody } = createAdapter();
    const { messageEl } = adapter.createAssistantMessageElement('tab-1', true);

    adapter.finalizePseudoStreamFooter(messageEl, {
      content: 'Reveal me',
      timestamp: 34567,
      modelId: 'openai/gpt-5.4',
    });

    expect(messageEl.hidden).toBe(false);
    expect(turnBody.contains(messageEl)).toBe(true);
    expect(messageEl.querySelector('.opencodian-message-time-row')?.textContent).toContain('gpt-5.4');
  });

  it('renders local stream errors through the shared assistant error helper', () => {
    const { adapter, turnBody } = createAdapter();
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
    expect(messageEl.querySelector('.opencodian-message-time-row')?.textContent).toContain('claude-sonnet-4');
  });
});

describe('AssistantShellViewHostAdapter shell lifecycle', () => {
  function createAdapter() {
    const turnBody = document.createElement('div');
    const adapter = new AssistantShellViewHostAdapter(
      {
        getActiveTabId: () => 'tab-1',
        getTabRuntimeState: () => ({ streamingMessageEl: null, streamingContentEl: null }),
        ensureTurnBody: () => turnBody,
        shouldAutoScroll: () => true,
        scheduleSettledScrollToBottomIfNeeded: jest.fn(),
        setStreamingAssistantMessageVisibility: jest.fn(),
        renderNoticeCard: jest.fn(),
        getMarkdownService: () => null,
        shouldRenderQuestionResolutionCards: () => false,
        suppressActiveLayoutAutoScrollOnce: jest.fn(),
      },
      jest.fn(),
    );
    return { adapter, turnBody };
  }

  it('creates a simple assistant container without streaming state', () => {
    const { adapter, turnBody } = createAdapter();
    const result = adapter.createAssistantShellContainer('tab-1');

    expect(turnBody.contains(result.messageEl)).toBe(true);
    expect(result.messageEl.classList.contains('opencodian-message--assistant')).toBe(true);
    expect(result.messageEl.querySelector('.opencodian-message-content')).toBe(result.contentEl);
  });

  it('returns fallback when turn body is null', () => {
    const adapter = new AssistantShellViewHostAdapter(
      {
        getActiveTabId: () => 'tab-1',
        getTabRuntimeState: () => ({ streamingMessageEl: null, streamingContentEl: null }),
        ensureTurnBody: () => null,
        shouldAutoScroll: () => false,
        scheduleSettledScrollToBottomIfNeeded: jest.fn(),
        setStreamingAssistantMessageVisibility: jest.fn(),
        renderNoticeCard: jest.fn(),
        getMarkdownService: () => null,
        shouldRenderQuestionResolutionCards: () => false,
        suppressActiveLayoutAutoScrollOnce: jest.fn(),
      },
      jest.fn(),
    );

    const result = adapter.createAssistantShellContainer('tab-1');
    expect(result.messageEl.isConnected).toBe(false);
  });

  it('toggles visibility and calls callback when changed', () => {
    const { adapter } = createAdapter();
    const el = document.createElement('div');
    el.hidden = false;
    const spy = jest.fn();

    adapter.setStreamingAssistantMessageVisibility(el, false, 'test-reason', spy);

    expect(el.hidden).toBe(true);
    expect(spy).toHaveBeenCalledWith({
      reason: 'test-reason',
      messageId: null,
      sourceMessageId: null,
      hidden: true,
      hasStreamingClass: false,
    });
  });

  it('does not call callback when visibility did not change', () => {
    const { adapter } = createAdapter();
    const el = document.createElement('div');
    el.hidden = true;
    const spy = jest.fn();

    adapter.setStreamingAssistantMessageVisibility(el, false, 'test', spy);

    expect(el.hidden).toBe(true);
    expect(spy).not.toHaveBeenCalled();
  });
});

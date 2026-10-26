import { AssistantShellRenderer } from '../../../../src/features/chat/runtime/rendering/AssistantShellRenderer';
import { PermissionInlineCardRenderer } from '../../../../src/features/chat/runtime/rendering/PermissionInlineCardRenderer';
import { StreamingInlineCardRenderer } from '../../../../src/features/chat/runtime/rendering/StreamingInlineCardRenderer';

describe('OpenCodianView streaming assistant shell visibility', () => {
  it('shows a friendly recorded model name while retaining the exact reference for keyboard inspection', () => {
    const modelId = 'deepseek-official/["deepseek-official","deepseek-flash"]';
    const renderer = new AssistantShellRenderer({
      getModelDisplayName: () => 'DeepSeek-V4.1-Flash',
      getActiveTabId: () => 'tab-1', getTabRuntimeState: () => null,
      ensureTurnBody: () => null, shouldAutoScroll: () => false,
      scheduleSettledScrollToBottomIfNeeded: jest.fn(), setStreamingAssistantMessageVisibility: jest.fn(),
    });
    const messageEl = document.createElement('div');
    renderer.addTimestampWithCopyButton({ messageEl, timestamp: 1, modelId });
    const label = messageEl.querySelector<HTMLElement>('.opencodian-message-model-id')!;
    expect(label.firstChild?.textContent).toBe('· DeepSeek-V4.1-Flash');
    expect(label.dataset.modelId).toBe(modelId);
    expect(label.getAttribute('data-tooltip')).toContain(modelId);
    expect(label.tabIndex).toBe(0);
    const nameId = label.getAttribute('aria-labelledby');
    expect(label.querySelector(`#${nameId}`)?.textContent).toContain(modelId);
  });

  it('keeps deferred streaming assistant shells hidden until reveal is requested', () => {
    const turnBody = document.createElement('div');
    const runtime = {
      streamingMessageEl: null as HTMLElement | null,
      streamingContentEl: null as HTMLElement | null,
    };
    const scrollSpy = jest.fn();
    const renderer = new AssistantShellRenderer({
      getActiveTabId: () => 'tab-1',
      getTabRuntimeState: () => runtime,
      ensureTurnBody: () => turnBody,
      shouldAutoScroll: () => true,
      scheduleSettledScrollToBottomIfNeeded: scrollSpy,
      setStreamingAssistantMessageVisibility: (messageEl, visible) => {
        messageEl.hidden = !visible;
      },
      initializeAssistantCopyButton: jest.fn(),
    });

    const { messageEl, contentEl } = renderer.createAssistantMessageElement('tab-1', true);

    expect(messageEl.hidden).toBe(true);
    expect(turnBody.contains(messageEl)).toBe(true);
    expect(runtime.streamingMessageEl).toBe(messageEl);
    expect(runtime.streamingContentEl).toBe(contentEl);

    const revealed = renderer.revealStreamingAssistantMessageElement('tab-1');

    expect(revealed).toBe(messageEl);
    expect(messageEl.hidden).toBe(false);
    expect(scrollSpy).toHaveBeenCalledWith(true, 'tab-1');
  });

  it('reveals a hidden streaming shell when adding an inline card', () => {
    const messageEl = document.createElement('div');
    messageEl.hidden = true;
    const contentEl = messageEl.createDiv({ cls: 'opencodian-message-content' });
    const toolCallEl = messageEl.createDiv({ cls: 'streaming-tool-call' });
    const revealSpy = jest.fn(() => {
      messageEl.hidden = false;
      return messageEl;
    });
    const renderer = new StreamingInlineCardRenderer({
      getActiveTabId: () => 'tab-1',
      getTabRuntimeState: () => ({ streamingMessageEl: messageEl }),
      revealStreamingAssistantMessageElement: revealSpy,
    });

    const cardEl = renderer.createStreamingInlineCard('opencodian-question-inline', 'tab-1');

    expect(cardEl).not.toBeNull();
    expect(messageEl.hidden).toBe(false);
    expect(toolCallEl.nextSibling).toBe(cardEl);
    expect(contentEl.contains(cardEl)).toBe(false);
    expect(revealSpy).toHaveBeenCalledWith('tab-1');
  });

  it('renders a permission inline card and resolves the clicked action', async () => {
    const messageEl = document.createElement('div');
    messageEl.hidden = true;
    const contentEl = messageEl.createDiv({ cls: 'opencodian-message-content' });
    const toolCallEl = messageEl.createDiv({ cls: 'streaming-tool-call' });
    const inlineCardRenderer = new StreamingInlineCardRenderer({
      getActiveTabId: () => 'tab-1',
      getTabRuntimeState: () => ({ streamingMessageEl: messageEl }),
      revealStreamingAssistantMessageElement: () => {
        messageEl.hidden = false;
        return messageEl;
      },
    });
    const permissionRenderer = new PermissionInlineCardRenderer(inlineCardRenderer);

    const responsePromise = permissionRenderer.collectResponse(
      {
        type: 'permission_request',
        id: 'perm-1',
        permission: 'websearch_web_search',
        patterns: ['src/**'],
        metadata: { command: 'npm test' },
        always: ['src/**'],
      },
      'tab-1',
    );

    const permissionCard = toolCallEl.nextElementSibling as HTMLElement | null;
    expect(permissionCard).not.toBeNull();
    expect(messageEl.hidden).toBe(false);
    expect(contentEl.contains(permissionCard!)).toBe(false);
    expect(permissionCard?.querySelector('.opencodian-permission-inline-title')).not.toBeNull();
    expect(permissionCard?.querySelector('.opencodian-permission-inline-tool')?.textContent).toContain('websearch_web_search');
    expect(permissionCard?.querySelectorAll('.opencodian-permission-inline-pattern-item')).toHaveLength(1);
    expect(permissionCard?.querySelector('code')?.textContent).toBe('npm test');

    (permissionCard?.querySelector('.opencodian-permission-inline-always') as HTMLButtonElement).click();

    await expect(responsePromise).resolves.toBe('always');
    expect(permissionCard?.isConnected).toBe(false);
  });

  it('shows a terminal permission card when the original native ask expires', async () => {
    jest.useFakeTimers();
    try {
      const messageEl = document.createElement('div');
      const inlineCardRenderer = new StreamingInlineCardRenderer({
        getActiveTabId: () => 'tab-1',
        getTabRuntimeState: () => ({ streamingMessageEl: messageEl }),
        revealStreamingAssistantMessageElement: () => messageEl,
      });
      const renderer = new PermissionInlineCardRenderer(inlineCardRenderer);
      const respond = jest.fn(async () => {});
      const result = renderer.collectAndRespond({
        type: 'permission_request', id: 'perm-timeout', sessionID: 'sess-a', permission: 'Write',
        patterns: [], metadata: {}, always: [],
      }, 'tab-1', respond, async () => false);

      jest.advanceTimersByTime(500);
      await expect(result).resolves.toBe(true);
      expect(messageEl.querySelector('[data-permission-card]')?.getAttribute('data-state')).toBe('terminal');
      expect(messageEl.querySelector('[data-permission-action]')).toBeNull();
      expect(respond).not.toHaveBeenCalled();
    } finally {
      jest.useRealTimers();
    }
  });
});

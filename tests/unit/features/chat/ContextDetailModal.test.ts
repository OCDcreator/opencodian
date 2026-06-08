import type { App } from 'obsidian';

import { type Conversation, createEmptyTabContextState } from '../../../../src/core/types';
import { ContextDetailModal } from '../../../../src/features/chat/ui/ContextDetailModal';
import { setLocale } from '../../../../src/i18n';

describe('ContextDetailModal', () => {
  beforeEach(() => {
    document.body.innerHTML = '';
    setLocale('zh');
  });

  afterEach(() => {
    document.body.innerHTML = '';
  });

  it('adds a dedicated modal class so the width can exceed the default Obsidian shell', () => {
    const contextState = {
      ...createEmptyTabContextState(),
      estimatedInputTokens: 2048,
      estimatedOutputTokens: 256,
      contextWindow: 128000,
      percentage: 2,
      provider: 'openai',
      providerName: 'OpenAI',
      model: 'gpt-5.4',
      modelName: 'GPT-5.4',
      sessionTitle: 'Context width regression',
      createdAt: 1710000000000,
      updatedAt: 1710000300000,
    };
    const conversation: Conversation = {
      id: 'conversation-1',
      title: 'Context width regression',
      createdAt: 1710000000000,
      updatedAt: 1710000300000,
      openCodeSessionId: 'session-1',
      messages: [
        {
          id: 'message-1',
          role: 'user',
          content: 'hello',
          timestamp: 1710000000000,
        },
      ],
    };

    const modal = new ContextDetailModal({} as App, {
      conversation,
      contextState,
      systemPrompt: 'system prompt',
      rawMessageLoader: async () => [],
    });

    modal.onOpen();

    expect(modal.modalEl.classList.contains('opencodian-context-detail-modal')).toBe(true);
    expect(modal.contentEl.classList.contains('opencodian-context-detail-modal-content')).toBe(true);
    expect(modal.contentEl.querySelector('h2')?.textContent).toBe('上下文使用详情');
    expect(modal.contentEl.querySelector('.opencodian-context-modal-grid')).not.toBeNull();

    modal.onClose();

    expect(modal.modalEl.classList.contains('opencodian-context-detail-modal')).toBe(false);
    expect(modal.contentEl.classList.contains('opencodian-context-detail-modal-content')).toBe(false);
  });

  it('renders raw messages from generic backend loader', async () => {
    const { contextState, conversation } = createValidContext();

    const loadedItems = [
      { id: 'msg-1', role: 'user', createdAt: 1710000000000, payload: JSON.stringify({ role: 'user', content: 'hello generic' }, null, 2) },
      { id: 'msg-2', role: 'assistant', createdAt: 1710000100000, payload: JSON.stringify({ role: 'assistant', content: 'hi there' }, null, 2) },
    ];
    let resolveLoader: (items: typeof loadedItems) => void;
    const loaderPromise = new Promise<typeof loadedItems>((resolve) => {
      resolveLoader = resolve;
    });

    const modal = new ContextDetailModal({} as App, {
      conversation,
      contextState,
      rawMessageLoader: () => loaderPromise,
    });

    modal.onOpen();
    resolveLoader!(loadedItems);
    await Promise.resolve();
    await Promise.resolve();

    const bodyEl = modal.contentEl.querySelector('.opencodian-context-raw-messages-body');
    expect(bodyEl).not.toBeNull();

    const details = bodyEl!.querySelectorAll('details.opencodian-context-raw-message');
    expect(details.length).toBe(2);

    expect(details[0].querySelector('summary')?.textContent).toContain('user');
    expect(details[0].querySelector('summary')?.textContent).toContain('msg-1');
    expect(details[0].querySelector('code')?.textContent).toContain('hello generic');

    expect(details[1].querySelector('summary')?.textContent).toContain('assistant');
    expect(details[1].querySelector('summary')?.textContent).toContain('msg-2');
    expect(details[1].querySelector('code')?.textContent).toContain('hi there');

    modal.onClose();
  });

  it('renders raw messages from Claude-shaped backend loader with content blocks', async () => {
    const { contextState, conversation } = createValidContext();

    const loadedItems = [
      { id: 'cm-1', role: 'user', createdAt: 1710000000000, payload: JSON.stringify({ role: 'user', content: 'claude prompt' }, null, 2) },
      { id: 'cm-2', role: 'assistant', createdAt: 1710000100000, payload: JSON.stringify({ role: 'assistant', content: [{ type: 'text', text: 'claude reply' }] }, null, 2) },
    ];
    let resolveLoader: (items: typeof loadedItems) => void;
    const loaderPromise = new Promise<typeof loadedItems>((resolve) => {
      resolveLoader = resolve;
    });

    const modal = new ContextDetailModal({} as App, {
      conversation,
      contextState,
      rawMessageLoader: () => loaderPromise,
    });

    modal.onOpen();
    resolveLoader!(loadedItems);
    await Promise.resolve();
    await Promise.resolve();

    const bodyEl = modal.contentEl.querySelector('.opencodian-context-raw-messages-body');
    expect(bodyEl).not.toBeNull();

    const details = bodyEl!.querySelectorAll('details.opencodian-context-raw-message');
    expect(details.length).toBe(2);

    expect(details[0].querySelector('code')?.textContent).toContain('claude prompt');
    expect(details[1].querySelector('code')?.textContent).toContain('claude reply');

    modal.onClose();
  });

  it('renders raw messages from OpenCode backend loader', async () => {
    const { contextState, conversation } = createValidContext();

    const loadedItems = [
      { id: 'oc-1', role: 'user', createdAt: 1710000000000, payload: JSON.stringify({ message: { id: 'oc-1', role: 'user' }, parts: [{ type: 'text', text: 'opencode user' }] }, null, 2) },
      { id: 'oc-2', role: 'assistant', createdAt: 1710000100000, payload: JSON.stringify({ message: { id: 'oc-2', role: 'assistant' }, parts: [{ type: 'text', text: 'opencode assistant' }] }, null, 2) },
    ];
    let resolveLoader: (items: typeof loadedItems) => void;
    const loaderPromise = new Promise<typeof loadedItems>((resolve) => {
      resolveLoader = resolve;
    });

    const modal = new ContextDetailModal({} as App, {
      conversation,
      contextState,
      rawMessageLoader: () => loaderPromise,
    });

    modal.onOpen();
    resolveLoader!(loadedItems);
    await Promise.resolve();
    await Promise.resolve();

    const bodyEl = modal.contentEl.querySelector('.opencodian-context-raw-messages-body');
    expect(bodyEl).not.toBeNull();

    const details = bodyEl!.querySelectorAll('details.opencodian-context-raw-message');
    expect(details.length).toBe(2);

    expect(details[0].querySelector('code')?.textContent).toContain('opencode user');
    expect(details[1].querySelector('code')?.textContent).toContain('opencode assistant');

    modal.onClose();
  });

  it('shows empty state when raw message loader returns empty array', async () => {
    const { contextState, conversation } = createValidContext();

    let resolveLoader: (items: never[]) => void;
    const loaderPromise = new Promise<never[]>((resolve) => {
      resolveLoader = resolve;
    });

    const modal = new ContextDetailModal({} as App, {
      conversation,
      contextState,
      rawMessageLoader: () => loaderPromise,
    });

    modal.onOpen();
    resolveLoader!([]);
    await Promise.resolve();
    await Promise.resolve();

    const bodyEl = modal.contentEl.querySelector('.opencodian-context-raw-messages-body');
    expect(bodyEl).not.toBeNull();

    const stateEl = bodyEl!.querySelector('.opencodian-context-raw-messages-state.is-empty');
    expect(stateEl).not.toBeNull();
    expect(stateEl!.textContent).toBe('当前没有可显示的原始消息。');

    modal.onClose();
  });

  it('shows error state when raw message loader throws', async () => {
    const { contextState, conversation } = createValidContext();

    let rejectLoader: (err: Error) => void;
    const loaderPromise = new Promise<never[]>((_, reject) => {
      rejectLoader = reject;
    });

    const modal = new ContextDetailModal({} as App, {
      conversation,
      contextState,
      rawMessageLoader: () => loaderPromise,
    });

    modal.onOpen();
    rejectLoader!(new Error('backend fetch failed'));
    await Promise.resolve();
    await Promise.resolve();

    const bodyEl = modal.contentEl.querySelector('.opencodian-context-raw-messages-body');
    expect(bodyEl).not.toBeNull();

    const stateEl = bodyEl!.querySelector('.opencodian-context-raw-messages-state.is-error');
    expect(stateEl).not.toBeNull();
    expect(stateEl!.textContent).toBe('加载原始消息失败。');

    modal.onClose();
  });
});

function createValidContext() {
  const contextState = {
    ...createEmptyTabContextState(),
    estimatedInputTokens: 2048,
    estimatedOutputTokens: 256,
    contextWindow: 128000,
    percentage: 2,
    provider: 'openai',
    providerName: 'OpenAI',
    model: 'gpt-5.4',
    modelName: 'GPT-5.4',
  };
  const conversation: Conversation = {
    id: 'conversation-1',
    title: 'Context width regression',
    createdAt: 1710000000000,
    updatedAt: 1710000300000,
    openCodeSessionId: 'session-1',
    messages: [
      {
        id: 'message-1',
        role: 'user',
        content: 'hello',
        timestamp: 1710000000000,
      },
    ],
  };
  return { contextState, conversation };
}

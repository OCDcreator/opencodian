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
});

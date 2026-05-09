import type { ChatMessage } from '../../../../src/core/types';
import {
  UserMessageFooterRenderer,
  type UserMessageFooterRendererHost,
} from '../../../../src/features/chat/runtime/UserMessageFooterRenderer';
import { setLocale, t } from '../../../../src/i18n';

describe('UserMessageFooterRenderer', () => {
  function createRenderer(isStreaming = false) {
    const host: UserMessageFooterRendererHost = {
      isStreaming: jest.fn(() => isStreaming),
      handleRewindRequest: jest.fn(),
      handleForkRequest: jest.fn(),
    };

    return {
      host,
      renderer: new UserMessageFooterRenderer(host),
    };
  }

  it('renders copy, rewind, and fork controls', () => {
    const { host, renderer } = createRenderer();
    const container = document.createElement('div');
    const message: ChatMessage = {
      id: 'user-1',
      role: 'user',
      content: 'Hello',
      timestamp: new Date('2026-04-13T10:15:00Z').getTime(),
      sourceMessageId: 'source-1',
    };

    renderer.render(container, message, 'Visible copy content');

    const copyBtn = container.querySelector<HTMLElement>('.opencodian-copy-btn-inline--user');
    const actionButtons = container.querySelectorAll<HTMLButtonElement>('.opencodian-user-action-btn');
    const rewindBtn = actionButtons[0];
    const forkBtn = actionButtons[1];

    expect(copyBtn).not.toBeNull();
    expect(copyBtn?.querySelector('svg')).not.toBeNull();
    expect(rewindBtn.disabled).toBe(false);
    expect(forkBtn.disabled).toBe(false);
    expect(rewindBtn.querySelectorAll('path')[1]?.getAttribute('d')).toBe(
      'M4 9h10.5a5.5 5.5 0 0 1 5.5 5.5v0a5.5 5.5 0 0 1-5.5 5.5H11',
    );

    rewindBtn.click();
    forkBtn.click();

    expect(host.handleRewindRequest).toHaveBeenCalledWith(message);
    expect(host.handleForkRequest).toHaveBeenCalledWith(message);
    expect(container.querySelector('.opencodian-message-time-text')?.textContent).toBe(
      new Date(message.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
    );
  });

  it('keeps rewind and fork disabled while the active tab is streaming', () => {
    const { renderer } = createRenderer(true);
    const container = document.createElement('div');
    const message: ChatMessage = {
      id: 'user-2',
      role: 'user',
      content: 'Hello',
      timestamp: 123,
      sourceMessageId: 'source-2',
    };

    renderer.render(container, message);

    const actionButtons = container.querySelectorAll<HTMLButtonElement>('.opencodian-user-action-btn');

    expect(actionButtons).toHaveLength(2);
    actionButtons.forEach((button) => {
      expect(button.disabled).toBe(true);
    });
    expect(container.querySelector('.opencodian-copy-btn-inline--user')).toBeNull();
  });

  it('refreshes existing tooltip labels after locale changes', () => {
    const { renderer } = createRenderer();
    const container = document.createElement('div');
    const message: ChatMessage = {
      id: 'user-3',
      role: 'user',
      content: 'Hello',
      timestamp: 456,
      sourceMessageId: 'source-3',
    };

    setLocale('en');
    renderer.render(container, message, 'Copy me');

    const copyBtn = container.querySelector<HTMLElement>('.opencodian-copy-btn-inline--user');
    expect(copyBtn?.getAttribute('data-tooltip')).toBe(t('chat.action.copy'));

    setLocale('zh');
    UserMessageFooterRenderer.refreshTooltips(container);

    expect(copyBtn?.getAttribute('data-tooltip')).toBe(t('chat.action.copy'));
    expect(
      copyBtn?.querySelector<HTMLElement>('.opencodian-visually-hidden[data-tooltip-label="true"]')
        ?.textContent,
    ).toBe(t('chat.action.copy'));
    setLocale('en');
  });
});

import type { ChatMessage } from '../../../../../src/core/types';
import {
  UserMessageFooterRenderer,
  type UserMessageFooterRendererHost,
} from '../../../../../src/features/chat/runtime/UserMessageFooterRenderer';

describe('UserMessageFooterRenderer', () => {
  function createHost(partial: Partial<UserMessageFooterRendererHost> = {}): UserMessageFooterRendererHost {
    return {
      isStreaming: () => false,
      hasForkCapability: () => true,
      hasRewindCapability: () => true,
      handleRewindRequest: jest.fn(),
      handleForkRequest: jest.fn(),
      ...partial,
    };
  }

  function createMessage(partial: Partial<ChatMessage> = {}): ChatMessage {
    return {
      id: 'msg-1',
      role: 'user',
      content: 'Hello',
      timestamp: Date.now(),
      sourceMessageId: 'src-1',
      ...partial,
    } as ChatMessage;
  }

  it('renders both fork and rewind buttons when both capabilities are present and message has sourceMessageId', () => {
    const host = createHost();
    const renderer = new UserMessageFooterRenderer(host);
    const container = document.createElement('div');
    const messageEl = document.createElement('div');
    container.appendChild(messageEl);

    renderer.render(messageEl, createMessage(), 'copy content');

    const buttons = messageEl.querySelectorAll('button');
    expect(buttons.length).toBe(3); // copy + rewind + fork
  });

  it('renders only fork button when rewind capability is absent', () => {
    const host = createHost({ hasRewindCapability: () => false });
    const renderer = new UserMessageFooterRenderer(host);
    const container = document.createElement('div');
    const messageEl = document.createElement('div');
    container.appendChild(messageEl);

    renderer.render(messageEl, createMessage());

    const buttons = messageEl.querySelectorAll('button');
    expect(buttons.length).toBe(1);
    expect(buttons[0].getAttribute('data-tooltip')).toBe('Fork');
  });

  it('renders only rewind button when fork capability is absent', () => {
    const host = createHost({ hasForkCapability: () => false });
    const renderer = new UserMessageFooterRenderer(host);
    const container = document.createElement('div');
    const messageEl = document.createElement('div');
    container.appendChild(messageEl);

    renderer.render(messageEl, createMessage());

    const buttons = messageEl.querySelectorAll('button');
    expect(buttons.length).toBe(1);
    expect(buttons[0].getAttribute('data-tooltip')).toBe('Rewind');
  });

  it('renders no branching buttons when message lacks sourceMessageId', () => {
    const host = createHost();
    const renderer = new UserMessageFooterRenderer(host);
    const container = document.createElement('div');
    const messageEl = document.createElement('div');
    container.appendChild(messageEl);

    renderer.render(messageEl, createMessage({ sourceMessageId: undefined }));

    const buttons = messageEl.querySelectorAll('button');
    expect(buttons.length).toBe(0);
  });

  it('disables action buttons when streaming', () => {
    const host = createHost({ isStreaming: () => true });
    const renderer = new UserMessageFooterRenderer(host);
    const container = document.createElement('div');
    const messageEl = document.createElement('div');
    container.appendChild(messageEl);

    renderer.render(messageEl, createMessage());

    const buttons = messageEl.querySelectorAll('button');
    const actionButtons = Array.from(buttons).filter((btn) =>
      btn.classList.contains('opencodian-user-action-btn--icon'),
    );
    for (const btn of actionButtons) {
      expect(btn.disabled).toBe(true);
    }
  });

  it('calls handleForkRequest when fork button is clicked', () => {
    const host = createHost();
    const renderer = new UserMessageFooterRenderer(host);
    const container = document.createElement('div');
    const messageEl = document.createElement('div');
    container.appendChild(messageEl);

    const message = createMessage();
    renderer.render(messageEl, message);

    const forkButton = Array.from(messageEl.querySelectorAll('button')).find(
      (btn) => btn.getAttribute('data-tooltip') === 'Fork',
    );
    expect(forkButton).toBeDefined();
    forkButton!.click();
    expect(host.handleForkRequest).toHaveBeenCalledWith(message);
  });

  it('calls handleRewindRequest when rewind button is clicked', () => {
    const host = createHost();
    const renderer = new UserMessageFooterRenderer(host);
    const container = document.createElement('div');
    const messageEl = document.createElement('div');
    container.appendChild(messageEl);

    const message = createMessage();
    renderer.render(messageEl, message);

    const rewindButton = Array.from(messageEl.querySelectorAll('button')).find(
      (btn) => btn.getAttribute('data-tooltip') === 'Rewind',
    );
    expect(rewindButton).toBeDefined();
    rewindButton!.click();
    expect(host.handleRewindRequest).toHaveBeenCalledWith(message);
  });
});

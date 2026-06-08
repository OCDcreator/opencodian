import type { AgentBackendKind } from '../../../../src/core/types/chat';
import {
  ConversationHistoryActionsCoordinator,
  type ConversationHistoryActionsHost,
} from '../../../../src/features/chat/services/ConversationHistoryActionsCoordinator';
import { t } from '../../../../src/i18n';

function createConversation(
  id: string,
  title = `Chat ${id}`,
  titleGenerationStatus: 'pending' | 'success' | 'failed' = 'success',
  backend: AgentBackendKind = 'opencode',
) {
  return {
    id,
    title,
    createdAt: 1,
    updatedAt: 1,
    backend,
    openCodeSessionId: `${id}-session`,
    titleGenerationStatus,
    messages: [],
  };
}

type MockedConversationHistoryActionsHost = {
  [Key in keyof ConversationHistoryActionsHost]:
    ConversationHistoryActionsHost[Key] extends (...args: infer Args) => infer Result
      ? jest.Mock<Result, Args>
      : ConversationHistoryActionsHost[Key];
};

function createHost(
  conversations: ReturnType<typeof createConversation>[],
  overrides: Partial<MockedConversationHistoryActionsHost> = {},
): MockedConversationHistoryActionsHost {
  return {
    getConversations: jest.fn(() => conversations),
    getCurrentConversation: jest.fn(() => conversations[0] ?? null),
    isActiveTabStreaming: jest.fn(() => false),
    getHistoryBackendDisplayName: jest.fn(() => 'OpenCode'),
    loadConversation: jest.fn().mockResolvedValue(undefined),
    getConversationById: jest.fn(async (conversationId: string) =>
      conversations.find((conversation) => conversation.id === conversationId) ?? null),
    cancelConversationTitleGeneration: jest.fn(),
    updateConversationTitle: jest.fn().mockResolvedValue(undefined),
    deleteConversationsAndCleanupTabs: jest.fn().mockResolvedValue(undefined),
    deleteAllConversationsAndReset: jest.fn().mockResolvedValue(undefined),
    showNotice: jest.fn(),
    ...overrides,
  };
}

function createHistoryEvent(anchorEl: HTMLElement): MouseEvent {
  return {
    currentTarget: anchorEl,
    target: anchorEl,
  } as MouseEvent;
}

async function flushPromises(): Promise<void> {
  await Promise.resolve();
  await Promise.resolve();
}

function createFixture(
  overrides: Partial<MockedConversationHistoryActionsHost> = {},
) {
  const conversations = [
    createConversation('conv-1', 'Alpha'),
    createConversation('conv-2', 'Beta', 'pending'),
  ];
  const host = createHost(conversations, overrides);
  const coordinator = new ConversationHistoryActionsCoordinator(host);
  const anchorEl = document.createElement('button');
  Object.defineProperty(anchorEl, 'getBoundingClientRect', {
    value: () => new DOMRect(32, 48, 24, 24),
  });
  document.body.appendChild(anchorEl);

  return {
    coordinator,
    host,
    conversations,
    anchorEl,
  };
}

describe('ConversationHistoryActionsCoordinator', () => {
  let requestAnimationFrameSpy: jest.SpyInstance<number, [FrameRequestCallback]>;
  let cancelAnimationFrameSpy: jest.SpyInstance<void, [number]>;

  beforeEach(() => {
    requestAnimationFrameSpy = jest
      .spyOn(window, 'requestAnimationFrame')
      .mockImplementation((callback: FrameRequestCallback) => {
        callback(0);
        return 1;
      });
    cancelAnimationFrameSpy = jest
      .spyOn(window, 'cancelAnimationFrame')
      .mockImplementation(() => undefined);
  });

  afterEach(() => {
    document.body.innerHTML = '';
    jest.clearAllMocks();
    jest.useRealTimers();
    requestAnimationFrameSpy.mockRestore();
    cancelAnimationFrameSpy.mockRestore();
  });

  it('renames a conversation through the coordinator-owned dialog flow', async () => {
    const fixture = createFixture();

    fixture.coordinator.show(createHistoryEvent(fixture.anchorEl));

    const renameBtn = document.body.querySelectorAll<HTMLButtonElement>(
      '.opencodian-history-item-edit',
    )[0];
    renameBtn?.click();
    await flushPromises();

    const inputEl = document.body.querySelector<HTMLInputElement>(
      '.opencodian-rename-dialog-input',
    );
    expect(inputEl?.value).toBe('Alpha');

    if (inputEl) {
      inputEl.value = '  Renamed chat  ';
    }
    document.body
      .querySelector<HTMLButtonElement>('.opencodian-rename-dialog-btn.mod-cta')
      ?.click();
    await flushPromises();

    expect(fixture.host.cancelConversationTitleGeneration).toHaveBeenCalledWith('conv-1');
    expect(fixture.host.updateConversationTitle).toHaveBeenCalledWith('conv-1', 'Renamed chat');
    expect(fixture.host.showNotice).toHaveBeenCalledWith(t('chat.history.renameSuccess'));
    expect(document.body.querySelector('.opencodian-history-dropdown')).toBeNull();

    fixture.coordinator.destroy();
  });

  it('routes delete-all confirmation through the reset host path', async () => {
    jest.useFakeTimers();
    const fixture = createFixture();

    fixture.coordinator.show(createHistoryEvent(fixture.anchorEl));

    const deleteActions = document.body.querySelectorAll<HTMLElement>('.opencodian-history-action');
    deleteActions[1]?.click();
    await flushPromises();

    const confirmBtn = document.body.querySelector<HTMLButtonElement>(
      '.opencodian-delete-confirm-confirm',
    );
    expect(confirmBtn?.hasAttribute('disabled')).toBe(true);

    jest.advanceTimersByTime(6200);
    expect(confirmBtn?.hasAttribute('disabled')).toBe(false);

    confirmBtn?.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    await flushPromises();

    expect(fixture.host.deleteAllConversationsAndReset).toHaveBeenCalledWith([
      'conv-1',
      'conv-2',
    ]);

    fixture.coordinator.destroy();
  });

  it('renders the active backend scope above the filtered history list', () => {
    const conversations = [
      createConversation('claude-1', 'Claude chat', 'success', 'claude-code'),
    ];
    const host = createHost(conversations, {
      getHistoryBackendDisplayName: jest.fn(() => 'Claude Code'),
    });
    const coordinator = new ConversationHistoryActionsCoordinator(host);
    const anchorEl = document.createElement('button');
    Object.defineProperty(anchorEl, 'getBoundingClientRect', {
      value: () => new DOMRect(32, 48, 24, 24),
    });
    document.body.appendChild(anchorEl);

    coordinator.show(createHistoryEvent(anchorEl));

    const scopeEl = document.body.querySelector<HTMLElement>('.opencodian-history-scope');
    expect(scopeEl?.textContent).toBe(t('chat.history.backendScope', {
      backend: 'Claude Code',
    }));

    coordinator.destroy();
  });

  it('renders a title preferences action when the host provides openTitleSettings', () => {
    const openTitleSettings = jest.fn();
    const fixture = createFixture({ openTitleSettings });

    fixture.coordinator.show(createHistoryEvent(fixture.anchorEl));

    const titlePrefEl = document.body.querySelector<HTMLElement>(
      '.opencodian-history-action:has(.opencodian-history-action-text)',
    );
    const titlePrefText = document.body.querySelector<HTMLElement>(
      '.opencodian-history-action-text',
    );
    expect(titlePrefText?.textContent).toBe(t('chat.history.titlePreferences'));

    titlePrefEl?.click();
    expect(openTitleSettings).toHaveBeenCalledTimes(1);
    expect(document.body.querySelector('.opencodian-history-dropdown')).toBeNull();

    fixture.coordinator.destroy();
  });

  it('does not render a title preferences action when the host omits openTitleSettings', () => {
    const fixture = createFixture();
    delete (fixture.host as Partial<typeof fixture.host>).openTitleSettings;

    fixture.coordinator.show(createHistoryEvent(fixture.anchorEl));

    const actionTexts = Array.from(
      document.body.querySelectorAll<HTMLElement>('.opencodian-history-action-text'),
    ).map((el) => el.textContent);
    expect(actionTexts).not.toContain(t('chat.history.titlePreferences'));

    fixture.coordinator.destroy();
  });
});

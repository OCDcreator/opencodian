import type { Conversation } from '../../../../../src/core/types';
import {
  ConversationSessionRailCoordinator,
  type ConversationSessionRailHost,
} from '../../../../../src/features/chat/services/ConversationSessionRailCoordinator';
import { setLocale, t } from '../../../../../src/i18n';

function conversation(id: string, title: string, updatedAt = 1000): Conversation {
  return {
    id,
    title,
    createdAt: updatedAt,
    updatedAt,
    messages: [],
    backend: 'opencode',
    openCodeSessionId: `${id}-session`,
  } as Conversation;
}

type MockedHost = {
  [Key in keyof ConversationSessionRailHost]: ConversationSessionRailHost[Key] extends (
    ...args: infer Args
  ) => infer Result
    ? jest.Mock<Result, Args>
    : ConversationSessionRailHost[Key];
};

function createFixture(overrides: Partial<ConversationSessionRailHost> = {}) {
  const conversations = [conversation('one', 'First'), conversation('two', 'Second', 2000)];
  const host: MockedHost = {
    isEnabled: jest.fn(() => true),
    getConversations: jest.fn(() => conversations),
    getCurrentConversation: jest.fn(() => conversations[0]),
    isActiveTabStreaming: jest.fn(() => false),
    loadConversation: jest.fn().mockResolvedValue(undefined),
    showNotice: jest.fn(),
    ...overrides,
  } as MockedHost;
  const shell = document.body.createDiv({ cls: 'opencodian-messages-shell' });
  const coordinator = new ConversationSessionRailCoordinator(host);
  return { coordinator, conversations, host, shell };
}

async function flush(): Promise<void> {
  await Promise.resolve();
  await Promise.resolve();
}

describe('ConversationSessionRailCoordinator', () => {
  beforeEach(() => setLocale('en'));

  afterEach(() => {
    document.body.empty();
    jest.clearAllMocks();
  });

  it('does not create a rail while disabled', () => {
    const { coordinator, shell } = createFixture({ isEnabled: () => false });

    coordinator.refresh(shell);

    expect(shell.querySelector('.opencodian-session-rail')).toBeNull();
    expect(shell.classList.contains('opencodian-messages-shell--session-rail')).toBe(false);
  });

  it('renders the list with the current conversation marked', () => {
    const { coordinator, shell } = createFixture();

    coordinator.refresh(shell);

    expect(shell.querySelector('.opencodian-session-rail-title')?.textContent).toBe(
      t('chat.sessionRail.title'),
    );
    expect(shell.querySelectorAll('.opencodian-session-rail-item')).toHaveLength(2);
    expect(shell.querySelector('.opencodian-session-rail-item.is-current')?.textContent).toContain('First');
    expect(shell.classList.contains('opencodian-messages-shell--session-rail')).toBe(true);
  });

  it('refreshes from the host\'s latest conversation titles without keeping a duplicate list', () => {
    const { conversations, coordinator, shell } = createFixture();
    coordinator.refresh(shell);
    conversations[1].title = 'Renamed second';

    coordinator.refresh(shell);

    expect(shell.querySelectorAll('.opencodian-session-rail-item')).toHaveLength(2);
    expect(shell.querySelectorAll('.opencodian-session-rail-item')[1]?.textContent).toContain(
      'Renamed second',
    );
  });

  it('renders a readable empty state', () => {
    const { coordinator, shell } = createFixture({ getConversations: () => [] });

    coordinator.refresh(shell);

    expect(shell.querySelector('.opencodian-session-rail-empty')?.textContent).toBe(
      t('chat.sessionRail.empty'),
    );
  });

  it('loads a non-current conversation through the canonical host path', async () => {
    const { coordinator, host, shell } = createFixture();

    coordinator.refresh(shell);
    shell.querySelectorAll<HTMLButtonElement>('.opencodian-session-rail-item')[1]?.click();
    await flush();

    expect(host.loadConversation).toHaveBeenCalledWith('two');
  });

  it('honestly blocks a rail selection while the active tab streams', async () => {
    const { coordinator, host, shell } = createFixture({ isActiveTabStreaming: () => true });

    coordinator.refresh(shell);
    shell.querySelectorAll<HTMLButtonElement>('.opencodian-session-rail-item')[1]?.click();
    await flush();

    expect(host.loadConversation).not.toHaveBeenCalled();
    expect(host.showNotice).toHaveBeenCalledWith(t('chat.tab.streamingBlocked'));
  });

  it('removes the rail and layout class on destroy or a disabled refresh', () => {
    const { coordinator, host, shell } = createFixture();
    coordinator.refresh(shell);

    coordinator.destroy();
    expect(shell.querySelector('.opencodian-session-rail')).toBeNull();
    expect(shell.classList.contains('opencodian-messages-shell--session-rail')).toBe(false);

    host.isEnabled.mockReturnValue(false);
    coordinator.refresh(shell);
    expect(shell.querySelector('.opencodian-session-rail')).toBeNull();
  });
});

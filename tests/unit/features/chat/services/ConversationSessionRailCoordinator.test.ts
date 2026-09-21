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

describe('ConversationSessionRailCoordinator accessibility (R-F5)', () => {
  beforeEach(() => setLocale('en'));

  afterEach(() => {
    document.body.empty();
    jest.clearAllMocks();
  });

  it('exposes the rail as a named navigation landmark', () => {
    const { coordinator, shell } = createFixture();
    coordinator.refresh(shell);

    const rail = shell.querySelector<HTMLElement>('.opencodian-session-rail');
    // A bare div with aria-label has no nameable role, so screen readers may
    // drop the label. The rail navigates between conversations, so it is a
    // navigation landmark.
    expect(rail?.getAttribute('role')).toBe('navigation');
  });

  it('names the landmark from its visible heading through aria-labelledby', () => {
    const { coordinator, shell } = createFixture();
    coordinator.refresh(shell);

    const rail = shell.querySelector<HTMLElement>('.opencodian-session-rail');
    const labelledBy = rail?.getAttribute('aria-labelledby');
    expect(labelledBy).toBeTruthy();
    const title = shell.querySelector<HTMLElement>(`[id="${labelledBy}"]`);
    expect(title).not.toBeNull();
    expect(title).toBe(rail?.querySelector('.opencodian-session-rail-title'));
    expect(title?.textContent).toBe(t('chat.sessionRail.title'));
  });

  it('gives the rail title real heading semantics', () => {
    const { coordinator, shell } = createFixture();
    coordinator.refresh(shell);

    const title = shell.querySelector<HTMLElement>('.opencodian-session-rail-title');
    expect(title?.getAttribute('role')).toBe('heading');
    expect(title?.getAttribute('aria-level')).toBe('2');
  });

  it('keeps aria-current and the per-item button names', () => {
    const { coordinator, shell, conversations } = createFixture();
    coordinator.refresh(shell);

    const items = Array.from(shell.querySelectorAll<HTMLButtonElement>('.opencodian-session-rail-item'));
    expect(items).toHaveLength(conversations.length);
    expect(items[0].getAttribute('aria-current')).toBe('page');
    expect(items[1].getAttribute('aria-current')).toBe('false');
    expect(items[0].getAttribute('aria-label'))
      .toBe(t('chat.sessionRail.currentItem', { title: 'First' }));
    expect(items[1].getAttribute('aria-label'))
      .toBe(t('chat.sessionRail.openItem', { title: 'Second' }));
    expect(items.every((item) => item.tagName === 'BUTTON' && item.getAttribute('type') === 'button'))
      .toBe(true);
  });

  it('keeps the list semantics of the rail items', () => {
    const { coordinator, shell } = createFixture();
    coordinator.refresh(shell);

    expect(shell.querySelector('.opencodian-session-rail-list')?.getAttribute('role')).toBe('list');
    expect(shell.querySelectorAll('.opencodian-session-rail-list > [role="listitem"]'))
      .toHaveLength(2);
  });

  it('does not reuse a landmark id across rail instances', () => {
    const first = createFixture();
    first.coordinator.refresh(first.shell);
    const second = createFixture();
    second.coordinator.refresh(second.shell);

    const firstId = first.shell.querySelector('.opencodian-session-rail')?.getAttribute('aria-labelledby');
    const secondId = second.shell.querySelector('.opencodian-session-rail')?.getAttribute('aria-labelledby');
    expect(firstId).toBeTruthy();
    expect(secondId).toBeTruthy();
    expect(firstId).not.toBe(secondId);
  });
});

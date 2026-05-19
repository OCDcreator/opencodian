import {
  ChatHeaderPresenter,
  type ChatHeaderPresenterHost,
  type ChatServerAvailability,
} from '../../../../src/features/chat/services/ChatHeaderPresenter';
import { t } from '../../../../src/i18n';

function createFixture() {
  let cssChangeListener: (() => void) | null = null;
  let availability: ChatServerAvailability = 'checking';
  let localServerMode = true;
  let openCodeBackend = true;

  const host: jest.Mocked<ChatHeaderPresenterHost> = {
    setTooltipLabel: jest.fn((element, label, position) => {
      element.setAttribute('data-tooltip', label);
      if (position) {
        element.setAttribute('data-tooltip-position', position);
      }
    }),
    registerCssChangeListener: jest.fn((listener) => {
      cssChangeListener = listener;
    }),
    resolveAssetUrl: jest.fn((relativePath) => `app://vault/${relativePath}`),
    scheduleChatSurfaceColorSync: jest.fn(),
    scheduleComposerLayoutSync: jest.fn(),
    resolveServerAvailability: jest.fn(() => Promise.resolve(availability)),
    isLocalServerMode: jest.fn(() => localServerMode),
    refreshContextUsageIndicator: jest.fn(),
    openServerSettings: jest.fn(),
    createConversationInNewTab: jest.fn().mockResolvedValue(undefined),
    createConversationInCurrentTab: jest.fn().mockResolvedValue(undefined),
    showConversationHistory: jest.fn(),
    openConversationSessionSettings: jest.fn(),
    openSettings: jest.fn(),
    isOpenCodeBackend: jest.fn(() => openCodeBackend),
  };

  const headerEl = document.createElement('div');
  document.body.appendChild(headerEl);
  const presenter = new ChatHeaderPresenter(host);
  presenter.build(headerEl);

  return {
    presenter,
    host,
    headerEl,
    setAvailability: (nextAvailability: ChatServerAvailability) => {
      availability = nextAvailability;
    },
    setLocalServerMode: (nextLocalServerMode: boolean) => {
      localServerMode = nextLocalServerMode;
    },
    setOpenCodeBackend: (nextOpenCodeBackend: boolean) => {
      openCodeBackend = nextOpenCodeBackend;
    },
    dispatchCssChange: () => {
      cssChangeListener?.();
    },
  };
}

describe('ChatHeaderPresenter', () => {
  beforeEach(() => {
    HTMLElement.prototype.hide = jest.fn(function (this: HTMLElement) {
      this.style.display = 'none';
    });
    HTMLElement.prototype.show = jest.fn(function (this: HTMLElement) {
      this.style.display = '';
    });
  });

  afterEach(() => {
    document.body.innerHTML = '';
    document.body.classList.remove('theme-dark');
    jest.clearAllMocks();
  });

  it('builds the header shell and routes header actions through host callbacks', () => {
    const fixture = createFixture();

    const tabBarSlotEl = fixture.headerEl.querySelector('.opencodian-tab-bar-slot--header');
    const actionButtons = fixture.headerEl.querySelectorAll<HTMLElement>('.opencodian-header-btn');
    const statusBadgeEl = fixture.headerEl.querySelector<HTMLElement>('.opencodian-server-status-badge');

    expect(fixture.presenter.getTabBarSlotEl()).toBe(tabBarSlotEl);
    expect(fixture.host.registerCssChangeListener).toHaveBeenCalledTimes(1);
    expect(actionButtons).toHaveLength(5);
    expect(statusBadgeEl?.getAttribute('data-tooltip')).toBe(t('chat.serverStatus.openSettings'));

    statusBadgeEl?.click();
    actionButtons[0]?.click();
    actionButtons[1]?.click();
    actionButtons[2]?.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    actionButtons[3]?.click();
    actionButtons[4]?.click();

    expect(fixture.host.openServerSettings).toHaveBeenCalledTimes(1);
    expect(fixture.host.createConversationInNewTab).toHaveBeenCalledTimes(1);
    expect(fixture.host.createConversationInCurrentTab).toHaveBeenCalledTimes(1);
    expect(fixture.host.showConversationHistory).toHaveBeenCalledTimes(1);
    expect(fixture.host.openConversationSessionSettings).toHaveBeenCalledTimes(1);
    expect(fixture.host.openSettings).toHaveBeenCalledTimes(1);
  });

  it('marks the new-tab action for tab-disabled container CSS', () => {
    const fixture = createFixture();

    const actionButtons = fixture.headerEl.querySelectorAll<HTMLElement>('.opencodian-header-btn');
    const newTabButton = fixture.headerEl.querySelector<HTMLElement>('.opencodian-header-btn--new-tab');

    expect(actionButtons).toHaveLength(5);
    expect(newTabButton).toBe(actionButtons[0]);
  });

  it('refreshes status classes and relabels status when server mode changes', async () => {
    const fixture = createFixture();
    const statusBadgeEl = fixture.headerEl.querySelector<HTMLElement>('.opencodian-server-status-badge');
    const statusTextEl = fixture.headerEl.querySelector<HTMLElement>('.opencodian-server-status-text');

    fixture.setAvailability('running');
    fixture.setLocalServerMode(true);
    await fixture.presenter.refreshServerStatusBadge();

    expect(statusBadgeEl?.classList.contains('is-running')).toBe(true);
    expect(statusTextEl?.textContent).toBe(t('chat.serverStatus.localManaged'));
    expect(fixture.host.refreshContextUsageIndicator).toHaveBeenCalledTimes(1);

    fixture.setLocalServerMode(false);
    fixture.presenter.applyLocaleTexts();

    expect(statusTextEl?.textContent).toBe(t('chat.serverStatus.remoteConnected'));

    fixture.setAvailability('external');
    fixture.setLocalServerMode(true);
    await fixture.presenter.refreshServerStatusBadge();

    expect(statusBadgeEl?.classList.contains('is-external')).toBe(true);
    expect(statusTextEl?.textContent).toBe(t('chat.serverStatus.localExternal'));

    fixture.setAvailability('disabled');
    await fixture.presenter.refreshServerStatusBadge();

    expect(statusBadgeEl?.classList.contains('is-disabled')).toBe(true);
    expect(statusTextEl?.textContent).toBe(t('chat.serverStatus.disabled'));
  });

  it('ignores late server status results after destroy clears header DOM refs', async () => {
    const fixture = createFixture();
    let resolveAvailability: ((value: ChatServerAvailability) => void) | null = null;
    fixture.host.resolveServerAvailability.mockImplementation(() =>
      new Promise((resolve) => {
        resolveAvailability = resolve;
      })
    );

    const refreshPromise = fixture.presenter.refreshServerStatusBadge();
    fixture.presenter.destroy();
    resolveAvailability?.('running');
    await expect(refreshPromise).resolves.toBeUndefined();

    expect(fixture.host.refreshContextUsageIndicator).not.toHaveBeenCalled();
  });

  it('syncs title assets and layout callbacks on css changes', () => {
    const fixture = createFixture();
    const wordmarkEl = fixture.headerEl.querySelector<HTMLImageElement>('.opencodian-title-text');
    const logoEl = fixture.headerEl.querySelector<HTMLElement>('.opencodian-logo');

    expect(wordmarkEl?.getAttribute('src')).toBe(
      'app://vault/assets/branding/opencodian-wordmark-light.svg',
    );
    expect(logoEl?.innerHTML).toContain('clip0_light');

    document.body.classList.add('theme-dark');
    fixture.dispatchCssChange();

    expect(wordmarkEl?.getAttribute('src')).toBe(
      'app://vault/assets/branding/opencodian-wordmark-dark.svg',
    );
    expect(logoEl?.innerHTML).toContain('clip0_dark');
    expect(fixture.host.scheduleChatSurfaceColorSync).toHaveBeenCalledTimes(1);
    expect(fixture.host.scheduleComposerLayoutSync).toHaveBeenCalledTimes(1);
  });

  it('skips the LSP indicator when the active backend is not OpenCode', () => {
    const fixture = createFixture();
    fixture.presenter.destroy();
    fixture.headerEl.innerHTML = '';
    fixture.setOpenCodeBackend(false);

    fixture.presenter.build(fixture.headerEl);

    expect(fixture.headerEl.querySelector('.opencodian-lsp-status-indicator')).toBeNull();
  });
});

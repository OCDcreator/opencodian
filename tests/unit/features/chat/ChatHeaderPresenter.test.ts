import {
  ChatHeaderPresenter,
  type ChatHeaderPresenterHost,
  type ChatServerAvailability,
} from '../../../../src/features/chat/services/ChatHeaderPresenter';
import { ConversationRenderService } from '../../../../src/features/chat/services/ConversationRenderService';
import { t } from '../../../../src/i18n';

type MockApp = {
  plugins?: {
    plugins?: {
      opencodian?: {
        settings?: { activeBackend?: string };
      };
    };
  };
};

function mockGlobalApp(app: MockApp): () => void {
  const originalApp = (globalThis as { app?: MockApp }).app;
  (globalThis as { app?: MockApp }).app = app;
  return () => {
    (globalThis as { app?: MockApp }).app = originalApp;
  };
}

function createFixture() {
  let cssChangeListener: (() => void) | null = null;
  let availability: ChatServerAvailability = 'checking';
  let localServerMode = true;
  let openCodeBackend = true;

  const host: jest.Mocked<ChatHeaderPresenterHost> = {
    setTooltipLabel: jest.fn((element, label, position) => {
      ConversationRenderService.setTooltipLabel(element, label, position);
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
    getActiveBackendDisplayName: jest.fn(() => openCodeBackend ? 'OpenCode' : 'Claude Code'),
    getActiveBackendKind: jest.fn(() => openCodeBackend ? 'opencode' : 'claude-code'),
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

describe('ChatHeaderPresenter header shell and actions', () => {
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

  it('uses backend settings language for the status badge outside OpenCode mode', async () => {
    const fixture = createFixture();
    fixture.setOpenCodeBackend(false);
    fixture.setAvailability('running');

    await fixture.presenter.refreshServerStatusBadge();

    const statusBadgeEl = fixture.headerEl.querySelector<HTMLElement>('.opencodian-server-status-badge');
    const statusTextEl = fixture.headerEl.querySelector<HTMLElement>('.opencodian-server-status-text');
    expect(statusTextEl?.textContent).toBe(t('chat.serverStatus.backendConnected', {
      backend: 'Claude Code',
    }));
    expect(statusBadgeEl?.getAttribute('data-tooltip')).toBe(t('chat.serverStatus.openBackendSettings'));
  });

  it('shows backend-specific offline instead of connected when a non-OpenCode backend is disconnected', async () => {
    const fixture = createFixture();
    fixture.setOpenCodeBackend(false);
    fixture.setAvailability('offline');

    await fixture.presenter.refreshServerStatusBadge();

    const statusTextEl = fixture.headerEl.querySelector<HTMLElement>('.opencodian-server-status-text');
    const statusBadgeEl = fixture.headerEl.querySelector<HTMLElement>('.opencodian-server-status-badge');
    expect(statusTextEl?.textContent).toBe(t('chat.serverStatus.backendOffline', {
      backend: 'Claude Code',
    }));
    expect(statusTextEl?.textContent).not.toBe(t('chat.serverStatus.backendConnected', {
      backend: 'Claude Code',
    }));
    expect(statusBadgeEl?.getAttribute('data-tooltip')).toBe(t('chat.serverStatus.openBackendSettings'));
  });

  it('includes the backend name when a non-OpenCode backend is offline', async () => {
    const fixture = createFixture();
    fixture.setOpenCodeBackend(false);
    fixture.setAvailability('offline');

    await fixture.presenter.refreshServerStatusBadge();

    const statusTextEl = fixture.headerEl.querySelector<HTMLElement>('.opencodian-server-status-text');
    expect(statusTextEl?.textContent).toBe(t('chat.serverStatus.backendOffline', {
      backend: 'Claude Code',
    }));
  });

  it('exposes stable accessible header action locators', () => {
    const fixture = createFixture();

    const expectedActions = [
      ['new-tab', t('chat.tab.newTooltip')],
      ['new-current-tab', t('chat.tab.newCurrentTooltip')],
      ['history', t('chat.history.open')],
      ['session-settings', t('chat.sessionSettings.open')],
      ['settings', t('chat.settings.open')],
    ];

    for (const [action, label] of expectedActions) {
      const buttonEl = fixture.headerEl.querySelector<HTMLButtonElement>(
        `.opencodian-header-btn[data-action="${action}"]`,
      );
      expect(buttonEl).not.toBeNull();
      expect(buttonEl?.tagName).toBe('BUTTON');
      expect(buttonEl?.getAttribute('type')).toBe('button');
      expect(buttonEl?.hasAttribute('aria-label')).toBe(false);
      expect(buttonEl?.getAttribute('data-tooltip')).toBe(label);
      const hiddenLabel = buttonEl?.querySelector<HTMLElement>('.opencodian-visually-hidden[data-tooltip-label="true"]');
      expect(hiddenLabel?.textContent).toBe(label);
      expect(buttonEl?.getAttribute('aria-labelledby')).toBe(hiddenLabel?.id);
    }
  });

  it('groups header status, conversation, and configuration actions by workflow', () => {
    const fixture = createFixture();

    const statusGroup = fixture.headerEl.querySelector<HTMLElement>('.opencodian-header-status-group');
    const conversationGroup = fixture.headerEl.querySelector<HTMLElement>('.opencodian-header-conversation-group');
    const configGroup = fixture.headerEl.querySelector<HTMLElement>('.opencodian-header-config-group');

    expect(statusGroup?.querySelector('.opencodian-server-status-badge')).not.toBeNull();
    expect(
      Array.from(conversationGroup?.querySelectorAll<HTMLElement>('.opencodian-header-btn') ?? [])
        .map((button) => button.dataset.action),
    ).toEqual(['new-current-tab', 'new-tab', 'history']);
    expect(
      Array.from(configGroup?.querySelectorAll<HTMLElement>('.opencodian-header-btn') ?? [])
        .map((button) => button.dataset.action),
    ).toEqual(['session-settings', 'settings']);
  });

  it('renders the server status as a compact expandable status control', () => {
    const fixture = createFixture();

    const statusBadgeEl = fixture.headerEl.querySelector<HTMLButtonElement>('.opencodian-server-status-badge');
    const statusTextEl = fixture.headerEl.querySelector<HTMLElement>('.opencodian-server-status-text');

    expect(statusBadgeEl).not.toBeNull();
    expect(statusBadgeEl?.tagName).toBe('BUTTON');
    expect(statusBadgeEl?.getAttribute('type')).toBe('button');
    expect(statusBadgeEl?.getAttribute('data-status-chip')).toBe('collapsed');
    expect(statusBadgeEl?.getAttribute('aria-expanded')).toBe('false');
    expect(statusTextEl?.getAttribute('aria-hidden')).toBe('true');
  });

  it('reuses Settings LobeHub backend icons inside the compact status badge', async () => {
    const fixture = createFixture();

    await fixture.presenter.refreshServerStatusBadge();

    const statusBadgeEl = fixture.headerEl.querySelector<HTMLElement>('.opencodian-server-status-badge');
    const statusIconEl = fixture.headerEl.querySelector<HTMLElement>('.opencodian-server-status-icon');
    const statusStateEl = fixture.headerEl.querySelector<HTMLElement>('.opencodian-server-status-state');
    expect(statusIconEl).not.toBeNull();
    expect(statusIconEl?.getAttribute('data-icon')).toBe('inline-start');
    expect(statusIconEl?.getAttribute('aria-hidden')).toBe('true');
    expect(statusIconEl?.getAttribute('data-backend-icon')).toBe('opencode');
    expect(statusIconEl?.classList.contains('has-inline-brandmark')).toBe(false);
    expect(statusIconEl?.classList.contains('has-svg-icon')).toBe(false);
    expect(statusIconEl?.classList.contains('has-lobehub-icon')).toBe(true);
    expect(statusIconEl?.querySelector('.opencodian-server-status-icon-brandmark')).toBeNull();
    expect(statusIconEl?.style.getPropertyValue('--opencodian-server-status-icon-url')).toBe('');
    const openCodeIconEl = statusIconEl?.querySelector<HTMLElement>('.opencodian-agent-switcher-lobehub-icon');
    expect(openCodeIconEl?.dataset.lobehubIcon).toBe('opencode');
    expect(statusStateEl?.parentElement).toBe(statusBadgeEl);

    fixture.host.getActiveBackendKind.mockReturnValue('claude-code');
    await fixture.presenter.refreshServerStatusBadge();

    expect(statusIconEl?.getAttribute('data-backend-icon')).toBe('claude-code');
    expect(statusIconEl?.classList.contains('has-inline-brandmark')).toBe(false);
    expect(statusIconEl?.classList.contains('has-svg-icon')).toBe(false);
    expect(statusIconEl?.classList.contains('has-lobehub-icon')).toBe(true);
    expect(statusIconEl?.querySelector('.opencodian-server-status-icon-brandmark')).toBeNull();
    expect(statusIconEl?.style.getPropertyValue('--opencodian-server-status-icon-url')).toBe('');
    const claudeCodeIconEl = statusIconEl?.querySelector<HTMLElement>('.opencodian-agent-switcher-lobehub-icon');
    expect(claudeCodeIconEl?.dataset.lobehubIcon).toBe('claudecode');
    expect(
      claudeCodeIconEl?.querySelector<HTMLImageElement>('.opencodian-agent-switcher-lobehub-img--light')?.src,
    ).toBe('https://unpkg.com/@lobehub/icons-static-webp@latest/light/claudecode-color.webp');
    expect(
      claudeCodeIconEl?.querySelector<HTMLImageElement>('.opencodian-agent-switcher-lobehub-img--dark')?.src,
    ).toBe('https://unpkg.com/@lobehub/icons-static-webp@latest/dark/claudecode-color.webp');

    fixture.host.getActiveBackendKind.mockReturnValue('codex');
    await fixture.presenter.refreshServerStatusBadge();

    expect(statusIconEl?.getAttribute('data-backend-icon')).toBe('codex');
    expect(statusIconEl?.classList.contains('has-inline-brandmark')).toBe(false);
    expect(statusIconEl?.classList.contains('has-svg-icon')).toBe(false);
    expect(statusIconEl?.classList.contains('has-lobehub-icon')).toBe(true);
    expect(statusIconEl?.querySelector('.opencodian-server-status-icon-brandmark')).toBeNull();
    expect(statusIconEl?.style.getPropertyValue('--opencodian-server-status-icon-url')).toBe('');
    const codexIconEl = statusIconEl?.querySelector<HTMLElement>('.opencodian-agent-switcher-lobehub-icon');
    expect(codexIconEl?.dataset.lobehubIcon).toBe('codex');
  });

  it('marks the new-tab action for tab-disabled container CSS', () => {
    const fixture = createFixture();

    const actionButtons = fixture.headerEl.querySelectorAll<HTMLElement>('.opencodian-header-btn');
    const newTabButton = fixture.headerEl.querySelector<HTMLElement>('.opencodian-header-btn--new-tab');

    expect(actionButtons).toHaveLength(5);
    expect(newTabButton).toBe(actionButtons[1]);
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

});

describe('ChatHeaderPresenter status-chip width', () => {
  it('sizes the expanded status chip from the rendered label width instead of glyph count', async () => {
    const fixture = createFixture();
    const statusBadgeEl = fixture.headerEl.querySelector<HTMLElement>('.opencodian-server-status-badge');
    const statusTextEl = fixture.headerEl.querySelector<HTMLElement>('.opencodian-server-status-text');
    const codexConnected = t('chat.serverStatus.backendConnected', { backend: 'Codex' });
    const claudeCodeConnected = t('chat.serverStatus.backendConnected', { backend: 'Claude Code' });

    Object.defineProperty(statusTextEl, 'scrollWidth', {
      configurable: true,
      get: () => statusTextEl?.textContent === codexConnected ? 75 : 114,
    });
    fixture.setOpenCodeBackend(false);
    fixture.host.getActiveBackendKind.mockReturnValue('codex');
    fixture.host.getActiveBackendDisplayName?.mockReturnValue('Codex');
    fixture.setAvailability('running');

    await fixture.presenter.refreshServerStatusBadge();

    expect(statusTextEl?.textContent).toBe(codexConnected);
    expect(statusBadgeEl?.style.getPropertyValue('--opencodian-server-status-expanded-width')).toBe('121px');

    fixture.host.getActiveBackendKind.mockReturnValue('claude-code');
    fixture.host.getActiveBackendDisplayName?.mockReturnValue('Claude Code');
    await fixture.presenter.refreshServerStatusBadge();

    expect(statusTextEl?.textContent).toBe(claudeCodeConnected);
    expect(statusBadgeEl?.style.getPropertyValue('--opencodian-server-status-expanded-width')).toBe('160px');
  });
});

describe('ChatHeaderPresenter server status', () => {
  it('uses backend-shaped status copy and refreshes OpenCode-only chrome when backend changes', async () => {
    const fixture = createFixture();
    const statusTextEl = fixture.headerEl.querySelector<HTMLElement>('.opencodian-server-status-text');

    expect(fixture.headerEl.querySelector('.opencodian-lsp-status')).not.toBeNull();

    fixture.setOpenCodeBackend(false);
    fixture.setAvailability('running');
    fixture.presenter.refreshBackendChrome();
    await fixture.presenter.refreshServerStatusBadge();

    expect(fixture.headerEl.querySelector('.opencodian-lsp-status')).toBeNull();
    expect(statusTextEl?.textContent).toBe(t('chat.serverStatus.backendConnected', { backend: 'Claude Code' }));

    fixture.setOpenCodeBackend(true);
    fixture.presenter.refreshBackendChrome();

    expect(fixture.headerEl.querySelector('.opencodian-lsp-status')).not.toBeNull();
  });

  it('ignores late server status results after destroy clears header DOM refs', async () => {
    const fixture = createFixture();
    const resolvers: Array<(value: ChatServerAvailability) => void> = [];
    fixture.host.resolveServerAvailability.mockImplementation(() =>
      new Promise((resolve) => {
        resolvers.push(resolve);
      })
    );

    const refreshPromise = fixture.presenter.refreshServerStatusBadge();
    fixture.presenter.destroy();
    resolvers.forEach((resolve) => resolve('running'));
    await expect(refreshPromise).resolves.toBeUndefined();

    expect(fixture.host.refreshContextUsageIndicator).not.toHaveBeenCalled();
  });

  it('syncs title assets and layout callbacks on css changes', () => {
    const fixture = createFixture();
    const wordmarkEl = fixture.headerEl.querySelector<HTMLImageElement>('.opencodian-title-text');
    const logoEl = fixture.headerEl.querySelector<HTMLElement>('.opencodian-logo');

    expect(wordmarkEl?.getAttribute('src')).toMatch(/^data:image\/svg\+xml/);
    expect(logoEl?.innerHTML).toContain('clip0_light');

    document.body.classList.add('theme-dark');
    fixture.dispatchCssChange();

    expect(wordmarkEl?.getAttribute('src')).toMatch(/^data:image\/svg\+xml/);
    expect(logoEl?.innerHTML).toContain('clip0_dark');
    expect(fixture.host.scheduleChatSurfaceColorSync).toHaveBeenCalledTimes(1);
    expect(fixture.host.scheduleComposerLayoutSync).toHaveBeenCalledTimes(1);
  });

  it('exposes the canonical active backend kind on the status badge using the host method', async () => {
    const fixture = createFixture();
    await fixture.presenter.refreshServerStatusBadge();

    const statusBadgeEl = fixture.headerEl.querySelector<HTMLElement>('.opencodian-server-status-badge');
    expect(statusBadgeEl?.getAttribute('data-active-backend')).toBe('opencode');

    fixture.setOpenCodeBackend(false);
    await fixture.presenter.refreshServerStatusBadge();

    expect(statusBadgeEl?.getAttribute('data-active-backend')).toBe('claude-code');
  });

  it('falls back to reading active backend from the global plugin when host method is absent', async () => {
    const fixture = createFixture();
    fixture.setOpenCodeBackend(false);
    delete (fixture.host as Partial<typeof fixture.host>).getActiveBackendKind;

    const restoreApp = mockGlobalApp({
      plugins: {
        plugins: {
          opencodian: {
            settings: { activeBackend: 'codex' },
          },
        },
      },
    });

    try {
      await fixture.presenter.refreshServerStatusBadge();

      const statusBadgeEl = fixture.headerEl.querySelector<HTMLElement>('.opencodian-server-status-badge');
      expect(statusBadgeEl?.getAttribute('data-active-backend')).toBe('codex');
    } finally {
      restoreApp();
    }
  });
});

describe('ChatHeaderPresenter backend chrome', () => {
    it('skips the LSP indicator when the active backend is not OpenCode', () => {
      const fixture = createFixture();
      fixture.presenter.destroy();
      fixture.headerEl.innerHTML = '';
      fixture.setOpenCodeBackend(false);

      fixture.presenter.build(fixture.headerEl);

      expect(fixture.headerEl.querySelector('.opencodian-lsp-status-indicator')).toBeNull();
    });
  });

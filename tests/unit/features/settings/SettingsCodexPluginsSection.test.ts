/**
 * Settings-layer contract tests for the Codex plugin browser surface.
 *
 * Covers the honesty rules: backend-inactive / null-route results render an
 * explicit unavailable state (never a fake empty list), install/uninstall
 * confirm → act → reconcile → reload, and appsNeedingAuth surfaces a notice.
 */

import { capturedNotices, clearCapturedNotices } from 'obsidian';

import { SettingsCodexPluginsSection } from '../../../../src/features/settings/SettingsCodexPluginsSection';
import { setLocale, t } from '../../../../src/i18n';

type AdapterMocks = {
  listCodexPlugins: jest.Mock;
  listInstalledCodexPlugins: jest.Mock;
  installCodexPlugin: jest.Mock;
  uninstallCodexPlugin: jest.Mock;
  reconcileCodexPlugins: jest.Mock;
};

function createPlugin(adapter: unknown): {
  agentServiceRegistry: { get: jest.Mock };
} {
  return {
    agentServiceRegistry: {
      get: jest.fn((backend: string) => (backend === 'codex' ? adapter : null)),
    },
  };
}

function createAdapter(overrides: Partial<AdapterMocks> = {}): AdapterMocks {
  return {
    listCodexPlugins: jest.fn().mockResolvedValue(emptyListResult()),
    listInstalledCodexPlugins: jest.fn().mockResolvedValue(emptyListResult()),
    installCodexPlugin: jest.fn().mockResolvedValue({ appsNeedingAuth: [], authPolicy: 'ON_INSTALL' }),
    uninstallCodexPlugin: jest.fn().mockResolvedValue(true),
    reconcileCodexPlugins: jest.fn().mockResolvedValue({
      changedPlugins: [],
      failedRemotePluginIds: [],
      failedMaterializationRemotePluginIds: [],
    }),
    ...overrides,
  };
}

function emptyListResult() {
  return { marketplaces: [], featuredPluginIds: [], marketplaceLoadErrors: [] };
}

function marketplaceResult() {
  return {
    marketplaces: [
      {
        name: 'local-marketplace',
        path: '/vault/.codex/plugins',
        plugins: [
          {
            id: 'alpha', name: 'alpha', installed: false, enabled: false,
            installPolicy: 'AVAILABLE', authPolicy: 'ON_INSTALL', source: { type: 'local', path: '/x' },
          },
          {
            id: 'beta', name: 'beta', installed: false, enabled: false,
            installPolicy: 'NOT_AVAILABLE', authPolicy: 'ON_INSTALL', source: { type: 'remote' },
          },
          {
            id: 'gamma', name: 'gamma', installed: true, enabled: true,
            installPolicy: 'INSTALLED_BY_DEFAULT', authPolicy: 'ON_USE', source: { type: 'remote' },
          },
        ],
      },
    ],
    featuredPluginIds: [],
    marketplaceLoadErrors: [],
  };
}

function installedResult() {
  return {
    marketplaces: [
      {
        name: 'installed',
        path: null,
        plugins: [
          {
            id: 'gamma', name: 'gamma', installed: true, enabled: true,
            installPolicy: 'INSTALLED_BY_DEFAULT', authPolicy: 'ON_USE', source: { type: 'remote' },
          },
        ],
      },
    ],
    featuredPluginIds: [],
    marketplaceLoadErrors: [],
  };
}

async function flush(): Promise<void> {
  for (let i = 0; i < 10; i += 1) {
    await Promise.resolve();
  }
  await new Promise((r) => setTimeout(r, 0));
}

function renderSection(adapter: unknown): {
  containerEl: HTMLElement;
  section: SettingsCodexPluginsSection;
} {
  const section = new SettingsCodexPluginsSection({
    plugin: createPlugin(adapter) as never,
    createSectionHeading: (hostEl, title) => hostEl.createEl('h3', { text: title }),
  });
  const containerEl = document.createElement('div');
  section.render(containerEl);
  return { containerEl, section };
}

function pluginsRoot(containerEl: HTMLElement): HTMLElement {
  return containerEl.querySelector('[data-codex-plugins]')!;
}

describe('SettingsCodexPluginsSection', () => {
  beforeEach(() => {
    setLocale('en');
    clearCapturedNotices();
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  it('renders an unavailable state when the codex backend is not active', async () => {
    const { containerEl } = renderSection(null);
    await flush();

    expect(pluginsRoot(containerEl).getAttribute('data-codex-plugins-state')).toBe('unavailable');
    expect(pluginsRoot(containerEl).textContent).toContain(t('settings.codex.plugins.unavailable'));
    expect(containerEl.querySelector('[data-codex-plugins-group]')).toBeNull();
  });

  it('renders an unavailable state when the adapter lacks the plugin methods', async () => {
    const { containerEl } = renderSection({});
    await flush();

    expect(pluginsRoot(containerEl).getAttribute('data-codex-plugins-state')).toBe('unavailable');
    expect(pluginsRoot(containerEl).textContent).toContain(t('settings.codex.plugins.unavailable'));
  });

  it('renders an unavailable state (not a fake empty list) when a route returns null', async () => {
    const adapter = createAdapter({ listCodexPlugins: jest.fn().mockResolvedValue(null) });
    const { containerEl } = renderSection(adapter);
    await flush();

    expect(pluginsRoot(containerEl).getAttribute('data-codex-plugins-state')).toBe('unavailable');
    expect(pluginsRoot(containerEl).textContent).toContain(t('settings.codex.plugins.unavailable'));
    expect(containerEl.querySelector('.opencodian-settings-inline-empty')).toBeNull();
  });

  it('renders marketplace and installed groups with per-plugin actions', async () => {
    const adapter = createAdapter({
      listCodexPlugins: jest.fn().mockResolvedValue(marketplaceResult()),
      listInstalledCodexPlugins: jest.fn().mockResolvedValue(installedResult()),
    });
    const { containerEl } = renderSection(adapter);
    await flush();

    expect(pluginsRoot(containerEl).getAttribute('data-codex-plugins-state')).toBe('data');
    expect(containerEl.querySelector('[data-codex-plugins-group="marketplace"]')).toBeTruthy();
    expect(containerEl.querySelector('[data-codex-plugins-group="installed"]')).toBeTruthy();

    const marketplaceEl = containerEl.querySelector('[data-codex-plugins-group="marketplace"]')!;
    // Installable plugin gets an install button.
    expect(marketplaceEl.querySelector('[data-plugin-id="alpha"] .opencodian-codex-plugin-install')).toBeTruthy();
    // NOT_AVAILABLE plugin gets no install button.
    expect(marketplaceEl.querySelector('[data-plugin-id="beta"] .opencodian-codex-plugin-install')).toBeNull();
    // Already-installed plugin shows the installed badge instead of install.
    expect(marketplaceEl.querySelector('[data-plugin-id="gamma"] .opencodian-codex-plugin-install')).toBeNull();
    expect(marketplaceEl.textContent).toContain(t('settings.codex.plugins.installedBadge'));

    const installedEl = containerEl.querySelector('[data-codex-plugins-group="installed"]')!;
    expect(installedEl.querySelector('[data-plugin-id="gamma"] .opencodian-codex-plugin-uninstall')).toBeTruthy();
    expect(installedEl.textContent).toContain(t('settings.codex.plugins.enabledBadge'));
  });

  it('renders per-group empty states when the catalog is genuinely empty', async () => {
    const { containerEl } = renderSection(createAdapter());
    await flush();

    expect(pluginsRoot(containerEl).getAttribute('data-codex-plugins-state')).toBe('data');
    const emptyStates = containerEl.querySelectorAll('.opencodian-settings-inline-empty');
    expect(emptyStates.length).toBe(2);
    expect(containerEl.textContent).toContain(t('settings.codex.plugins.empty'));
  });

  it('renders marketplace load errors when some marketplaces fail', async () => {
    const adapter = createAdapter({
      listCodexPlugins: jest.fn().mockResolvedValue({
        marketplaces: [],
        featuredPluginIds: [],
        marketplaceLoadErrors: [{ marketplacePath: '/bad/path', message: 'boom' }],
      }),
    });
    const { containerEl } = renderSection(adapter);
    await flush();

    const errorsEl = containerEl.querySelector('[data-codex-plugins-marketplace-errors]')!;
    expect(errorsEl.textContent).toContain('/bad/path');
    expect(errorsEl.textContent).toContain('boom');
  });
});

describe('SettingsCodexPluginsSection — mutation flows', () => {
  beforeEach(() => {
    setLocale('en');
    clearCapturedNotices();
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  it('installs after confirmation, then reconciles and reloads', async () => {
    const adapter = createAdapter({
      listCodexPlugins: jest.fn().mockResolvedValue(marketplaceResult()),
      listInstalledCodexPlugins: jest.fn().mockResolvedValue(installedResult()),
    });
    jest.spyOn(window, 'confirm').mockReturnValue(true);
    const { containerEl } = renderSection(adapter);
    await flush();

    const installButton = containerEl.querySelector<HTMLButtonElement>(
      '[data-codex-plugins-group="marketplace"] [data-plugin-id="alpha"] .opencodian-codex-plugin-install',
    )!;
    installButton.click();
    await flush();

    expect(adapter.installCodexPlugin).toHaveBeenCalledWith('alpha', { marketplacePath: '/vault/.codex/plugins' });
    expect(adapter.reconcileCodexPlugins).toHaveBeenCalledTimes(1);
    // Reload re-queries both lists.
    expect(adapter.listCodexPlugins.mock.calls.length).toBeGreaterThanOrEqual(2);
    expect(capturedNotices.join('\n')).toContain(t('settings.codex.plugins.installSuccess', { name: 'alpha' }));
  });

  it('does not install when the user cancels the confirmation', async () => {
    const adapter = createAdapter({
      listCodexPlugins: jest.fn().mockResolvedValue(marketplaceResult()),
      listInstalledCodexPlugins: jest.fn().mockResolvedValue(installedResult()),
    });
    jest.spyOn(window, 'confirm').mockReturnValue(false);
    const { containerEl } = renderSection(adapter);
    await flush();

    containerEl
      .querySelector<HTMLButtonElement>(
        '[data-codex-plugins-group="marketplace"] [data-plugin-id="alpha"] .opencodian-codex-plugin-install',
      )!
      .click();
    await flush();

    expect(adapter.installCodexPlugin).not.toHaveBeenCalled();
    expect(adapter.reconcileCodexPlugins).not.toHaveBeenCalled();
  });

  it('notifies which apps need authorization after install', async () => {
    const adapter = createAdapter({
      listCodexPlugins: jest.fn().mockResolvedValue(marketplaceResult()),
      listInstalledCodexPlugins: jest.fn().mockResolvedValue(installedResult()),
      installCodexPlugin: jest.fn().mockResolvedValue({
        appsNeedingAuth: [{ id: 'app-1', name: 'Coder App' }],
        authPolicy: 'ON_INSTALL',
      }),
    });
    jest.spyOn(window, 'confirm').mockReturnValue(true);
    const { containerEl } = renderSection(adapter);
    await flush();

    containerEl
      .querySelector<HTMLButtonElement>(
        '[data-codex-plugins-group="marketplace"] [data-plugin-id="alpha"] .opencodian-codex-plugin-install',
      )!
      .click();
    await flush();

    expect(capturedNotices.join('\n')).toContain('Coder App');
    expect(capturedNotices.join('\n')).toContain(t('settings.codex.plugins.authRequired', {
      name: 'alpha',
      apps: 'Coder App',
    }));
  });

  it('shows a failure notice and skips reconcile when install returns null', async () => {
    const adapter = createAdapter({
      listCodexPlugins: jest.fn().mockResolvedValue(marketplaceResult()),
      listInstalledCodexPlugins: jest.fn().mockResolvedValue(installedResult()),
      installCodexPlugin: jest.fn().mockResolvedValue(null),
    });
    jest.spyOn(window, 'confirm').mockReturnValue(true);
    const { containerEl } = renderSection(adapter);
    await flush();

    containerEl
      .querySelector<HTMLButtonElement>(
        '[data-codex-plugins-group="marketplace"] [data-plugin-id="alpha"] .opencodian-codex-plugin-install',
      )!
      .click();
    await flush();

    expect(capturedNotices.join('\n')).toContain(t('settings.codex.plugins.installFailed'));
    expect(adapter.reconcileCodexPlugins).not.toHaveBeenCalled();
  });

  it('uninstalls after confirmation, then reconciles and reloads', async () => {
    const adapter = createAdapter({
      listCodexPlugins: jest.fn().mockResolvedValue(marketplaceResult()),
      listInstalledCodexPlugins: jest.fn().mockResolvedValue(installedResult()),
    });
    jest.spyOn(window, 'confirm').mockReturnValue(true);
    const { containerEl } = renderSection(adapter);
    await flush();

    containerEl
      .querySelector<HTMLButtonElement>(
        '[data-codex-plugins-group="installed"] [data-plugin-id="gamma"] .opencodian-codex-plugin-uninstall',
      )!
      .click();
    await flush();

    expect(adapter.uninstallCodexPlugin).toHaveBeenCalledWith('gamma');
    expect(adapter.reconcileCodexPlugins).toHaveBeenCalledTimes(1);
    expect(capturedNotices.join('\n')).toContain(t('settings.codex.plugins.uninstallSuccess', { name: 'gamma' }));
  });

  it('shows a failure notice and skips reconcile when uninstall returns false', async () => {
    const adapter = createAdapter({
      listCodexPlugins: jest.fn().mockResolvedValue(marketplaceResult()),
      listInstalledCodexPlugins: jest.fn().mockResolvedValue(installedResult()),
      uninstallCodexPlugin: jest.fn().mockResolvedValue(false),
    });
    jest.spyOn(window, 'confirm').mockReturnValue(true);
    const { containerEl } = renderSection(adapter);
    await flush();

    containerEl
      .querySelector<HTMLButtonElement>(
        '[data-codex-plugins-group="installed"] [data-plugin-id="gamma"] .opencodian-codex-plugin-uninstall',
      )!
      .click();
    await flush();

    expect(capturedNotices.join('\n')).toContain(t('settings.codex.plugins.uninstallFailed'));
    expect(adapter.reconcileCodexPlugins).not.toHaveBeenCalled();
  });

  it('reconciles from the header button and reports counts', async () => {
    const adapter = createAdapter({
      listCodexPlugins: jest.fn().mockResolvedValue(marketplaceResult()),
      listInstalledCodexPlugins: jest.fn().mockResolvedValue(installedResult()),
      reconcileCodexPlugins: jest.fn().mockResolvedValue({
        changedPlugins: [{ id: 'gamma' }],
        failedRemotePluginIds: ['delta'],
        failedMaterializationRemotePluginIds: [],
      }),
    });
    const { containerEl } = renderSection(adapter);
    await flush();

    containerEl
      .querySelector<HTMLButtonElement>('.opencodian-codex-plugins-reconcile')!
      .click();
    await flush();

    expect(adapter.reconcileCodexPlugins).toHaveBeenCalledTimes(1);
    expect(capturedNotices.join('\n')).toContain(
      t('settings.codex.plugins.reconcileDone', { changed: '1', failed: '1' }),
    );
    // Lists reload after reconcile.
    expect(adapter.listCodexPlugins.mock.calls.length).toBeGreaterThanOrEqual(2);
  });

  it('shows a failure notice when reconcile returns null', async () => {
    const adapter = createAdapter({
      reconcileCodexPlugins: jest.fn().mockResolvedValue(null),
    });
    const { containerEl } = renderSection(adapter);
    await flush();

    containerEl
      .querySelector<HTMLButtonElement>('.opencodian-codex-plugins-reconcile')!
      .click();
    await flush();

    expect(capturedNotices.join('\n')).toContain(t('settings.codex.plugins.reconcileFailed'));
  });
});

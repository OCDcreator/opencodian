import { SettingsPluginUpdateSection } from '../../../../src/features/settings/SettingsPluginUpdateSection';
import { setLocale } from '../../../../src/i18n';

function createSnapshot(overrides: Record<string, unknown> = {}) {
  return {
    status: 'ready' as const,
    source: 'github' as const,
    currentVersion: '1.1.0',
    latestRelease: {
      kind: 'release' as const,
      source: 'github' as const,
      version: '1.2.0',
      tagName: 'v1.2.0',
      publishedAt: '2026-07-27T00:00:00Z',
      releaseUrl: null,
      minAppVersion: '1.4.5',
      compatible: true,
      installable: true,
      unavailableReason: null,
    },
    releases: [
      {
        kind: 'release' as const,
        source: 'github' as const,
        version: '1.2.0',
        tagName: 'v1.2.0',
        publishedAt: '2026-07-27T00:00:00Z',
        releaseUrl: null,
        minAppVersion: '1.4.5',
        compatible: true,
        installable: true,
        unavailableReason: null,
      },
      {
        kind: 'release' as const,
        source: 'github' as const,
        version: '1.3.0',
        tagName: 'v1.3.0',
        publishedAt: null,
        releaseUrl: null,
        minAppVersion: '9.0.0',
        compatible: false,
        installable: false,
        unavailableReason: 'Requires Obsidian 9.0.0 or later.',
      },
    ],
    backups: [{
      kind: 'backup' as const,
      id: '1000-1-1.0.0',
      version: '1.0.0',
      capturedAt: 0,
      minAppVersion: '1.4.5',
      compatible: true,
      installable: true,
      unavailableReason: null,
    }],
    error: null,
    isApplying: false,
    ...overrides,
  };
}

function createSection(snapshot = createSnapshot()) {
  const service = {
    getSnapshot: jest.fn(() => snapshot),
    checkForUpdates: jest.fn().mockResolvedValue(snapshot),
    installRelease: jest.fn().mockResolvedValue({ installedVersion: '1.2.0' }),
    restoreBackup: jest.fn().mockResolvedValue({ installedVersion: '1.0.0' }),
  };
  const refresh = jest.fn();
  const section = new SettingsPluginUpdateSection({
    plugin: { pluginUpdateService: service } as never,
    requestDisplayRefresh: refresh,
  });
  return { section, service, refresh };
}

describe('SettingsPluginUpdateSection', () => {
  beforeEach(() => {
    setLocale('en');
    document.body.innerHTML = '';
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  it('renders separate stable-release and local-backup lists, with incompatible releases disabled', () => {
    const { section } = createSection();
    const containerEl = document.createElement('div');

    section.render(containerEl);

    expect(containerEl.querySelector('[data-plugin-update-list="releases"] [data-plugin-update-version="1.2.0"]')).not.toBeNull();
    expect(containerEl.querySelector('[data-plugin-update-list="backups"] [data-plugin-update-backup="1000-1-1.0.0"]')).not.toBeNull();
    const incompatibleButton = containerEl.querySelector<HTMLButtonElement>('[data-plugin-update-version="1.3.0"] button');
    expect(incompatibleButton?.disabled).toBe(true);
  });

  it('groups the title and description before the flat status panel', () => {
    const { section } = createSection();
    const containerEl = document.createElement('div');

    section.render(containerEl);

    const sectionEl = containerEl.querySelector<HTMLElement>('.opencodian-plugin-update-section');
    const headingGroupEl = sectionEl?.querySelector<HTMLElement>(':scope > .opencodian-plugin-update-heading');
    const headingEl = headingGroupEl?.querySelector<HTMLElement>(':scope > .opencodian-settings-subsection-heading');

    expect(headingEl).not.toBeNull();
    expect(sectionEl?.querySelectorAll(':scope > .opencodian-settings-subsection-heading')).toHaveLength(0);
    expect(headingGroupEl?.querySelector(':scope > .opencodian-plugin-update-description')).not.toBeNull();
    expect(headingGroupEl?.nextElementSibling?.classList.contains('opencodian-plugin-update-panel')).toBe(true);
  });

  it('renders check failure and applying states without allowing duplicate actions', () => {
    const { section } = createSection(createSnapshot({
      status: 'error',
      error: 'offline',
      isApplying: true,
    }));
    const containerEl = document.createElement('div');

    section.render(containerEl);

    expect(containerEl.querySelector<HTMLElement>('[data-plugin-update-status="error"]')?.textContent).toContain('offline');
    expect(containerEl.querySelector<HTMLElement>('.opencodian-plugin-update-section')?.dataset.pluginUpdateApplying).toBe('true');
    expect(containerEl.querySelector<HTMLButtonElement>('[data-plugin-update-action="check"]')?.disabled).toBe(true);
    expect(containerEl.querySelector<HTMLButtonElement>('[data-plugin-update-action="install-latest"]')?.disabled).toBe(true);
  });

  it('uses localized downgrade copy and requires a separate confirmation for backup restore', async () => {
    const snapshot = createSnapshot();
    snapshot.currentVersion = '2.0.0';
    const { section, service } = createSection(snapshot);
    const confirm = jest.spyOn(window, 'confirm').mockReturnValue(false);
    const containerEl = document.createElement('div');

    section.render(containerEl);

    expect(containerEl.textContent).toContain('will downgrade');
    containerEl.querySelector<HTMLButtonElement>('[data-plugin-update-action="restore-backup"]')?.click();
    await Promise.resolve();
    expect(service.restoreBackup).not.toHaveBeenCalled();

    setLocale('zh');
    const zhContainerEl = document.createElement('div');
    section.render(zhContainerEl);
    expect(zhContainerEl.textContent).toContain('插件版本管理');
    expect(confirm).toHaveBeenCalledWith(expect.stringContaining('Restore local OpenCodian'));
  });

  it('fails closed when the install confirmation is declined', async () => {
    const { section, service, refresh } = createSection();
    jest.spyOn(window, 'confirm').mockReturnValue(false);
    const containerEl = document.createElement('div');
    section.render(containerEl);

    containerEl.querySelector<HTMLButtonElement>('[data-plugin-update-action="install-latest"]')?.click();
    await Promise.resolve();

    expect(service.installRelease).not.toHaveBeenCalled();
    expect(refresh).not.toHaveBeenCalled();
  });

  it('installs a selected release only after confirmation and refreshes the settings surface', async () => {
    const { section, service, refresh } = createSection();
    jest.spyOn(window, 'confirm').mockReturnValue(true);
    const containerEl = document.createElement('div');
    section.render(containerEl);

    containerEl.querySelector<HTMLButtonElement>('[data-plugin-update-action="install-latest"]')?.click();
    await Promise.resolve();
    await Promise.resolve();

    expect(service.installRelease).toHaveBeenCalledWith('1.2.0');
    expect(refresh).toHaveBeenCalledTimes(2);
  });
});

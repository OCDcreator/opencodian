import type { PluginUpdateSnapshot } from '../../../../src/core/update/PluginUpdateService';
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

function createSection(
  snapshot = createSnapshot(),
  options: { isExpanded?: boolean; onExpandedChange?: (isExpanded: boolean) => void } = {},
) {
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
    isExpanded: options.isExpanded,
    onExpandedChange: options.onExpandedChange,
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

  it('limits history to three and expands in batches without losing keyboard focus', () => {
    const snapshot = createSnapshot();
    snapshot.releases = Array.from({ length: 8 }, (_, index) => ({ ...snapshot.releases[0], version: `1.2.${8 - index}` }));
    const { section } = createSection(snapshot, { isExpanded: true });
    const root = document.body.createDiv();
    section.render(root);
    const rows = () => root.querySelectorAll('[data-plugin-update-list="releases"] > div');
    const more = root.querySelector<HTMLButtonElement>('[data-plugin-update-action="show-more"]')!;
    const less = root.querySelector<HTMLButtonElement>('[data-plugin-update-action="show-less"]')!;
    expect(rows()).toHaveLength(3);
    more.focus(); more.click();
    expect(rows()).toHaveLength(6);
    expect(document.activeElement).toBe(more);
    more.click();
    expect(rows()).toHaveLength(8);
    expect(document.activeElement).toBe(less);
    less.click();
    expect(rows()).toHaveLength(3);
    expect(document.activeElement).toBe(more);
  });

  it('shows ongoing progress and disables actions while the download remains pending', async () => {
    const { section, service, refresh } = createSection(createSnapshot());
    let state = createSnapshot() as PluginUpdateSnapshot;
    let publish: ((snapshot: PluginUpdateSnapshot) => void) | undefined;
    let resolve!: (result: { installedVersion: string }) => void;
    const pending = new Promise<{ installedVersion: string }>((done) => { resolve = done; });
    const dispose = jest.fn(() => { publish = undefined; });
    Object.assign(service, { onProgress: (listener: typeof publish) => { publish = listener; return { dispose }; } });
    service.getSnapshot.mockImplementation(() => state as ReturnType<typeof createSnapshot>);
    service.installRelease.mockImplementation(() => {
      state = { ...state, isApplying: true, progress: { phase: 'preparing', version: '1.2.0' } };
      publish?.(state);
      return pending;
    });
    jest.spyOn(window, 'confirm').mockReturnValue(true);
    const root = document.body.createDiv();
    section.render(root);
    const install = root.querySelector<HTMLButtonElement>('[data-plugin-update-action="install-latest"]')!;
    install.click();
    expect(root.querySelector<HTMLProgressElement>('progress')?.hidden).toBe(false);
    expect(root.querySelector('progress')?.hasAttribute('value')).toBe(false);
    expect(install.disabled).toBe(true);
    expect(root.querySelector('[aria-expanded]')?.getAttribute('aria-expanded')).toBe('true');
    state = { ...state, progress: { phase: 'downloading', version: '1.2.0', assetName: 'main.js', completedFiles: 0, totalFiles: 3 } };
    publish?.(state);
    expect(root.textContent).toContain('Downloading main.js');
    expect(root.querySelector('[data-plugin-update-action="install-latest"]')).toBe(install);
    install.click();
    expect(service.installRelease).toHaveBeenCalledTimes(1);
    expect(refresh).not.toHaveBeenCalled();
    section.dispose();
    resolve({ installedVersion: '1.2.0' });
    await Promise.resolve(); await Promise.resolve();
    expect(dispose).toHaveBeenCalledTimes(1);
    expect(refresh).not.toHaveBeenCalled();
  });

  it('keeps newly revealed history actions disabled during a pending update check', () => {
    let state = createSnapshot();
    state.releases = Array.from({ length: 8 }, (_, i) => ({ ...state.releases[0], version: `1.2.${i}` }));
    const { section, service } = createSection(state, { isExpanded: true });
    let publish!: (next: PluginUpdateSnapshot) => void;
    Object.assign(service, { onProgress: (listener: typeof publish) => { publish = listener; return { dispose: jest.fn() }; } });
    service.getSnapshot.mockImplementation(() => state);
    const root = document.body.createDiv();
    section.render(root);
    state = { ...state, status: 'checking' } as ReturnType<typeof createSnapshot>;
    publish(state as PluginUpdateSnapshot);
    root.querySelector<HTMLButtonElement>('[data-plugin-update-action="show-more"]')!.click();
    expect(root.querySelectorAll('[data-plugin-update-action="install-release"]')).toHaveLength(6);
    expect(Array.from(root.querySelectorAll<HTMLButtonElement>('[data-plugin-update-action="install-release"]')).every((b) => b.disabled)).toBe(true);
    root.querySelector<HTMLButtonElement>('[data-plugin-update-action="show-less"]')!.click();
    expect(Array.from(root.querySelectorAll<HTMLButtonElement>('[data-plugin-update-action="install-release"]')).every((b) => b.disabled)).toBe(true);
    section.dispose();
  });

  it('hydrates an ongoing install and shows inline failure after rollback without leaving the bar running', () => {
    const snapshot = createSnapshot({ isApplying: true, progress: { phase: 'restoring-original', version: '1.2.0' } });
    const { section, service, refresh } = createSection(snapshot);
    let publish!: (next: PluginUpdateSnapshot) => void;
    Object.assign(service, { onProgress: (listener: typeof publish) => { publish = listener; return { dispose: jest.fn() }; } });
    const root = document.body.createDiv();
    section.render(root);
    expect(root.textContent).toContain('Restoring the original version');
    publish({ ...snapshot, isApplying: false, error: 'disk full', progress: { phase: 'failed', version: '1.2.0' } } as PluginUpdateSnapshot);
    expect(root.textContent).toContain('Installation failed: disk full');
    expect(root.querySelector<HTMLProgressElement>('progress')?.hidden).toBe(true);
    expect(root.querySelector<HTMLButtonElement>('[data-plugin-update-action="install-latest"]')?.disabled).toBe(false);
    expect(refresh).toHaveBeenCalledTimes(1);
    section.dispose();
  });

});

describe('SettingsPluginUpdateSection existing controls', () => {
  beforeEach(() => { setLocale('en'); document.body.innerHTML = ''; });
  afterEach(() => { jest.restoreAllMocks(); });

  it('renders separate stable-release and local-backup lists, with incompatible releases disabled', () => {
    const { section } = createSection();
    const containerEl = document.createElement('div');

    section.render(containerEl);

    expect(containerEl.querySelector('[data-plugin-update-list="releases"] [data-plugin-update-version="1.2.0"]')).not.toBeNull();
    expect(containerEl.querySelector('[data-plugin-update-list="backups"] [data-plugin-update-backup="1000-1-1.0.0"]')).not.toBeNull();
    const incompatibleButton = containerEl.querySelector<HTMLButtonElement>('[data-plugin-update-version="1.3.0"] button');
    expect(incompatibleButton?.disabled).toBe(true);
  });

  it('renders a collapsed disclosure with the description inside its content wrapper', () => {
    const { section } = createSection();
    const containerEl = document.createElement('div');

    section.render(containerEl);

    const sectionEl = containerEl.querySelector<HTMLElement>('.opencodian-plugin-update-section');
    const headingEl = sectionEl?.querySelector<HTMLElement>(':scope > .opencodian-settings-subsection-heading');
    const headerButton = headingEl?.querySelector<HTMLButtonElement>(':scope > button');
    const contentEl = sectionEl?.querySelector<HTMLElement>(':scope > .opencodian-plugin-update-content');

    expect(headingEl).not.toBeNull();
    expect(headerButton?.getAttribute('aria-expanded')).toBe('false');
    expect(contentEl?.getAttribute('aria-hidden')).toBe('true');
    expect(contentEl?.hasAttribute('inert')).toBe(true);
    expect(contentEl?.querySelector('.opencodian-plugin-update-description')).not.toBeNull();
  });

  it('toggles from the full header button without rebuilding or losing focus', () => {
    const onExpandedChange = jest.fn();
    const { section } = createSection(createSnapshot(), { onExpandedChange });
    const containerEl = document.createElement('div');
    document.body.append(containerEl);
    section.render(containerEl);

    const headerButton = containerEl.querySelector<HTMLButtonElement>('.opencodian-plugin-update-heading-button');
    const contentEl = containerEl.querySelector<HTMLElement>('.opencodian-plugin-update-content');
    headerButton?.focus();
    headerButton?.click();

    expect(document.activeElement).toBe(headerButton);
    expect(headerButton?.getAttribute('aria-expanded')).toBe('true');
    expect(contentEl?.getAttribute('aria-hidden')).toBe('false');
    expect(contentEl?.hasAttribute('inert')).toBe(false);
    expect(onExpandedChange).toHaveBeenCalledWith(true);
  });

  it('keeps installed version and status badge in the header without duplicates', () => {
    const { section } = createSection();
    const containerEl = document.createElement('div');
    section.render(containerEl);

    const sectionEl = containerEl.querySelector<HTMLElement>('.opencodian-plugin-update-section');
    const headingEl = sectionEl?.querySelector<HTMLElement>('.opencodian-settings-subsection-heading');
    expect(headingEl?.querySelector('.opencodian-plugin-update-version-value')?.textContent).toBe('1.1.0');
    expect(headingEl?.querySelector('[data-plugin-update-badge="update"]')).not.toBeNull();
    expect(sectionEl?.querySelectorAll('.opencodian-plugin-update-version-value')).toHaveLength(1);
    expect(sectionEl?.querySelectorAll('[data-plugin-update-badge]')).toHaveLength(1);
  });

  it('uses localized expand and collapse assistive text', () => {
    const { section } = createSection();
    const containerEl = document.createElement('div');
    section.render(containerEl);
    const headerButton = containerEl.querySelector<HTMLButtonElement>('.opencodian-plugin-update-heading-button');
    expect(headerButton?.getAttribute('aria-label')).toContain('Expand');

    setLocale('zh');
    const zhContainerEl = document.createElement('div');
    createSection(createSnapshot(), { isExpanded: true }).section.render(zhContainerEl);
    expect(zhContainerEl.querySelector<HTMLButtonElement>('.opencodian-plugin-update-heading-button')?.getAttribute('aria-label')).toContain('收起');
  });

  it('retains the ephemeral expanded state when an operation re-renders the section', () => {
    let isExpanded = false;
    const first = createSection(createSnapshot(), { onExpandedChange: (value) => { isExpanded = value; } }).section;
    const firstContainerEl = document.createElement('div');
    first.render(firstContainerEl);
    firstContainerEl.querySelector<HTMLButtonElement>('.opencodian-plugin-update-heading-button')?.click();

    const second = createSection(createSnapshot(), { isExpanded, onExpandedChange: (value) => { isExpanded = value; } }).section;
    const secondContainerEl = document.createElement('div');
    second.render(secondContainerEl);
    expect(secondContainerEl.querySelector<HTMLButtonElement>('.opencodian-plugin-update-heading-button')?.getAttribute('aria-expanded')).toBe('true');
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
    expect(refresh).toHaveBeenCalledTimes(1);
  });
});

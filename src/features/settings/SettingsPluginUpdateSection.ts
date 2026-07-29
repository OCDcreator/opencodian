import { Notice, setIcon } from 'obsidian';

import { comparePluginVersions, type PluginUpdateBackup, type PluginUpdateRelease, type PluginUpdateSnapshot } from '../../core/update/PluginUpdateService';
import { t } from '../../i18n';
import type OpenCodianPlugin from '../../main';

interface SettingsPluginUpdateSectionOptions {
  plugin: OpenCodianPlugin;
  requestDisplayRefresh: () => void;
  isExpanded?: boolean;
  onExpandedChange?: (isExpanded: boolean) => void;
}

type PluginUpdateBadgeVariant = 'idle' | 'checking' | 'error' | 'empty' | 'update' | 'current';

let pluginUpdateSectionId = 0;

/** Renders the self-update controls shared by classic and tabbed General settings. */
export class SettingsPluginUpdateSection {
  private readonly plugin: OpenCodianPlugin;
  private readonly requestDisplayRefresh: () => void;
  private readonly isExpanded: boolean;
  private readonly onExpandedChange: (isExpanded: boolean) => void;

  constructor(options: SettingsPluginUpdateSectionOptions) {
    this.plugin = options.plugin;
    this.requestDisplayRefresh = options.requestDisplayRefresh;
    this.isExpanded = options.isExpanded ?? false;
    this.onExpandedChange = options.onExpandedChange ?? (() => {});
  }

  render(containerEl: HTMLElement): void {
    const service = this.plugin.pluginUpdateService;
    const snapshot = service.getSnapshot();
    const sectionEl = containerEl.createDiv({
      cls: 'opencodian-plugin-update-section',
      attr: {
        'data-plugin-update-status': snapshot.status,
        'data-plugin-update-source': snapshot.source ?? '',
        'data-plugin-update-applying': String(snapshot.isApplying),
      },
    });
    let isExpanded = this.isExpanded;
    const contentId = `opencodian-plugin-update-content-${++pluginUpdateSectionId}`;
    const headingEl = sectionEl.createEl('h4', { cls: 'opencodian-settings-subsection-heading' });
    const headerButton = headingEl.createEl('button', {
      cls: 'opencodian-plugin-update-heading-button',
      attr: {
        type: 'button',
        'aria-expanded': String(isExpanded),
        'aria-controls': contentId,
      },
    });
    const iconEl = headerButton.createSpan({ cls: 'opencodian-plugin-update-heading-icon', attr: { 'aria-hidden': 'true' } });
    headerButton.createSpan({ cls: 'opencodian-plugin-update-heading-title', text: t('settings.pluginUpdate.title') });
    const headerMetaEl = headerButton.createDiv({ cls: 'opencodian-plugin-update-heading-meta' });
    const versionBlockEl = headerMetaEl.createDiv({ cls: 'opencodian-plugin-update-version-block' });
    versionBlockEl.createDiv({
      cls: 'opencodian-plugin-update-version-label',
      text: t('settings.pluginUpdate.currentVersionLabel'),
    });
    versionBlockEl.createDiv({
      cls: 'opencodian-plugin-update-version-value',
      text: snapshot.currentVersion,
    });

    const badge = this.badgeFor(snapshot);
    const badgeEl = headerMetaEl.createSpan({
      cls: 'opencodian-plugin-update-status-badge',
      attr: { 'data-plugin-update-badge': badge.variant },
    });
    badgeEl.createSpan({ cls: 'opencodian-plugin-update-status-dot', attr: { 'aria-hidden': 'true' } });
    badgeEl.createSpan({ cls: 'opencodian-plugin-update-status-badge-text', text: badge.label });

    const contentEl = sectionEl.createDiv({
      cls: 'opencodian-plugin-update-content',
      attr: { id: contentId },
    });
    const contentInnerEl = contentEl.createDiv({ cls: 'opencodian-plugin-update-content-inner' });
    contentInnerEl.createDiv({
      cls: 'opencodian-plugin-update-description',
      text: t('settings.pluginUpdate.desc'),
    });
    const panelEl = contentInnerEl.createDiv({ cls: 'opencodian-plugin-update-panel' });

    const applyExpandedState = (expanded: boolean): void => {
      headerButton.setAttribute('aria-expanded', String(expanded));
      headerButton.setAttribute(
        'aria-label',
        `${t('settings.pluginUpdate.title')}: ${t(expanded ? 'settings.pluginUpdate.collapse' : 'settings.pluginUpdate.expand')}`,
      );
      setIcon(iconEl, expanded ? 'chevron-down' : 'chevron-right');
      contentEl.setAttribute('aria-hidden', String(!expanded));
      contentEl.toggleAttribute('inert', !expanded);
      (contentEl as HTMLElement & { inert?: boolean }).inert = !expanded;
    };
    applyExpandedState(isExpanded);
    headerButton.addEventListener('click', () => {
      isExpanded = !isExpanded;
      applyExpandedState(isExpanded);
      this.onExpandedChange(isExpanded);
    });

    this.renderStatusDetail(panelEl, snapshot);

    const actionsEl = panelEl.createDiv({ cls: 'opencodian-plugin-update-actions' });
    this.createButton(actionsEl, {
      text: t('settings.pluginUpdate.checkButton'),
      disabled: snapshot.status === 'checking' || snapshot.isApplying,
      onClick: () => { void this.check(); },
      action: 'check',
    });
    this.renderLatestAction(actionsEl, snapshot.latestRelease, snapshot.currentVersion, snapshot.isApplying);

    if (snapshot.status === 'ready') {
      this.renderReleaseList(contentInnerEl, snapshot.releases, snapshot.currentVersion, snapshot.isApplying);
      this.renderBackupList(contentInnerEl, snapshot.backups, snapshot.isApplying);
    }

    if (snapshot.status === 'idle') {
      void this.check();
    }
  }

  private renderStatusDetail(panelEl: HTMLElement, snapshot: PluginUpdateSnapshot): void {
    if (snapshot.status === 'error') {
      const detailEl = panelEl.createDiv({
        cls: 'opencodian-plugin-update-status-detail is-error',
        attr: { 'data-plugin-update-state': 'error', role: 'alert' },
      });
      detailEl.createDiv({
        cls: 'opencodian-plugin-update-error-label',
        text: t('settings.pluginUpdate.errorLabel'),
      });
      detailEl.createDiv({
        cls: 'opencodian-plugin-update-error-raw',
        text: snapshot.error ?? t('settings.pluginUpdate.status.unknown'),
      });
      return;
    }
    panelEl.createDiv({
      cls: 'opencodian-plugin-update-status-detail',
      attr: { 'data-plugin-update-state': snapshot.status, role: 'status' },
      text: this.statusText(snapshot),
    });
  }

  private statusText(snapshot: PluginUpdateSnapshot): string {
    if (snapshot.status === 'checking') return t('settings.pluginUpdate.status.checking');
    if (snapshot.status === 'ready') {
      if (!snapshot.latestRelease) return t('settings.pluginUpdate.status.empty');
      return t('settings.pluginUpdate.status.ready', {
        version: snapshot.latestRelease.version,
        source: snapshot.latestRelease.source === 'github' ? 'GitHub' : 'Gitea',
      });
    }
    return t('settings.pluginUpdate.status.idle');
  }

  private badgeFor(snapshot: PluginUpdateSnapshot): { variant: PluginUpdateBadgeVariant; label: string } {
    if (snapshot.status === 'checking') {
      return { variant: 'checking', label: t('settings.pluginUpdate.badge.checking') };
    }
    if (snapshot.status === 'error') {
      return { variant: 'error', label: t('settings.pluginUpdate.badge.error') };
    }
    if (snapshot.status === 'ready') {
      if (!snapshot.latestRelease) {
        return { variant: 'empty', label: t('settings.pluginUpdate.badge.empty') };
      }
      return this.isUpdateAvailable(snapshot.currentVersion, snapshot.latestRelease.version)
        ? { variant: 'update', label: t('settings.pluginUpdate.badge.update') }
        : { variant: 'current', label: t('settings.pluginUpdate.badge.current') };
    }
    return { variant: 'idle', label: t('settings.pluginUpdate.badge.idle') };
  }

  private isUpdateAvailable(currentVersion: string, latestVersion: string): boolean {
    try {
      return comparePluginVersions(latestVersion, currentVersion) > 0;
    } catch {
      return latestVersion !== currentVersion;
    }
  }

  private renderLatestAction(
    containerEl: HTMLElement,
    latest: PluginUpdateRelease | null,
    currentVersion: string,
    isApplying: boolean,
  ): void {
    if (!latest) return;
    const downgrade = this.isDowngrade(currentVersion, latest.version);
    const button = this.createButton(containerEl, {
      text: t('settings.pluginUpdate.installLatest', { version: latest.version }),
      disabled: !latest.installable || isApplying,
      cta: true,
      onClick: () => { void this.installRelease(latest); },
      action: 'install-latest',
    });
    if (!latest.installable) {
      button.title = latest.unavailableReason ?? t('settings.pluginUpdate.unavailable');
    } else if (downgrade) {
      containerEl.createDiv({
        cls: 'opencodian-plugin-update-downgrade-note',
        text: t('settings.pluginUpdate.downgradeNote', { version: latest.version }),
      });
    }
  }

  private renderReleaseList(
    sectionEl: HTMLElement,
    releases: readonly PluginUpdateRelease[],
    currentVersion: string,
    isApplying: boolean,
  ): void {
    const groupEl = sectionEl.createDiv({ cls: 'opencodian-plugin-update-list-group' });
    groupEl.createEl('h5', { text: t('settings.pluginUpdate.releaseHistory') });
    if (releases.length === 0) {
      groupEl.createDiv({ cls: 'opencodian-plugin-update-empty', text: t('settings.pluginUpdate.noReleases') });
      return;
    }
    const listEl = groupEl.createDiv({ cls: 'opencodian-plugin-update-list', attr: { 'data-plugin-update-list': 'releases' } });
    for (const release of releases) {
      const rowEl = this.createVersionRow(listEl, {
        version: release.version,
        detail: release.publishedAt
          ? t('settings.pluginUpdate.releaseMeta', { source: release.source === 'github' ? 'GitHub' : 'Gitea', date: this.formatDate(release.publishedAt) })
          : t('settings.pluginUpdate.releaseSource', { source: release.source === 'github' ? 'GitHub' : 'Gitea' }),
        source: 'release',
        unavailableReason: release.unavailableReason,
        disabled: !release.installable || isApplying,
        currentVersion,
        actionLabel: t('settings.pluginUpdate.installVersion'),
        onClick: () => { void this.installRelease(release); },
      });
      rowEl.dataset.pluginUpdateVersion = release.version;
      rowEl.dataset.pluginUpdateCompatible = String(release.compatible);
    }
  }

  private renderBackupList(
    sectionEl: HTMLElement,
    backups: readonly PluginUpdateBackup[],
    isApplying: boolean,
  ): void {
    const groupEl = sectionEl.createDiv({ cls: 'opencodian-plugin-update-list-group' });
    groupEl.createEl('h5', { text: t('settings.pluginUpdate.localBackups') });
    groupEl.createDiv({ cls: 'opencodian-plugin-update-list-description', text: t('settings.pluginUpdate.localBackupsDesc') });
    if (backups.length === 0) {
      groupEl.createDiv({ cls: 'opencodian-plugin-update-empty', text: t('settings.pluginUpdate.noBackups') });
      return;
    }
    const listEl = groupEl.createDiv({ cls: 'opencodian-plugin-update-list', attr: { 'data-plugin-update-list': 'backups' } });
    for (const backup of backups) {
      const rowEl = this.createVersionRow(listEl, {
        version: backup.version,
        detail: t('settings.pluginUpdate.backupMeta', { date: this.formatDate(backup.capturedAt) }),
        source: 'backup',
        unavailableReason: backup.unavailableReason,
        disabled: !backup.installable || isApplying,
        currentVersion: this.plugin.pluginUpdateService.getSnapshot().currentVersion,
        actionLabel: t('settings.pluginUpdate.restoreVersion'),
        onClick: () => { void this.restoreBackup(backup); },
      });
      rowEl.dataset.pluginUpdateBackup = backup.id;
      rowEl.dataset.pluginUpdateCompatible = String(backup.compatible);
    }
  }

  private createVersionRow(
    containerEl: HTMLElement,
    options: {
      version: string;
      detail: string;
      source: 'release' | 'backup';
      unavailableReason: string | null;
      disabled: boolean;
      currentVersion: string;
      actionLabel: string;
      onClick: () => void;
    },
  ): HTMLElement {
    const rowEl = containerEl.createDiv({
      cls: 'opencodian-plugin-update-version-row',
      attr: { 'data-plugin-update-entry-source': options.source },
    });
    const identityEl = rowEl.createDiv({ cls: 'opencodian-plugin-update-version-identity' });
    identityEl.createSpan({ cls: 'opencodian-plugin-update-version', text: options.version });
    if (options.version === options.currentVersion) {
      identityEl.createSpan({ cls: 'opencodian-plugin-update-current-badge', text: t('settings.pluginUpdate.currentBadge') });
    }
    identityEl.createDiv({ cls: 'opencodian-plugin-update-version-meta', text: options.detail });
    if (options.unavailableReason) {
      identityEl.createDiv({ cls: 'opencodian-plugin-update-version-error', text: options.unavailableReason });
    }
    this.createButton(rowEl, {
      text: options.actionLabel,
      disabled: options.disabled,
      onClick: options.onClick,
      action: options.source === 'backup' ? 'restore-backup' : 'install-release',
    });
    return rowEl;
  }

  private createButton(
    containerEl: HTMLElement,
    options: { text: string; disabled: boolean; onClick: () => void; action: string; cta?: boolean },
  ): HTMLButtonElement {
    const button = containerEl.createEl('button', {
      cls: `opencodian-plugin-update-button${options.cta ? ' mod-cta' : ''}`,
      text: options.text,
      attr: { type: 'button', 'data-plugin-update-action': options.action },
    });
    button.disabled = options.disabled;
    button.addEventListener('click', options.onClick);
    return button;
  }

  private async check(): Promise<void> {
    const operation = this.plugin.pluginUpdateService.checkForUpdates();
    this.requestDisplayRefresh();
    try {
      await operation;
    } finally {
      this.requestDisplayRefresh();
    }
  }

  private async installRelease(release: PluginUpdateRelease): Promise<void> {
    const downgrade = this.isDowngrade(this.plugin.pluginUpdateService.getSnapshot().currentVersion, release.version);
    const message = downgrade
      ? t('settings.pluginUpdate.confirmDowngrade', { version: release.version })
      : t('settings.pluginUpdate.confirmInstall', { version: release.version });
    if (!window.confirm(message)) return;
    try {
      const operation = this.plugin.pluginUpdateService.installRelease(release.version);
      this.requestDisplayRefresh();
      const result = await operation;
      new Notice(t('settings.pluginUpdate.success', { version: result.installedVersion }));
    } catch (error) {
      new Notice(t('settings.pluginUpdate.failure', { error: error instanceof Error ? error.message : t('settings.pluginUpdate.status.unknown') }));
    } finally {
      this.requestDisplayRefresh();
    }
  }

  private async restoreBackup(backup: PluginUpdateBackup): Promise<void> {
    if (!window.confirm(t('settings.pluginUpdate.confirmRestore', { version: backup.version }))) return;
    try {
      const operation = this.plugin.pluginUpdateService.restoreBackup(backup.id);
      this.requestDisplayRefresh();
      const result = await operation;
      new Notice(t('settings.pluginUpdate.success', { version: result.installedVersion }));
    } catch (error) {
      new Notice(t('settings.pluginUpdate.failure', { error: error instanceof Error ? error.message : t('settings.pluginUpdate.status.unknown') }));
    } finally {
      this.requestDisplayRefresh();
    }
  }

  private isDowngrade(currentVersion: string, targetVersion: string): boolean {
    try {
      return comparePluginVersions(targetVersion, currentVersion) < 0;
    } catch {
      return false;
    }
  }

  private formatDate(value: number | string): string {
    const date = new Date(value);
    return Number.isNaN(date.getTime()) ? t('settings.pluginUpdate.unknownDate') : date.toLocaleString();
  }
}

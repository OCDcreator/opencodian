import { Notice, setIcon,Setting } from 'obsidian';

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
const RELEASE_HISTORY_PAGE_SIZE = 3;

/** Renders the self-update controls shared by classic and tabbed General settings. */
export class SettingsPluginUpdateSection {
  private readonly plugin: OpenCodianPlugin;
  private readonly requestDisplayRefresh: () => void;
  private readonly isExpanded: boolean;
  private readonly onExpandedChange: (isExpanded: boolean) => void;
  private progressSubscription?: { dispose(): void };
  private renderToken: object | null = null;

  constructor(options: SettingsPluginUpdateSectionOptions) {
    this.plugin = options.plugin;
    this.requestDisplayRefresh = options.requestDisplayRefresh;
    this.isExpanded = options.isExpanded ?? false;
    this.onExpandedChange = options.onExpandedChange ?? (() => {});
  }

  render(containerEl: HTMLElement): void {
    this.dispose();
    const renderToken = this.renderToken = {};
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
    let isExpanded = this.isExpanded || snapshot.isApplying;
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
    const versionEl = versionBlockEl.createDiv({
      cls: 'opencodian-plugin-update-version-value',
      text: snapshot.currentVersion,
    });

    const badge = this.badgeFor(snapshot);
    const badgeEl = headerMetaEl.createSpan({
      cls: 'opencodian-plugin-update-status-badge',
      attr: { 'data-plugin-update-badge': badge.variant },
    });
    badgeEl.createSpan({ cls: 'opencodian-plugin-update-status-dot', attr: { 'aria-hidden': 'true' } });
    const badgeTextEl = badgeEl.createSpan({ cls: 'opencodian-plugin-update-status-badge-text', text: badge.label });

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
    if (snapshot.isApplying) this.onExpandedChange(true);
    headerButton.addEventListener('click', () => {
      isExpanded = !isExpanded;
      applyExpandedState(isExpanded);
      this.onExpandedChange(isExpanded);
    });

    this.renderStatusDetail(panelEl, snapshot);

    new Setting(panelEl)
      .setName(t('settings.pluginUpdate.autoInstallToggle'))
      .setDesc(t('settings.pluginUpdate.autoInstallToggleDesc'))
      .addToggle((toggle) => {
        toggle
          .setValue(this.plugin.settings.pluginUpdateAutoInstall)
          .onChange(async (value) => {
            this.plugin.settings.pluginUpdateAutoInstall = value;
            await this.plugin.saveSettings();
          });
      });

    const actionsEl = panelEl.createDiv({ cls: 'opencodian-plugin-update-actions' });
    this.createButton(actionsEl, {
      text: t('settings.pluginUpdate.checkButton'),
      disabled: snapshot.status === 'checking' || snapshot.isApplying,
      onClick: () => { void this.check(); },
      action: 'check',
    });
    this.renderLatestAction(actionsEl, snapshot.latestRelease, snapshot.currentVersion, snapshot.isApplying);
    const updateProgress = this.renderProgress(panelEl);

    if (snapshot.status === 'ready') {
      this.renderReleaseList(contentInnerEl, snapshot.releases, snapshot.currentVersion);
      this.renderBackupList(contentInnerEl, snapshot.backups, snapshot.isApplying);
    }

    let wasApplying = snapshot.isApplying;
    let wasChecking = snapshot.status === 'checking';
    const refreshProgress = (next: PluginUpdateSnapshot): void => {
      if (this.renderToken !== renderToken) return;
      if (next.isApplying && !wasApplying) {
        isExpanded = true;
        applyExpandedState(true);
        this.onExpandedChange(true);
      }
      const settled = wasApplying && !next.isApplying;
      wasApplying = next.isApplying;
      sectionEl.dataset.pluginUpdateApplying = String(next.isApplying);
      sectionEl.dataset.pluginUpdateStatus = next.status;
      if (next.status === 'checking') sectionEl.querySelector<HTMLElement>('.opencodian-plugin-update-status-detail')?.setText(this.statusText(next));
      versionEl.setText(next.currentVersion);
      const nextBadge = this.badgeFor(next);
      badgeEl.dataset.pluginUpdateBadge = nextBadge.variant;
      badgeTextEl.setText(nextBadge.label);
      updateProgress(next);
      this.updateActionAvailability(sectionEl, next);
      if (settled || (wasChecking && next.status !== 'checking')) this.requestDisplayRefresh();
      wasChecking = next.status === 'checking';
    };
    this.progressSubscription = service.onProgress?.(refreshProgress);
    refreshProgress(service.getSnapshot());

    if (snapshot.status === 'idle') {
      void this.check();
    }
  }

  dispose(): void {
    this.renderToken = null;
    this.progressSubscription?.dispose();
    this.progressSubscription = undefined;
  }

  private renderProgress(panelEl: HTMLElement): (snapshot: PluginUpdateSnapshot) => void {
    const progressEl = panelEl.createDiv({ cls: 'opencodian-plugin-update-progress', attr: { 'data-plugin-update-progress': '', hidden: '' } });
    const labelEl = progressEl.createDiv({ cls: 'opencodian-plugin-update-progress-label', attr: { role: 'status', 'aria-live': 'polite', 'aria-atomic': 'true' } });
    const bar = progressEl.createEl('progress', { cls: 'opencodian-plugin-update-progress-bar', attr: { max: '1', 'aria-label': t('settings.pluginUpdate.progress.label') } });
    return (snapshot) => {
      const progress = snapshot.progress;
      progressEl.hidden = !progress && !snapshot.isApplying;
      progressEl.dataset.phase = progress?.phase ?? 'preparing';
      bar.hidden = !snapshot.isApplying;
      bar.removeAttribute('value');
      labelEl.setText(snapshot.isApplying
        ? t(`settings.pluginUpdate.progress.${progress?.phase ?? 'preparing'}`, {
            version: progress?.version ?? '', file: progress?.assetName ?? '',
            count: String(progress?.completedFiles ?? 0), total: String(progress?.totalFiles ?? 3),
          })
        : progress?.phase === 'failed'
          ? t('settings.pluginUpdate.progress.failed', { error: snapshot.error ?? t('settings.pluginUpdate.status.unknown') })
          : t('settings.pluginUpdate.success', { version: progress?.version ?? snapshot.currentVersion }));
    };
  }

  private updateActionAvailability(sectionEl: HTMLElement, snapshot: PluginUpdateSnapshot): void {
    for (const button of Array.from(sectionEl.querySelectorAll<HTMLButtonElement>('[data-plugin-update-action]'))) {
      const action = button.dataset.pluginUpdateAction;
      if (action === 'show-more' || action === 'show-less') continue;
      const row = button.closest<HTMLElement>('[data-plugin-update-entry-source]');
      const installable = action === 'install-latest' ? snapshot.latestRelease?.installable
        : action === 'restore-backup' ? snapshot.backups.find((backup) => backup.id === row?.dataset.pluginUpdateBackup)?.installable
          : action === 'install-release' ? snapshot.releases.find((release) => release.version === row?.dataset.pluginUpdateVersion)?.installable
            : true;
      button.disabled = snapshot.isApplying || snapshot.status === 'checking' || !installable;
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
    if (snapshot.isApplying) return { variant: 'checking', label: t('settings.pluginUpdate.badge.installing') };
    if (snapshot.progress?.phase === 'failed') return { variant: 'error', label: t('settings.pluginUpdate.badge.installFailed') };
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
  ): void {
    const groupEl = sectionEl.createDiv({ cls: 'opencodian-plugin-update-list-group' });
    groupEl.createEl('h5', { text: t('settings.pluginUpdate.releaseHistory') });
    if (releases.length === 0) {
      groupEl.createDiv({ cls: 'opencodian-plugin-update-empty', text: t('settings.pluginUpdate.noReleases') });
      return;
    }
    const listEl = groupEl.createDiv({ cls: 'opencodian-plugin-update-list', attr: { 'data-plugin-update-list': 'releases' } });
    let visibleCount = 0;
    const appendBatch = (): void => {
      const batch = releases.slice(visibleCount, visibleCount + RELEASE_HISTORY_PAGE_SIZE);
      visibleCount += batch.length;
      for (const release of batch) {
      const rowEl = this.createVersionRow(listEl, {
        version: release.version,
        detail: release.publishedAt
          ? t('settings.pluginUpdate.releaseMeta', { source: release.source === 'github' ? 'GitHub' : 'Gitea', date: this.formatDate(release.publishedAt) })
          : t('settings.pluginUpdate.releaseSource', { source: release.source === 'github' ? 'GitHub' : 'Gitea' }),
        source: 'release',
        unavailableReason: release.unavailableReason,
          disabled: !release.installable || this.plugin.pluginUpdateService.getSnapshot().isApplying
            || this.plugin.pluginUpdateService.getSnapshot().status === 'checking',
        currentVersion,
        actionLabel: t('settings.pluginUpdate.installVersion'),
        onClick: () => { void this.installRelease(release); },
      });
      rowEl.dataset.pluginUpdateVersion = release.version;
      rowEl.dataset.pluginUpdateCompatible = String(release.compatible);
      }
    };
    appendBatch();
    if (releases.length <= RELEASE_HISTORY_PAGE_SIZE) return;
    const controls = groupEl.createDiv({ cls: 'opencodian-plugin-update-history-controls' });
    const countEl = controls.createSpan({ attr: { role: 'status' } });
    const updateControls = (): void => {
      more.hidden = visibleCount >= releases.length;
      less.hidden = visibleCount <= RELEASE_HISTORY_PAGE_SIZE;
      countEl.setText(t('settings.pluginUpdate.historyCount', { count: String(visibleCount), total: String(releases.length) }));
    };
    const more = this.createButton(controls, { text: t('settings.pluginUpdate.showMore'), disabled: false, action: 'show-more', onClick: () => {
      appendBatch(); updateControls();
      if (more.hidden) less.focus();
    } });
    const less = this.createButton(controls, { text: t('settings.pluginUpdate.showLess'), disabled: false, action: 'show-less', onClick: () => {
      listEl.empty(); visibleCount = 0; appendBatch(); updateControls(); more.focus();
    } });
    updateControls();
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
    const token = this.renderToken;
    const operation = this.plugin.pluginUpdateService.checkForUpdates();
    if (!this.progressSubscription) this.requestDisplayRefresh();
    try {
      await operation;
    } catch (error) {
      new Notice(t('settings.pluginUpdate.failure', { error: error instanceof Error ? error.message : t('settings.pluginUpdate.status.unknown') }));
    } finally {
      if (this.renderToken === token && !this.progressSubscription) this.requestDisplayRefresh();
    }
  }

  private async installRelease(release: PluginUpdateRelease): Promise<void> {
    const token = this.renderToken;
    const downgrade = this.isDowngrade(this.plugin.pluginUpdateService.getSnapshot().currentVersion, release.version);
    const message = downgrade
      ? t('settings.pluginUpdate.confirmDowngrade', { version: release.version })
      : t('settings.pluginUpdate.confirmInstall', { version: release.version });
    if (!window.confirm(message)) return;
    try {
      const operation = this.plugin.pluginUpdateService.installRelease(release.version);
      const result = await operation;
      new Notice(t('settings.pluginUpdate.success', { version: result.installedVersion }));
    } catch (error) {
      new Notice(t('settings.pluginUpdate.failure', { error: error instanceof Error ? error.message : t('settings.pluginUpdate.status.unknown') }));
    } finally {
      if (this.renderToken === token && !this.progressSubscription) this.requestDisplayRefresh();
    }
  }

  private async restoreBackup(backup: PluginUpdateBackup): Promise<void> {
    const token = this.renderToken;
    if (!window.confirm(t('settings.pluginUpdate.confirmRestore', { version: backup.version }))) return;
    try {
      const operation = this.plugin.pluginUpdateService.restoreBackup(backup.id);
      const result = await operation;
      new Notice(t('settings.pluginUpdate.success', { version: result.installedVersion }));
    } catch (error) {
      new Notice(t('settings.pluginUpdate.failure', { error: error instanceof Error ? error.message : t('settings.pluginUpdate.status.unknown') }));
    } finally {
      if (this.renderToken === token && !this.progressSubscription) this.requestDisplayRefresh();
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

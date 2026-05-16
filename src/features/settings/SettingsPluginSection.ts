/* eslint-disable max-lines -- Plugin settings section owns environment inspection, install, per-entry enable/disable, and delete actions together. */
import * as fs from 'fs';
import type { App } from 'obsidian';
import { normalizePath, Notice, Setting } from 'obsidian';
import * as path from 'path';

import { OpencodeConfigManager, PluginManagementService } from '../../core/config';
import type { PluginEntry, PluginEnvironmentSnapshot } from '../../core/config/PluginManagementService';
import type { PluginIsolationMode } from '../../core/types';
import { t } from '../../i18n';
import type OpenCodianPlugin from '../../main';
import { createLogger, getVaultBasePath } from '../../shared';
import { OpencodeConfigModal } from './OpencodeConfigModal';

const logger = createLogger('SettingsPluginSection');

interface PluginSourcePathRenderModel {
  label: string;
  status?: 'available' | 'missing';
}

interface SettingsPluginSectionOptions {
  app: App;
  plugin: OpenCodianPlugin;
  createSectionHeading: (
    containerEl: HTMLElement,
    title: string,
    tooltip?: string,
  ) => HTMLHeadingElement;
  applyInlineCodeText: (targetEl: HTMLElement | null, text: string) => void;
  setSettingNameWithFormatting: (setting: Setting, text: string) => void;
  setSettingDescWithFormatting: (setting: Setting, text: string) => void;
}

export class SettingsPluginSection {
  private readonly app: App;
  private readonly plugin: OpenCodianPlugin;
  private readonly createSectionHeading: (
    containerEl: HTMLElement,
    title: string,
    tooltip?: string,
  ) => HTMLHeadingElement;
  private readonly applyInlineCodeText: (targetEl: HTMLElement | null, text: string) => void;
  private readonly setSettingNameWithFormatting: (setting: Setting, text: string) => void;
  private readonly setSettingDescWithFormatting: (setting: Setting, text: string) => void;
  private refreshRunId = 0;

  constructor(options: SettingsPluginSectionOptions) {
    this.app = options.app;
    this.plugin = options.plugin;
    this.createSectionHeading = options.createSectionHeading;
    this.applyInlineCodeText = options.applyInlineCodeText;
    this.setSettingNameWithFormatting = options.setSettingNameWithFormatting;
    this.setSettingDescWithFormatting = options.setSettingDescWithFormatting;
  }

  dispose(): void {
    this.refreshRunId += 1;
  }

  // ---------------------------------------------------------------------------
  // Tabbed layout
  // ---------------------------------------------------------------------------

  attachTabbed(containerEl: HTMLElement, secondaryTabId: string): void {
    this.dispose();
    const currentRunId = this.refreshRunId;
    const vaultPath = getVaultBasePath(this.plugin.app);

    if (!vaultPath) {
      new Setting(containerEl)
        .setName(t('settings.plugins.unavailable.name'))
        .setDesc(t('settings.plugins.unavailable.desc'));
      return;
    }

    const pluginService = new PluginManagementService(vaultPath);
    const refreshPluginSnapshot = this.createRefreshFn(
      pluginService, containerEl, currentRunId, secondaryTabId,
    );

    // Install section is always visible regardless of tab
    let installInputEl: HTMLInputElement | null = null;
    const installSetting = new Setting(containerEl)
      .setName(t('settings.plugins.install.name'))
      .addText((text) => {
        installInputEl = text.inputEl;
        text.setPlaceholder(t('settings.plugins.install.placeholder'));
      })
      .addButton((button) => {
        button
          .setButtonText(t('settings.plugins.install.button'))
          .setCta()
          .onClick(async () => {
            await this.handleInstall(installInputEl, pluginService, refreshPluginSnapshot);
          });
      });
    this.setSettingDescWithFormatting(installSetting, t('settings.plugins.install.desc'));

    if (secondaryTabId === 'overview') {
      const overviewEl = containerEl.createDiv({ attr: { 'data-section-block': 'overview' } });
      this.createPluginSubsection(overviewEl, t('settings.plugins.overview.title'), t('settings.plugins.overview.desc'));
    } else if (secondaryTabId === 'global') {
      const globalSourcesEl = containerEl.createDiv({ attr: { 'data-section-block': 'global' } });
      this.createPluginSubsection(globalSourcesEl, t('settings.plugins.global.title'), t('settings.plugins.global.desc'));
    } else if (secondaryTabId === 'project-directory') {
      const projectDirEl = containerEl.createDiv({ attr: { 'data-section-block': 'project-directory' } });
      this.createPluginSubsection(projectDirEl, t('settings.plugins.projectDirectory.title'), t('settings.plugins.projectDirectory.desc'));
    } else if (secondaryTabId === 'omo') {
      const omoEl = containerEl.createDiv({ attr: { 'data-section-block': 'omo' } });
      this.createPluginSubsection(omoEl, t('settings.plugins.omo.title'), t('settings.plugins.omo.desc'));
    }

    void refreshPluginSnapshot(false);
  }

  // ---------------------------------------------------------------------------
  // Classic layout
  // ---------------------------------------------------------------------------

  attach(containerEl: HTMLElement): HTMLHeadingElement {
    this.dispose();
    const currentRunId = this.refreshRunId;
    const headingEl = this.createSectionHeading(
      containerEl,
      t('settings.plugins.title'),
      t('settings.quickNav.pluginsDesc'),
    );
    const vaultPath = getVaultBasePath(this.plugin.app);

    if (!vaultPath) {
      new Setting(containerEl)
        .setName(t('settings.plugins.unavailable.name'))
        .setDesc(t('settings.plugins.unavailable.desc'));
      return headingEl;
    }

    const pluginService = new PluginManagementService(vaultPath);
    let projectPluginEditorEl: HTMLTextAreaElement | null = null;
    let installInputEl: HTMLInputElement | null = null;

    // --- Install section ---
    const installSetting = new Setting(containerEl)
      .setName(t('settings.plugins.install.name'))
      .addText((text) => {
        installInputEl = text.inputEl;
        text.setPlaceholder(t('settings.plugins.install.placeholder'));
      })
      .addButton((button) => {
        button
          .setButtonText(t('settings.plugins.install.button'))
          .setCta()
          .onClick(async () => {
            await this.handleInstall(installInputEl, pluginService, refreshPluginSnapshot);
          });
      });
    this.setSettingDescWithFormatting(installSetting, t('settings.plugins.install.desc'));

    const overviewEl = this.createPluginSubsection(
      containerEl,
      t('settings.plugins.overview.title'),
      t('settings.plugins.overview.desc'),
    );
    const globalSourcesEl = this.createPluginSubsection(
      containerEl,
      t('settings.plugins.global.title'),
      t('settings.plugins.global.desc'),
    );
    const projectDirectoryEl = this.createPluginSubsection(
      containerEl,
      t('settings.plugins.projectDirectory.title'),
      t('settings.plugins.projectDirectory.desc'),
    );
    const omoEl = this.createPluginSubsection(
      containerEl,
      t('settings.plugins.omo.title'),
      t('settings.plugins.omo.desc'),
    );

    const refreshPluginSnapshot = async (showNotice = false) => {
      try {
        const snapshot = await pluginService.inspect(
          this.plugin.settings.server.mode,
          this.plugin.settings.pluginIsolationMode,
          this.plugin.settings.disabledPluginSpecs,
        );
        if (currentRunId !== this.refreshRunId) {
          return;
        }

        if (projectPluginEditorEl) {
          projectPluginEditorEl.value = snapshot.projectConfigSpecs
            .map((pluginSpec) => pluginService.formatPluginSpec(pluginSpec))
            .join('\n');
        }

        this.renderPluginOverview(overviewEl, snapshot);
        this.renderPluginSources(globalSourcesEl, snapshot, pluginService, currentRunId, async () => { await refreshPluginSnapshot(false); });
        this.renderPluginProjectDirectory(projectDirectoryEl, snapshot, pluginService, currentRunId);
        this.renderPluginOmoSection(omoEl, snapshot);

        if (showNotice) {
          new Notice(t('settings.plugins.refresh.success'));
        }
      } catch (error) {
        if (currentRunId !== this.refreshRunId) {
          return;
        }
        logger.error('Failed to refresh plugin snapshot:', error);
        if (showNotice) {
          new Notice(t('settings.plugins.refresh.failed'));
        }
      }
    };

    const pluginActionsSetting = new Setting(containerEl)
      .setName(t('settings.plugins.actions.name'))
      .addButton((button) => {
        button
          .setButtonText(t('settings.plugins.actions.refresh'))
          .onClick(async () => {
            button.setDisabled(true);
            await refreshPluginSnapshot(true);
            button.setDisabled(false);
          });
      })
      .addButton((button) => {
        button
          .setButtonText(t('settings.plugins.actions.openRaw'))
          .onClick(() => {
            new OpencodeConfigModal(this.app, new OpencodeConfigManager(vaultPath)).open();
          });
      });
    this.setSettingDescWithFormatting(pluginActionsSetting, t('settings.plugins.actions.desc'));

    const projectPluginSetting = new Setting(containerEl)
      .setName(t('settings.plugins.projectConfig.name'))
      .addTextArea((text) => {
        projectPluginEditorEl = text.inputEl;
        text.setPlaceholder(t('settings.plugins.projectConfig.placeholder'));
        text.inputEl.rows = 6;
      })
      .addButton((button) => {
        button
          .setButtonText(t('settings.plugins.projectConfig.save'))
          .setCta()
          .onClick(async () => {
            if (!projectPluginEditorEl) {
              return;
            }

            try {
              const plugins = pluginService.parsePluginSpecLines(projectPluginEditorEl.value);
              await pluginService.updateProjectConfigPlugins(plugins);
              // Sync: remove installed specs from disabledPluginSpecs
              const activeSerialized = new Set(plugins.map((p) => pluginService.formatPluginSpec(p)));
              const nextDisabled = this.plugin.settings.disabledPluginSpecs
                .filter((s) => !activeSerialized.has(s));
              this.plugin.settings.disabledPluginSpecs = nextDisabled;
              await this.plugin.saveSettings();
              await refreshPluginSnapshot(false);
              new Notice(t('settings.plugins.projectConfig.saved'));
              this.showRestartNotice();
            } catch (error) {
              const message = error instanceof Error ? error.message : t('settings.plugins.projectConfig.invalid');
              new Notice(`${t('settings.plugins.projectConfig.invalid')}: ${message}`);
            }
          });
      });
    this.setSettingNameWithFormatting(projectPluginSetting, t('settings.plugins.projectConfig.name'));
    this.setSettingDescWithFormatting(projectPluginSetting, t('settings.plugins.projectConfig.desc'));

    const isolationSetting = new Setting(containerEl)
      .setName(t('settings.plugins.isolation.name'))
      .addDropdown((dropdown) => {
        dropdown
          .addOption('default', t('settings.plugins.isolation.default'))
          .addOption('pure', t('settings.plugins.isolation.pure'))
          .setValue(this.plugin.settings.pluginIsolationMode)
          .onChange(async (value) => {
            this.plugin.settings.pluginIsolationMode = value as PluginIsolationMode;
            await this.plugin.saveSettings();
            await refreshPluginSnapshot(false);
            new Notice(t('settings.plugins.isolation.updated'));
            this.showRestartNotice();
          });
      });
    this.setSettingDescWithFormatting(isolationSetting, t('settings.plugins.isolation.desc'));

    const pluginDirectorySetting = new Setting(containerEl)
      .setName(t('settings.plugins.projectDirectory.manageName'))
      .addButton((button) => {
        button
          .setButtonText(t('settings.plugins.projectDirectory.create'))
          .onClick(async () => {
            await pluginService.ensureProjectPluginDirectory();
            await refreshPluginSnapshot(false);
            new Notice(t('settings.plugins.projectDirectory.created'));
          });
      });
    this.setSettingDescWithFormatting(
      pluginDirectorySetting,
      t('settings.plugins.projectDirectory.manageDesc'),
    );

    const omoSetting = new Setting(containerEl)
      .setName(t('settings.plugins.omo.manageName'))
      .addButton((button) => {
        button
          .setButtonText(t('settings.plugins.omo.open'))
          .setCta()
          .onClick(async () => {
            const relativePath = await this.ensureAndOpenProjectOmoConfig(pluginService);
            if (!relativePath) {
              new Notice(t('settings.plugins.omo.openFailed'));
              return;
            }
            await refreshPluginSnapshot(false);
          });
      });
    this.setSettingDescWithFormatting(omoSetting, t('settings.plugins.omo.manageDesc'));

    void refreshPluginSnapshot(false);
    return headingEl;
  }

  // ---------------------------------------------------------------------------
  // Install handler
  // ---------------------------------------------------------------------------

  private async handleInstall(
    inputEl: HTMLInputElement | null,
    pluginService: PluginManagementService,
    refresh: (showNotice: boolean) => Promise<void>,
  ): Promise<void> {
    if (!inputEl) return;
    const raw = inputEl.value.trim();
    if (!raw) return;

    try {
      const specs = pluginService.parsePluginSpecLines(raw);
      if (specs.length === 0) return;
      const spec = specs[0];
      const serialized = pluginService.formatPluginSpec(spec);

      // Check for duplicates in both active config and disabled list
      const snapshot = await pluginService.inspect(
        this.plugin.settings.server.mode,
        this.plugin.settings.pluginIsolationMode,
        this.plugin.settings.disabledPluginSpecs,
      );
      const activeSerialized = new Set(snapshot.projectConfigSpecs.map((s) => pluginService.formatPluginSpec(s)));
      if (activeSerialized.has(serialized)) {
        new Notice(t('settings.plugins.install.duplicate'));
        return;
      }

      await pluginService.installConfigPlugin(spec);
      // Also remove from disabled list if it was there
      this.plugin.settings.disabledPluginSpecs =
        this.plugin.settings.disabledPluginSpecs.filter((s) => s !== serialized);
      await this.plugin.saveSettings();

      inputEl.value = '';
      new Notice(t('settings.plugins.install.success'));
      this.showRestartNotice();
      await refresh(false);
    } catch (error) {
      logger.error('Install failed:', error);
      new Notice(t('settings.plugins.install.failed'));
    }
  }

  // ---------------------------------------------------------------------------
  // Config plugin toggle / delete
  // ---------------------------------------------------------------------------

  private async handleConfigPluginToggle(
    entry: PluginEntry,
    enabled: boolean,
    pluginService: PluginManagementService,
    refresh: (showNotice: boolean) => Promise<void>,
  ): Promise<void> {
    const serialized = this.serializeEntry(entry, pluginService);

    if (enabled) {
      // Re-enable: add spec back to config, remove from disabledPluginSpecs
      const spec = entry.options
        ? [entry.specifier, entry.options] as [string, Record<string, unknown>]
        : entry.specifier;
      await pluginService.installConfigPlugin(spec);
      this.plugin.settings.disabledPluginSpecs =
        this.plugin.settings.disabledPluginSpecs.filter((s) => s !== serialized);
    } else {
      // Disable: remove from config, add to disabledPluginSpecs
      await pluginService.uninstallConfigPlugin(serialized);
      if (!this.plugin.settings.disabledPluginSpecs.includes(serialized)) {
        this.plugin.settings.disabledPluginSpecs =
          [...this.plugin.settings.disabledPluginSpecs, serialized].sort();
      }
    }

    await this.plugin.saveSettings();
    new Notice(t('settings.plugins.entry.toggleSaved'));
    this.showRestartNotice();
    await refresh(false);
  }

  private async handleConfigPluginDelete(
    entry: PluginEntry,
    pluginService: PluginManagementService,
    refresh: (showNotice: boolean) => Promise<void>,
  ): Promise<void> {
    const serialized = this.serializeEntry(entry, pluginService);
    await pluginService.uninstallConfigPlugin(serialized);
    this.plugin.settings.disabledPluginSpecs =
      this.plugin.settings.disabledPluginSpecs.filter((s) => s !== serialized);
    await this.plugin.saveSettings();
    new Notice(t('settings.plugins.entry.deleteSuccess'));
    this.showRestartNotice();
    await refresh(false);
  }

  // ---------------------------------------------------------------------------
  // Directory plugin toggle / delete
  // ---------------------------------------------------------------------------

  private async handleDirectoryPluginToggle(
    entry: PluginEntry,
    enabled: boolean,
    pluginService: PluginManagementService,
    refresh: (showNotice: boolean) => Promise<void>,
  ): Promise<void> {
    if (!entry.fullPath) return;
    await pluginService.toggleDirectoryPlugin(entry.fullPath, enabled);
    new Notice(t('settings.plugins.entry.toggleSaved'));
    this.showRestartNotice();
    await refresh(false);
  }

  private async handleDirectoryPluginDelete(
    entry: PluginEntry,
    pluginService: PluginManagementService,
    refresh: (showNotice: boolean) => Promise<void>,
  ): Promise<void> {
    if (!entry.fullPath) return;
    await pluginService.deleteDirectoryPlugin(entry.fullPath);
    new Notice(t('settings.plugins.entry.deleteSuccess'));
    this.showRestartNotice();
    await refresh(false);
  }

  // ---------------------------------------------------------------------------
  // Render helpers
  // ---------------------------------------------------------------------------

  private createRefreshFn(
    pluginService: PluginManagementService,
    containerEl: HTMLElement,
    currentRunId: number,
    _secondaryTabId: string,
  ): (showNotice: boolean) => Promise<void> {
    return async (showNotice = false) => {
      try {
        const snapshot = await pluginService.inspect(
          this.plugin.settings.server.mode,
          this.plugin.settings.pluginIsolationMode,
          this.plugin.settings.disabledPluginSpecs,
        );
        if (currentRunId !== this.refreshRunId) return;

        const overviewEl = containerEl.querySelector('[data-section-block="overview"] .opencodian-plugin-block-body') as HTMLElement;
        const globalSourcesEl = containerEl.querySelector('[data-section-block="global"] .opencodian-plugin-block-body') as HTMLElement;
        const projectDirEl = containerEl.querySelector('[data-section-block="project-directory"] .opencodian-plugin-block-body') as HTMLElement;
        const omoEl = containerEl.querySelector('[data-section-block="omo"] .opencodian-plugin-block-body') as HTMLElement;

        if (overviewEl) this.renderPluginOverview(overviewEl, snapshot);
        if (globalSourcesEl) this.renderPluginSources(globalSourcesEl, snapshot, pluginService, currentRunId);
        if (projectDirEl) this.renderPluginProjectDirectory(projectDirEl, snapshot, pluginService, currentRunId);
        if (omoEl) this.renderPluginOmoSection(omoEl, snapshot);

        if (showNotice) new Notice(t('settings.plugins.refresh.success'));
      } catch (error) {
        if (currentRunId !== this.refreshRunId) return;
        logger.error('Failed to refresh plugin snapshot:', error);
        if (showNotice) new Notice(t('settings.plugins.refresh.failed'));
      }
    };
  }

  private createPluginSubsection(containerEl: HTMLElement, title: string, description: string): HTMLElement {
    const blockEl = containerEl.createDiv({ cls: 'opencodian-plugin-block' });
    blockEl.createEl('h4', {
      text: title,
      cls: 'opencodian-settings-subsection-heading',
    });
    const descEl = blockEl.createDiv({
      cls: 'opencodian-plugin-block-desc',
    });
    this.applyInlineCodeText(descEl, description);
    return blockEl.createDiv({ cls: 'opencodian-plugin-block-body' });
  }

  private renderPluginOverview(containerEl: HTMLElement, snapshot: PluginEnvironmentSnapshot): void {
    const totalProjectPlugins =
      snapshot.projectConfigPlugins.length
      + snapshot.disabledProjectConfigPlugins.length;
    const totalDirPlugins =
      snapshot.projectDirectoryPlugins.length
      + snapshot.disabledProjectDirectoryPlugins.length;

    const rows = [
      {
        label: t('settings.plugins.overview.serviceMode'),
        value: snapshot.serviceMode === 'local'
          ? t('settings.plugins.overview.serviceModeLocal')
          : t('settings.plugins.overview.serviceModeRemote'),
      },
      {
        label: t('settings.plugins.overview.isolationMode'),
        value: snapshot.isolationMode === 'pure'
          ? t('settings.plugins.isolation.pure')
          : t('settings.plugins.isolation.default'),
      },
      {
        label: t('settings.plugins.overview.vaultConfigDir'),
        value: snapshot.vaultConfigDir,
      },
      {
        label: t('settings.plugins.overview.globalInfluence'),
        value: snapshot.globalInfluenceDetected
          ? t('settings.plugins.overview.globalInfluenceYes')
          : t('settings.plugins.overview.globalInfluenceNo'),
      },
      {
        label: t('settings.plugins.overview.projectConfigCount'),
        value: String(totalProjectPlugins),
      },
      {
        label: t('settings.plugins.overview.projectDirectoryCount'),
        value: String(totalDirPlugins),
      },
    ];

    this.renderPluginKeyValueRows(containerEl, rows);
  }

  private renderPluginSources(
    containerEl: HTMLElement,
    snapshot: PluginEnvironmentSnapshot,
    pluginService: PluginManagementService,
    currentRunId: number,
    fullRefresh?: () => Promise<void>,
  ): void {
    containerEl.empty();

    // Global sources — read-only
    this.renderPluginEntryGroup(containerEl, {
      title: t('settings.plugins.global.configTitle'),
      paths: this.createSingleSourcePath(snapshot.globalConfigPath),
      entries: snapshot.globalConfigPlugins,
      emptyText: t('settings.plugins.none'),
    });
    this.renderPluginEntryGroup(containerEl, {
      title: t('settings.plugins.global.directoryTitle'),
      paths: this.createDirectorySourcePaths(snapshot.globalDirectories),
      entries: snapshot.globalDirectoryPlugins,
      emptyText: t('settings.plugins.none'),
    });

    // Project config — managed (toggle + delete)
    // Use fullRefresh (which also updates the textarea editor) if available;
    // fall back to a sources-only re-render for tabbed layout.
    const refresh = fullRefresh ?? (async () => {
      if (currentRunId !== this.refreshRunId) return;
      const snap = await pluginService.inspect(
        this.plugin.settings.server.mode,
        this.plugin.settings.pluginIsolationMode,
        this.plugin.settings.disabledPluginSpecs,
      );
      if (currentRunId !== this.refreshRunId) return;
      this.renderPluginSources(containerEl, snap, pluginService, currentRunId);
    });

    this.renderManagedEntryGroup(containerEl, {
      title: t('settings.plugins.projectConfig.title'),
      paths: this.createSingleSourcePath(snapshot.projectConfigPath),
      activeEntries: snapshot.projectConfigPlugins,
      disabledEntries: snapshot.disabledProjectConfigPlugins,
      emptyText: t('settings.plugins.none'),
      kind: 'config',
      pluginService,
      refresh,
    });
  }

  private renderPluginProjectDirectory(
    containerEl: HTMLElement,
    snapshot: PluginEnvironmentSnapshot,
    pluginService: PluginManagementService,
    currentRunId: number,
  ): void {
    containerEl.empty();

    const refresh = async () => {
      if (currentRunId !== this.refreshRunId) return;
      const snap = await pluginService.inspect(
        this.plugin.settings.server.mode,
        this.plugin.settings.pluginIsolationMode,
        this.plugin.settings.disabledPluginSpecs,
      );
      if (currentRunId !== this.refreshRunId) return;
      this.renderPluginProjectDirectory(containerEl, snap, pluginService, currentRunId);
    };

    this.renderManagedEntryGroup(containerEl, {
      title: t('settings.plugins.projectDirectory.filesTitle'),
      paths: this.createDirectorySourcePaths(snapshot.projectDirectories),
      activeEntries: snapshot.projectDirectoryPlugins,
      disabledEntries: snapshot.disabledProjectDirectoryPlugins,
      emptyText: t('settings.plugins.projectDirectory.empty'),
      kind: 'directory',
      pluginService,
      refresh,
    });
  }

  private renderPluginOmoSection(containerEl: HTMLElement, snapshot: PluginEnvironmentSnapshot): void {
    const rows = [
      {
        label: t('settings.plugins.omo.pathLabel'),
        value: snapshot.omoConfigPath,
      },
      {
        label: t('settings.plugins.omo.statusLabel'),
        value: snapshot.omoConfigExists
          ? t('settings.plugins.omo.exists')
          : t('settings.plugins.omo.missing'),
      },
      {
        label: t('settings.plugins.omo.pureModeLabel'),
        value: snapshot.isolationMode === 'pure'
          ? t('settings.plugins.omo.pureWarning')
          : t('settings.plugins.omo.pureInactive'),
      },
    ];

    this.renderPluginKeyValueRows(containerEl, rows);
  }

  private renderPluginKeyValueRows(
    containerEl: HTMLElement,
    rows: Array<{ label: string; value: string }>,
  ): void {
    containerEl.empty();
    const listEl = containerEl.createDiv({ cls: 'opencodian-plugin-summary-list' });
    for (const row of rows) {
      const rowEl = listEl.createDiv({ cls: 'opencodian-plugin-summary-row' });
      const labelEl = rowEl.createSpan({ cls: 'opencodian-plugin-summary-label' });
      this.applyInlineCodeText(labelEl, `${row.label}:`);
      const valueEl = rowEl.createSpan({ cls: 'opencodian-plugin-summary-value' });
      this.applyInlineCodeText(valueEl, row.value);
    }
  }

  // ---------------------------------------------------------------------------
  // Read-only entry group (global sources)
  // ---------------------------------------------------------------------------

  private renderPluginEntryGroup(
    containerEl: HTMLElement,
    options: {
      title: string;
      paths: PluginSourcePathRenderModel[];
      entries: PluginEntry[];
      emptyText: string;
    },
  ): void {
    const { title, paths, entries, emptyText } = options;
    const groupEl = containerEl.createDiv({ cls: 'opencodian-plugin-source-group' });
    const headerEl = groupEl.createDiv({ cls: 'opencodian-plugin-source-header' });
    const titleEl = headerEl.createDiv({
      cls: 'opencodian-plugin-source-title',
    });
    this.applyInlineCodeText(titleEl, title);
    headerEl.createSpan({
      text: String(entries.length),
      cls: 'opencodian-plugin-source-count',
      attr: { 'aria-label': t('settings.plugins.detectedCount') },
    });

    const pathListEl = groupEl.createDiv({ cls: 'opencodian-plugin-source-path' });
    for (const sourcePath of paths) {
      const pathRowEl = pathListEl.createDiv({
        cls: 'opencodian-plugin-source-path-row',
        attr: sourcePath.status ? { 'data-path-status': sourcePath.status } : undefined,
      });
      const labelEl = pathRowEl.createSpan({ cls: 'opencodian-plugin-source-path-label' });
      this.applyInlineCodeText(labelEl, sourcePath.label);
      if (sourcePath.status) {
        pathRowEl.createSpan({
          text: sourcePath.status === 'available'
            ? t('settings.plugins.path.available')
            : t('settings.plugins.path.missing'),
          cls: 'opencodian-plugin-source-path-status',
        });
      }
    }

    if (entries.length === 0) {
      const emptyEl = groupEl.createDiv({
        cls: 'opencodian-plugin-source-empty',
      });
      this.applyInlineCodeText(emptyEl, emptyText);
      return;
    }

    const listEl = groupEl.createDiv({ cls: 'opencodian-plugin-source-list' });
    for (const entry of entries) {
      const itemEl = listEl.createDiv({
        cls: 'opencodian-plugin-source-item',
      });
      this.applyInlineCodeText(itemEl, this.describePluginEntry(entry));
    }
  }

  // ---------------------------------------------------------------------------
  // Managed entry group (project-scope, toggle + delete)
  // ---------------------------------------------------------------------------

  private renderManagedEntryGroup(
    containerEl: HTMLElement,
    options: {
      title: string;
      paths: PluginSourcePathRenderModel[];
      activeEntries: PluginEntry[];
      disabledEntries: PluginEntry[];
      emptyText: string;
      kind: 'config' | 'directory';
      pluginService: PluginManagementService;
      refresh: () => Promise<void>;
    },
  ): void {
    const { title, paths, activeEntries, disabledEntries, emptyText, kind, pluginService, refresh } = options;
    const allEntries = [...activeEntries, ...disabledEntries];

    const groupEl = containerEl.createDiv({ cls: 'opencodian-plugin-source-group' });
    const headerEl = groupEl.createDiv({ cls: 'opencodian-plugin-source-header' });
    const titleEl = headerEl.createDiv({
      cls: 'opencodian-plugin-source-title',
    });
    this.applyInlineCodeText(titleEl, title);
    headerEl.createSpan({
      text: String(allEntries.length),
      cls: 'opencodian-plugin-source-count',
      attr: { 'aria-label': t('settings.plugins.detectedCount') },
    });

    const pathListEl = groupEl.createDiv({ cls: 'opencodian-plugin-source-path' });
    for (const sourcePath of paths) {
      const pathRowEl = pathListEl.createDiv({
        cls: 'opencodian-plugin-source-path-row',
        attr: sourcePath.status ? { 'data-path-status': sourcePath.status } : undefined,
      });
      const labelEl = pathRowEl.createSpan({ cls: 'opencodian-plugin-source-path-label' });
      this.applyInlineCodeText(labelEl, sourcePath.label);
      if (sourcePath.status) {
        pathRowEl.createSpan({
          text: sourcePath.status === 'available'
            ? t('settings.plugins.path.available')
            : t('settings.plugins.path.missing'),
          cls: 'opencodian-plugin-source-path-status',
        });
      }
    }

    if (allEntries.length === 0) {
      const emptyEl = groupEl.createDiv({
        cls: 'opencodian-plugin-source-empty',
      });
      this.applyInlineCodeText(emptyEl, emptyText);
      return;
    }

    const listEl = groupEl.createDiv({ cls: 'opencodian-plugin-source-list' });

    // Active entries
    for (const entry of activeEntries) {
      this.renderManagedEntryRow(listEl, { entry, disabled: false, kind, pluginService, refresh });
    }

    // Disabled entries
    for (const entry of disabledEntries) {
      this.renderManagedEntryRow(listEl, { entry, disabled: true, kind, pluginService, refresh });
    }
  }

  private renderManagedEntryRow(
    listEl: HTMLElement,
    options: {
      entry: PluginEntry;
      disabled: boolean;
      kind: 'config' | 'directory';
      pluginService: PluginManagementService;
      refresh: () => Promise<void>;
    },
  ): void {
    const { entry, disabled, kind, pluginService, refresh } = options;
    const rowEl = listEl.createDiv({
      cls: `opencodian-plugin-source-item${disabled ? ' is-plugin-disabled' : ''}`,
    });

    // Toggle checkbox
    const toggleLabel = rowEl.createEl('label', { cls: 'opencodian-plugin-toggle' });
    const checkbox = toggleLabel.createEl('input', {
      attr: { type: 'checkbox' },
    });
    checkbox.checked = !disabled;
    toggleLabel.createSpan({
      text: disabled
        ? t('settings.plugins.entry.disabled')
        : t('settings.plugins.entry.enabled'),
      cls: 'opencodian-plugin-toggle-label',
    });

    // Description
    const descEl = rowEl.createSpan({ cls: 'opencodian-plugin-entry-desc' });
    this.applyInlineCodeText(descEl, this.describePluginEntry(entry));

    // Delete button
    const deleteBtn = rowEl.createEl('button', {
      text: t('settings.plugins.entry.delete'),
      cls: 'opencodian-plugin-entry-delete',
      attr: { 'aria-label': t('settings.plugins.entry.delete') },
    });

    // Toggle handler
    checkbox.addEventListener('change', () => {
      checkbox.disabled = true;
      const previousChecked = !checkbox.checked;
      const targetEnabled = checkbox.checked;
      void (async () => {
        try {
          if (kind === 'config') {
            await this.handleConfigPluginToggle(entry, targetEnabled, pluginService, refresh);
          } else {
            await this.handleDirectoryPluginToggle(entry, targetEnabled, pluginService, refresh);
          }
        } catch (error) {
          logger.error('Failed to toggle plugin:', error);
          checkbox.checked = previousChecked;
          new Notice(error instanceof Error ? error.message : t('settings.plugins.entry.deleteFailed'));
        } finally {
          checkbox.disabled = false;
        }
      })();
    });

    // Delete handler (with confirmation)
    deleteBtn.addEventListener('click', () => {
      if (!confirm(t('settings.plugins.entry.deleteConfirm'))) {
        return;
      }
      deleteBtn.disabled = true;
      void (async () => {
        try {
          if (kind === 'config') {
            await this.handleConfigPluginDelete(entry, pluginService, refresh);
          } else {
            await this.handleDirectoryPluginDelete(entry, pluginService, refresh);
          }
        } catch (error) {
          logger.error('Failed to delete plugin:', error);
          new Notice(t('settings.plugins.entry.deleteFailed'));
        } finally {
          deleteBtn.disabled = false;
        }
      })();
    });
  }

  // ---------------------------------------------------------------------------
  // Shared helpers
  // ---------------------------------------------------------------------------

  private createSingleSourcePath(label: string): PluginSourcePathRenderModel[] {
    return [{ label }];
  }

  private createDirectorySourcePaths(
    directories: Array<{ path: string; exists: boolean }>,
  ): PluginSourcePathRenderModel[] {
    return directories.map((directory) => ({
      label: directory.path,
      status: directory.exists ? 'available' : 'missing',
    }));
  }

  private describePluginEntry(entry: PluginEntry): string {
    const kindLabel = entry.kind === 'npm'
      ? t('settings.plugins.kind.npm')
      : t('settings.plugins.kind.local');
    const optionsLabel = entry.options ? ` · ${JSON.stringify(entry.options)}` : '';
    const pathLabel = entry.fullPath ? ` · ${entry.fullPath}` : '';
    return `[${kindLabel}] ${entry.displayName}${optionsLabel}${pathLabel}`;
  }

  private serializeEntry(entry: PluginEntry, pluginService: PluginManagementService): string {
    return entry.options
      ? pluginService.formatPluginSpec([entry.specifier, entry.options])
      : pluginService.formatPluginSpec(entry.specifier);
  }

  private showRestartNotice(): void {
    new Notice(
      this.plugin.settings.server.mode === 'local'
        ? t('settings.plugins.restart.local')
        : t('settings.plugins.restart.remote'),
    );
  }

  private async ensureAndOpenProjectOmoConfig(pluginService: PluginManagementService): Promise<string | null> {
    try {
      const absolutePath = await pluginService.ensureProjectOmoConfig();
      const vaultBasePath = getVaultBasePath(this.plugin.app);
      if (!vaultBasePath) {
        return null;
      }

      const relativePath = normalizePath(path.relative(vaultBasePath, absolutePath));
      const exists = await this.app.vault.adapter.exists(relativePath);
      if (!exists) {
        const content = await fs.promises.readFile(absolutePath, 'utf-8');
        const parentDir = normalizePath(path.dirname(relativePath));
        if (!(await this.app.vault.adapter.exists(parentDir))) {
          await this.app.vault.adapter.mkdir(parentDir);
        }
        await this.app.vault.adapter.write(relativePath, content);
      }

      await this.app.workspace.openLinkText(relativePath, '', 'tab');
      return relativePath;
    } catch (error) {
      logger.error('Failed to open project OMO config:', error);
      return null;
    }
  }
}

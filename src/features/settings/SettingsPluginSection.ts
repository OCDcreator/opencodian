/* eslint-disable max-lines -- Plugin settings section owns environment inspection, install, per-entry enable/disable, and delete actions together. */
import * as fs from 'fs';
import type { App } from 'obsidian';
import { normalizePath, Notice, Setting } from 'obsidian';
import * as path from 'path';

import { OpencodeConfigManager, PluginManagementService } from '../../core/config';
import type { PluginEntry, PluginEnvironmentSnapshot } from '../../core/config/PluginManagementService';
import type { PluginEvidenceSnapshot } from '../../core/opencode/OpenCodeEventSubscriptionCoordinator';
import type { PluginIsolationMode } from '../../core/types';
import { t } from '../../i18n';
import type OpenCodianPlugin from '../../main';
import { createLogger, getVaultBasePath } from '../../shared';
import { OpencodeConfigModal } from './OpencodeConfigModal';
import { SettingsPluginEvidenceCoordinator } from './SettingsPluginEvidenceCoordinator';
import { SettingsPluginEvidencePresenter } from './SettingsPluginEvidencePresenter';
import { TextareaSizeMemory } from './TextareaSizeMemory';

const logger = createLogger('SettingsPluginSection');

interface PluginSourcePathRenderModel {
  label: string;
  status?: 'available' | 'missing';
}

type PluginSourceFilter = 'all' | 'global' | 'project';

interface ConfigSourceRenderContext {
  pluginService: PluginManagementService;
  currentRunId: number;
  fullRefresh?: () => Promise<void>;
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
  private readonly evidencePresenter: SettingsPluginEvidencePresenter;
  private evidenceCoordinator: SettingsPluginEvidenceCoordinator | null = null;
  private refreshRunId = 0;
  private lastPluginEvidenceSnapshot: PluginEvidenceSnapshot | null = null;
  private configSourceFilter: PluginSourceFilter = 'all';

  constructor(options: SettingsPluginSectionOptions) {
    this.app = options.app;
    this.plugin = options.plugin;
    this.createSectionHeading = options.createSectionHeading;
    this.applyInlineCodeText = options.applyInlineCodeText;
    this.setSettingNameWithFormatting = options.setSettingNameWithFormatting;
    this.setSettingDescWithFormatting = options.setSettingDescWithFormatting;
    this.evidencePresenter = new SettingsPluginEvidencePresenter({
      applyInlineCodeText: this.applyInlineCodeText,
    });
  }

  private ensureEvidenceCoordinator(): SettingsPluginEvidenceCoordinator {
    if (!this.evidenceCoordinator) {
      this.evidenceCoordinator = new SettingsPluginEvidenceCoordinator({
        openCodeService: this.plugin.openCodeService,
        getSettings: () => this.plugin.settings,
        vaultPath: getVaultBasePath(this.plugin.app) ?? undefined,
      });
    }
    return this.evidenceCoordinator;
  }

  dispose(): void {
    this.refreshRunId += 1;
    this.lastPluginEvidenceSnapshot = null;
    this.evidenceCoordinator?.dispose();
    this.evidenceCoordinator = null;
  }

  private subscribeToPluginEvidence(currentRunId: number, overviewEl: HTMLElement): void {
    const coordinator = this.ensureEvidenceCoordinator();
    coordinator.dispose();

    coordinator.subscribe((snapshot) => {
      if (currentRunId !== this.refreshRunId) {
        return;
      }
      this.lastPluginEvidenceSnapshot = snapshot;
      this.evidencePresenter.updateSdkEvidence(overviewEl, snapshot);
    });
  }

  private async refreshPluginEvidence(): Promise<void> {
    const coordinator = this.ensureEvidenceCoordinator();
    try {
      const snapshot = await coordinator.refresh();
      if (snapshot) {
        this.lastPluginEvidenceSnapshot = snapshot;
      }
    } catch (error) {
      logger.error('Failed to refresh plugin evidence:', error);
    }
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

    // Install section only shown on overview tab
    if (secondaryTabId === 'overview') {
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
      this.renderLocalOnlyLabel(installSetting.settingEl);
    }

    if (secondaryTabId === 'overview') {
      const overviewEl = containerEl.createDiv({ attr: { 'data-section-block': 'overview' } });
      const overviewBodyEl = this.createPluginSubsection(overviewEl, t('settings.plugins.overview.title'), t('settings.plugins.overview.desc'));
      this.subscribeToPluginEvidence(currentRunId, overviewBodyEl);
    } else if (secondaryTabId === 'config-sources') {
      const sourcesEl = containerEl.createDiv({ attr: { 'data-section-block': 'config-sources' } });
      const sourcesBodyEl = this.createPluginSubsection(
        sourcesEl,
        t('settings.plugins.configSources.title'),
        t('settings.plugins.configSources.desc'),
      );
      this.renderConfigSourceFilter(sourcesBodyEl);
    } else if (secondaryTabId === 'project-plugins') {
      const projectPluginsEl = containerEl.createDiv({ attr: { 'data-section-block': 'project-plugins' } });
      this.createPluginSubsection(
        projectPluginsEl,
        t('settings.plugins.projectPlugins.title'),
        t('settings.plugins.projectPlugins.desc'),
      );
    } else if (secondaryTabId === 'omo') {
      const omoEl = containerEl.createDiv({ attr: { 'data-section-block': 'omo' } });
      this.createPluginSubsection(omoEl, t('settings.plugins.omo.title'), t('settings.plugins.omo.desc'));
    }

    void refreshPluginSnapshot(false);
  }

  private renderConfigSourceFilter(containerEl: HTMLElement): void {
    const filterBarEl = containerEl.createDiv({
      cls: 'opencodian-plugin-source-filter',
      attr: { role: 'group', 'aria-label': t('settings.plugins.source.filterLabel') },
    });
    const filters: ReadonlyArray<{ id: PluginSourceFilter; labelKey: 'settings.plugins.source.filterAll' | 'settings.plugins.source.filterGlobal' | 'settings.plugins.source.filterProject' }> = [
      { id: 'all', labelKey: 'settings.plugins.source.filterAll' },
      { id: 'global', labelKey: 'settings.plugins.source.filterGlobal' },
      { id: 'project', labelKey: 'settings.plugins.source.filterProject' },
    ];
    for (const filter of filters) {
      const isActive = this.configSourceFilter === filter.id;
      const buttonEl = filterBarEl.createEl('button', {
        cls: `opencodian-plugin-source-filter-button${isActive ? ' is-active' : ''}`,
        attr: {
          type: 'button',
          'aria-pressed': String(isActive),
          'data-source-filter': filter.id,
        },
        text: t(filter.labelKey),
      });
      buttonEl.addEventListener('click', () => {
        if (this.configSourceFilter === filter.id) return;
        this.configSourceFilter = filter.id;
        for (const sibling of Array.from(filterBarEl.children)) {
          const siblingButton = sibling as HTMLButtonElement;
          const siblingActive = siblingButton.dataset.sourceFilter === filter.id;
          siblingButton.classList.toggle('is-active', siblingActive);
          siblingButton.setAttribute('aria-pressed', String(siblingActive));
        }
        const hostEl = containerEl.querySelector('.opencodian-plugin-source-filter-host');
        if (hostEl instanceof HTMLElement) {
          hostEl.dataset.sourceFilter = filter.id;
        }
      });
    }
    containerEl.createDiv({
      cls: 'opencodian-plugin-source-filter-host',
      attr: { 'data-source-filter': this.configSourceFilter },
    });
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
    this.renderLocalOnlyLabel(installSetting.settingEl);

    const overviewEl = this.createPluginSubsection(
      containerEl,
      t('settings.plugins.overview.title'),
      t('settings.plugins.overview.desc'),
    );
    this.subscribeToPluginEvidence(currentRunId, overviewEl);
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
        const [snapshot] = await Promise.all([
          pluginService.inspect(
            this.plugin.settings.server.mode,
            this.plugin.settings.pluginIsolationMode,
            this.plugin.settings.disabledPluginSpecs,
          ),
          this.refreshPluginEvidence(),
        ]);
        if (currentRunId !== this.refreshRunId) {
          return;
        }

        if (projectPluginEditorEl) {
          projectPluginEditorEl.value = snapshot.projectConfigSpecs
            .map((pluginSpec) => pluginService.formatPluginSpec(pluginSpec))
            .join('\n');
        }

        this.renderPluginOverview(overviewEl, snapshot, this.lastPluginEvidenceSnapshot);
        this.renderPluginSources(globalSourcesEl, snapshot, { pluginService, currentRunId, fullRefresh: async () => { await refreshPluginSnapshot(false); } });
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
        TextareaSizeMemory.attach(text.inputEl, 'plugin-custom-sources');
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
    this.renderLocalOnlyLabel(projectPluginSetting.settingEl);

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
    this.renderLocalOnlyLabel(pluginDirectorySetting.settingEl);

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
      await this.restartManagedServerIfNeeded();
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
    secondaryTabId: string,
  ): (showNotice: boolean) => Promise<void> {
    return async (showNotice = false) => {
      try {
        const includeSdkEvidence = secondaryTabId === 'overview';
        const [snapshot] = await Promise.all([
          pluginService.inspect(
            this.plugin.settings.server.mode,
            this.plugin.settings.pluginIsolationMode,
            this.plugin.settings.disabledPluginSpecs,
          ),
          includeSdkEvidence ? this.refreshPluginEvidence() : Promise.resolve(),
        ]);
        if (currentRunId !== this.refreshRunId) return;

        const overviewEl = containerEl.querySelector('[data-section-block="overview"] .opencodian-plugin-block-body') as HTMLElement;
        const sourcesEl = containerEl.querySelector('[data-section-block="config-sources"] .opencodian-plugin-block-body') as HTMLElement;
        const projectPluginsEl = containerEl.querySelector('[data-section-block="project-plugins"] .opencodian-plugin-block-body') as HTMLElement;
        const omoEl = containerEl.querySelector('[data-section-block="omo"] .opencodian-plugin-block-body') as HTMLElement;

        if (overviewEl) this.renderPluginOverview(overviewEl, snapshot, this.lastPluginEvidenceSnapshot);
        if (sourcesEl) {
          const filterHostEl = sourcesEl.querySelector('.opencodian-plugin-source-filter-host') as HTMLElement | null;
          if (filterHostEl) {
            this.renderPluginSources(filterHostEl, snapshot, { pluginService, currentRunId });
          } else {
            this.renderPluginSources(sourcesEl, snapshot, { pluginService, currentRunId });
          }
        }
        if (projectPluginsEl) this.renderPluginProjectDirectory(projectPluginsEl, snapshot, pluginService, currentRunId);
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

  private renderPluginOverview(
    containerEl: HTMLElement,
    snapshot: PluginEnvironmentSnapshot,
    evidence: PluginEvidenceSnapshot | null,
  ): void {
    this.evidencePresenter.renderOverview(containerEl, snapshot, evidence);
  }

  private renderPluginSources(
    containerEl: HTMLElement,
    snapshot: PluginEnvironmentSnapshot,
    ctx: ConfigSourceRenderContext,
  ): void {
    const { pluginService, currentRunId, fullRefresh } = ctx;
    containerEl.empty();

    const configSources = snapshot.configSources ?? [];
    const hasConfigSources = configSources.length > 0;

    if (hasConfigSources) {
      // Invariant: always render every config source group into the filter host.
      // Visibility is governed exclusively by the host's `data-source-filter`
      // attribute via CSS — never by pre-filtering the DOM in JS. This keeps
      // the panel stable across refreshes triggered by managed actions: the
      // refresh rebuilds the full DOM, and All/Global/Project filters only
      // toggle CSS hiding without needing a re-render.
      for (const source of configSources) {
        const isCanonicalProjectConfig = source.path === snapshot.projectConfigPath;
        const refresh = fullRefresh ?? (async () => {
          if (currentRunId !== this.refreshRunId) return;
          const snap = await pluginService.inspect(
            this.plugin.settings.server.mode,
            this.plugin.settings.pluginIsolationMode,
            this.plugin.settings.disabledPluginSpecs,
          );
          if (currentRunId !== this.refreshRunId) return;
          this.renderPluginSources(containerEl, snap, ctx);
        });

        this.renderConfigSourceGroup(containerEl, source, {
          managed: isCanonicalProjectConfig,
          activeEntries: isCanonicalProjectConfig ? snapshot.projectConfigPlugins : source.plugins,
          disabledEntries: isCanonicalProjectConfig ? snapshot.disabledProjectConfigPlugins : [],
          pluginService,
          refresh,
        });
      }

      // Per-scope empty placeholders. Rendered only when a scope has zero
      // sources; CSS reveals the right one based on the active filter without
      // touching the DOM again. This preserves the all-sources-in-DOM
      // invariant because the placeholder is only emitted when there is
      // nothing else to render for that scope.
      this.renderScopeEmptyPlaceholders(containerEl, configSources);
    } else {
      // Legacy fallback for older fixtures without configSources inventory
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

      const refresh = fullRefresh ?? (async () => {
        if (currentRunId !== this.refreshRunId) return;
        const snap = await pluginService.inspect(
          this.plugin.settings.server.mode,
          this.plugin.settings.pluginIsolationMode,
          this.plugin.settings.disabledPluginSpecs,
        );
        if (currentRunId !== this.refreshRunId) return;
        this.renderPluginSources(containerEl, snap, ctx);
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
  }

  private renderScopeEmptyPlaceholders(
    containerEl: HTMLElement,
    configSources: Array<import('../../core/config/PluginManagementService').PluginConfigSourceSnapshot>,
  ): void {
    const hasGlobal = configSources.some((source) => source.scope === 'global');
    const hasProject = configSources.some((source) => source.scope === 'project');

    // Each placeholder is rendered only when its scope has zero sources, so
    // it never duplicates a real source group. The placeholder carries
    // `data-empty-scope` only — never `data-source-scope`, because the
    // CSS visibility rules use `:has([data-source-scope="X"])` to detect
    // whether a real source of scope X exists.
    if (!hasGlobal) {
      const emptyEl = containerEl.createDiv({
        cls: 'opencodian-plugin-source-scope-empty',
        attr: { 'data-empty-scope': 'global' },
      });
      this.applyInlineCodeText(emptyEl, t('settings.plugins.source.emptyGlobal'));
    }
    if (!hasProject) {
      const emptyEl = containerEl.createDiv({
        cls: 'opencodian-plugin-source-scope-empty',
        attr: { 'data-empty-scope': 'project' },
      });
      this.applyInlineCodeText(emptyEl, t('settings.plugins.source.emptyProject'));
    }
  }

  private describeSourceIdentity(sourcePath: string): string {
    const basename = sourcePath.split(/[/\\]/).filter(Boolean).pop();
    return basename && basename.length > 0 ? basename : t('settings.plugins.source.identityUnknown');
  }

  private describeSourceStatus(
    source: import('../../core/config/PluginManagementService').PluginConfigSourceSnapshot,
  ): { status: 'available' | 'missing' | 'error'; labelKey: 'settings.plugins.source.statusAvailable' | 'settings.plugins.source.statusMissing' | 'settings.plugins.source.statusError' } {
    if (source.error) return { status: 'error', labelKey: 'settings.plugins.source.statusError' };
    if (!source.exists) return { status: 'missing', labelKey: 'settings.plugins.source.statusMissing' };
    return { status: 'available', labelKey: 'settings.plugins.source.statusAvailable' };
  }

  private renderConfigSourceGroup(
    containerEl: HTMLElement,
    source: import('../../core/config/PluginManagementService').PluginConfigSourceSnapshot,
    options: {
      managed: boolean;
      activeEntries?: PluginEntry[];
      disabledEntries?: PluginEntry[];
      pluginService?: PluginManagementService;
      refresh?: () => Promise<void>;
    },
  ): void {
    const { managed, activeEntries, disabledEntries, pluginService, refresh } = options;
    const allEntries = managed
      ? [...(activeEntries ?? []), ...(disabledEntries ?? [])]
      : source.plugins;

    const groupEl = containerEl.createDiv({
      cls: 'opencodian-plugin-source-group',
      attr: {
        'data-source-scope': source.scope,
        'data-source-access': source.editable ? 'editable' : 'read-only',
        'data-source-path': source.path,
      },
    });

    this.renderSourcePanelHeader(groupEl, source, allEntries.length);
    this.renderSourcePanelPath(groupEl, source);
    this.renderSourcePanelMeta(groupEl, source);

    if (managed && pluginService && refresh) {
      this.renderManagedEntryList({
        groupEl,
        activeEntries: activeEntries ?? [],
        disabledEntries: disabledEntries ?? [],
        kind: 'config',
        pluginService,
        refresh,
      });
    } else {
      this.renderReadOnlyEntryList(groupEl, source.plugins);
    }
  }

  private renderSourcePanelHeader(
    groupEl: HTMLElement,
    source: import('../../core/config/PluginManagementService').PluginConfigSourceSnapshot,
    count: number,
  ): void {
    const headerEl = groupEl.createDiv({ cls: 'opencodian-plugin-source-header' });
    const titleEl = headerEl.createDiv({
      cls: 'opencodian-plugin-source-title',
      attr: { 'data-source-identity': this.describeSourceIdentity(source.path) },
    });
    titleEl.textContent = this.describeSourceIdentity(source.path);

    const badgesEl = headerEl.createDiv({ cls: 'opencodian-plugin-source-badges' });
    badgesEl.createSpan({
      cls: 'opencodian-plugin-source-count',
      attr: { 'aria-label': t('settings.plugins.detectedCount') },
      text: String(count),
    });
    badgesEl.createSpan({
      cls: `opencodian-plugin-source-scope-badge`,
      attr: { 'data-scope': source.scope },
      text: source.scope === 'global'
        ? t('settings.plugins.source.scopeGlobal')
        : t('settings.plugins.source.scopeProject'),
    });
    badgesEl.createSpan({
      cls: `opencodian-plugin-source-access-badge`,
      attr: { 'data-access': source.editable ? 'editable' : 'read-only' },
      text: source.editable
        ? t('settings.plugins.source.editable')
        : t('settings.plugins.source.readOnly'),
    });
  }

  private renderSourcePanelPath(
    groupEl: HTMLElement,
    source: import('../../core/config/PluginManagementService').PluginConfigSourceSnapshot,
  ): void {
    const statusInfo = this.describeSourceStatus(source);
    const pathRowEl = groupEl.createDiv({
      cls: 'opencodian-plugin-source-path',
      attr: {
        'data-path-status': statusInfo.status,
        'data-source-state': statusInfo.status,
      },
    });
    const labelEl = pathRowEl.createSpan({
      cls: 'opencodian-plugin-source-path-label',
      attr: { 'aria-label': t('settings.plugins.source.pathLabel') },
    });
    this.applyInlineCodeText(labelEl, source.path);
    pathRowEl.createSpan({
      cls: 'opencodian-plugin-source-path-status',
      text: t(statusInfo.labelKey),
    });
  }

  private renderSourcePanelMeta(
    groupEl: HTMLElement,
    source: import('../../core/config/PluginManagementService').PluginConfigSourceSnapshot,
  ): void {
    const metaEl = groupEl.createEl('dl', { cls: 'opencodian-plugin-source-meta' });
    this.appendMetaRow(metaEl, t('settings.plugins.source.scope'),
      source.scope === 'global'
        ? t('settings.plugins.source.scopeGlobal')
        : t('settings.plugins.source.scopeProject'),
    );
    this.appendMetaRow(metaEl, t('settings.plugins.source.access'),
      source.editable
        ? t('settings.plugins.source.editable')
        : t('settings.plugins.source.readOnly'),
    );

    if (source.error) {
      this.appendMetaRow(metaEl, t('settings.plugins.source.error'), source.error, { isError: true });
    } else if (!source.exists) {
      const noteEl = metaEl.createDiv({
        cls: 'opencodian-plugin-source-meta-note',
        attr: { 'data-note-kind': 'missing' },
      });
      this.applyInlineCodeText(noteEl, t('settings.plugins.source.missingHelp'));
    }
  }

  private appendMetaRow(
    metaEl: HTMLElement,
    label: string,
    value: string,
    options: { isError?: boolean } = {},
  ): void {
    const rowEl = metaEl.createDiv({
      cls: `opencodian-plugin-source-meta-row${options.isError ? ' is-error' : ''}`,
    });
    const labelEl = rowEl.createEl('dt', { cls: 'opencodian-plugin-source-meta-label' });
    this.applyInlineCodeText(labelEl, `${label}:`);
    const valueEl = rowEl.createEl('dd', { cls: 'opencodian-plugin-source-meta-value' });
    this.applyInlineCodeText(valueEl, value);
  }

  private renderManagedEntryList(options: {
    groupEl: HTMLElement;
    activeEntries: PluginEntry[];
    disabledEntries: PluginEntry[];
    kind: 'config' | 'directory';
    pluginService: PluginManagementService;
    refresh: () => Promise<void>;
  }): void {
    const { groupEl, activeEntries, disabledEntries, kind, pluginService, refresh } = options;
    const allEntries = [...activeEntries, ...disabledEntries];
    if (allEntries.length === 0) {
      this.renderSourcePanelEmpty(groupEl, t('settings.plugins.source.empty'));
      return;
    }

    this.renderLocalOnlyLabel(groupEl);

    const listEl = groupEl.createDiv({ cls: 'opencodian-plugin-source-list' });
    for (const entry of activeEntries) {
      this.renderManagedEntryRow(listEl, { entry, disabled: false, kind, pluginService, refresh });
    }
    for (const entry of disabledEntries) {
      this.renderManagedEntryRow(listEl, { entry, disabled: true, kind, pluginService, refresh });
    }
  }

  private renderReadOnlyEntryList(
    groupEl: HTMLElement,
    entries: PluginEntry[],
  ): void {
    if (entries.length === 0) {
      this.renderSourcePanelEmpty(groupEl, t('settings.plugins.source.empty'));
      return;
    }

    const listEl = groupEl.createDiv({ cls: 'opencodian-plugin-source-list' });
    for (const entry of entries) {
      const itemEl = listEl.createDiv({ cls: 'opencodian-plugin-source-item' });
      this.applyInlineCodeText(itemEl, this.describePluginEntry(entry));
    }
  }

  private renderSourcePanelEmpty(groupEl: HTMLElement, message: string): void {
    const emptyEl = groupEl.createDiv({
      cls: 'opencodian-plugin-source-empty',
      attr: { 'data-empty-kind': 'no-entries' },
    });
    this.applyInlineCodeText(emptyEl, message);
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
    containerEl.empty();

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
    const hostEl = containerEl.createDiv({ cls: 'opencodian-plugin-summary-list-host' });
    const listEl = hostEl.createDiv({ cls: 'opencodian-plugin-summary-list' });
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
      this.renderSourcePanelEmpty(groupEl, emptyText);
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
      this.renderSourcePanelEmpty(groupEl, emptyText);
      return;
    }

    this.renderLocalOnlyLabel(groupEl);

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

  private renderLocalOnlyLabel(containerEl: HTMLElement): void {
    if (this.plugin.settings.server.mode !== 'remote') {
      return;
    }
    containerEl.createDiv({
      cls: 'opencodian-plugin-local-only-label',
      attr: { 'data-local-only': 'true' },
      text: t('settings.plugins.localOnly.label'),
    });
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
    this.renderLocalOnlyLabel(rowEl);

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

  /**
   * Auto-restart the managed local server so plugin changes take effect
   * immediately. In remote mode, falls back to a manual restart notice.
   */
  private async restartManagedServerIfNeeded(): Promise<void> {
    if (this.plugin.settings.server.mode !== 'local') {
      new Notice(t('settings.plugins.restart.remote'));
      return;
    }

    try {
      const isRunning = await this.plugin.openCodeService.checkHealth();
      if (isRunning) {
        await this.plugin.openCodeService.stop();
      }
      await this.plugin.openCodeService.start();
    } catch (error) {
      logger.error('Auto-restart after plugin install failed:', error);
      new Notice(t('settings.plugins.restart.local'));
    }
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

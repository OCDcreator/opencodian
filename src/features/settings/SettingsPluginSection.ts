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

interface PluginEntryGroupRenderOptions {
  containerEl: HTMLElement;
  title: string;
  paths: PluginSourcePathRenderModel[];
  entries: PluginEntry[];
  emptyText: string;
}

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
    const refreshPluginSnapshot = async (showNotice = false) => {
      try {
        const snapshot = await pluginService.inspect(
          this.plugin.settings.server.mode,
          this.plugin.settings.pluginIsolationMode,
        );
        if (currentRunId !== this.refreshRunId) return;

        const overviewEl = containerEl.querySelector('[data-section-block="overview"] .opencodian-plugin-block-body') as HTMLElement;
        const globalSourcesEl = containerEl.querySelector('[data-section-block="global"] .opencodian-plugin-block-body') as HTMLElement;
        const projectDirEl = containerEl.querySelector('[data-section-block="project-directory"] .opencodian-plugin-block-body') as HTMLElement;
        const omoEl = containerEl.querySelector('[data-section-block="omo"] .opencodian-plugin-block-body') as HTMLElement;

        if (overviewEl) this.renderPluginOverview(overviewEl, snapshot);
        if (globalSourcesEl) this.renderPluginSources(globalSourcesEl, snapshot);
        if (projectDirEl) this.renderPluginProjectDirectory(projectDirEl, snapshot);
        if (omoEl) this.renderPluginOmoSection(omoEl, snapshot);

        if (showNotice) new Notice(t('settings.plugins.refresh.success'));
      } catch (error) {
        if (currentRunId !== this.refreshRunId) return;
        logger.error('Failed to refresh plugin snapshot:', error);
        if (showNotice) new Notice(t('settings.plugins.refresh.failed'));
      }
    };

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
        this.renderPluginSources(globalSourcesEl, snapshot);
        this.renderPluginProjectDirectory(projectDirectoryEl, snapshot);
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
              await refreshPluginSnapshot(false);
              new Notice(t('settings.plugins.projectConfig.saved'));
              new Notice(
                this.plugin.settings.server.mode === 'local'
                  ? t('settings.plugins.restart.local')
                  : t('settings.plugins.restart.remote'),
              );
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
            new Notice(
              this.plugin.settings.server.mode === 'local'
                ? t('settings.plugins.restart.local')
                : t('settings.plugins.restart.remote'),
            );
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
        value: String(snapshot.projectConfigPlugins.length),
      },
      {
        label: t('settings.plugins.overview.projectDirectoryCount'),
        value: String(snapshot.projectDirectoryPlugins.length),
      },
    ];

    this.renderPluginKeyValueRows(containerEl, rows);
  }

  private renderPluginSources(containerEl: HTMLElement, snapshot: PluginEnvironmentSnapshot): void {
    containerEl.empty();

    this.renderPluginEntryGroup({
      containerEl,
      title: t('settings.plugins.global.configTitle'),
      paths: this.createSingleSourcePath(snapshot.globalConfigPath),
      entries: snapshot.globalConfigPlugins,
      emptyText: t('settings.plugins.none'),
    });
    this.renderPluginEntryGroup({
      containerEl,
      title: t('settings.plugins.global.directoryTitle'),
      paths: this.createDirectorySourcePaths(snapshot.globalDirectories),
      entries: snapshot.globalDirectoryPlugins,
      emptyText: t('settings.plugins.none'),
    });
    this.renderPluginEntryGroup({
      containerEl,
      title: t('settings.plugins.projectConfig.title'),
      paths: this.createSingleSourcePath(snapshot.projectConfigPath),
      entries: snapshot.projectConfigPlugins,
      emptyText: t('settings.plugins.none'),
    });
  }

  private renderPluginProjectDirectory(containerEl: HTMLElement, snapshot: PluginEnvironmentSnapshot): void {
    containerEl.empty();
    this.renderPluginEntryGroup({
      containerEl,
      title: t('settings.plugins.projectDirectory.filesTitle'),
      paths: this.createDirectorySourcePaths(snapshot.projectDirectories),
      entries: snapshot.projectDirectoryPlugins,
      emptyText: t('settings.plugins.projectDirectory.empty'),
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

  private renderPluginEntryGroup(options: PluginEntryGroupRenderOptions): void {
    const { containerEl, title, paths, entries, emptyText } = options;
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
